const sharp = require('sharp');
const axios = require('axios');

// Configuration
const config = {
    image: {
        maxWidth: 1920,
        maxHeight: 1080,
        defaultQuality: 80,
        defaultFormat: 'webp',
        timeout: 10000
    },
    security: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedDomains: [],
        blockedDomains: []
    }
};

module.exports = async (req, res) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    // Set CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    try {
        const { url, width, height, quality, grayscale, format } = req.query;
        
        // Health check endpoint
        if (req.path === '/health') {
            return res.json({ 
                status: 'ok', 
                timestamp: new Date().toISOString(),
                service: 'ImageCompressionProxy'
            });
        }
        
        // Validate required parameters
        if (!url) {
            return res.send('URL parameter is required');
        }

        // Set default values
        const targetWidth = width ? parseInt(width) : null;
        const targetHeight = height ? parseInt(height) : null;
        const targetQuality = quality ? parseInt(quality) : config.image.defaultQuality;
        const useGrayscale = grayscale === 'true';
        const targetFormat = format || config.image.defaultFormat;

        // Validate parameters
        if (targetWidth && (targetWidth < 1 || targetWidth > config.image.maxWidth)) {
            return res.status(400).json({ 
                error: `Width must be between 1 and ${config.image.maxWidth}` 
            });
        }

        if (targetHeight && (targetHeight < 1 || targetHeight > config.image.maxHeight)) {
            return res.status(400).json({ 
                error: `Height must be between 1 and ${config.image.maxHeight}` 
            });
        }

        if (targetQuality < 1 || targetQuality > 100) {
            return res.status(400).json({ 
                error: 'Quality must be between 1 and 100' 
            });
        }

        // Security check for domains
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;

        if (config.security.blockedDomains.includes(hostname)) {
            return res.status(403).json({ error: 'Domain is blocked' });
        }

        if (config.security.allowedDomains.length > 0 && 
            !config.security.allowedDomains.includes(hostname)) {
            return res.status(403).json({ error: 'Domain not allowed' });
        }

        // Download the image
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: config.image.timeout,
            headers: {
                'User-Agent': 'ImageCompressionProxy/1.0',
                'Accept': 'image/*'
            },
            maxContentLength: config.security.maxFileSize,
            maxRedirects: 5
        });

        // Validate that we got an image
        const contentType = response.headers['content-type'];
        if (!contentType || !contentType.startsWith('image/')) {
            return res.status(400).json({ error: 'URL does not point to a valid image' });
        }

        // Check content length
        const contentLength = parseInt(response.headers['content-length'] || '0');
        if (contentLength > config.security.maxFileSize) {
            return res.status(413).json({ 
                error: `Image too large. Maximum size is ${config.security.maxFileSize / 1024 / 1024}MB` 
            });
        }

        // Create Sharp instance from the image buffer
        let sharpInstance = sharp(response.data);

        // Apply transformations
        const transformations = sharpInstance.resize(targetWidth, targetHeight, {
            fit: 'inside',
            withoutEnlargement: true,
            kernel: 'lanczos3'
        });

        // Apply grayscale if requested
        if (useGrayscale) {
            transformations.grayscale();
        }

        // Set format and quality
        let formatOptions = { quality: targetQuality };
        if (targetFormat === 'jpeg') {
            formatOptions.progressive = true;
            formatOptions.mozjpeg = true;
        } else if (targetFormat === 'webp') {
            formatOptions.lossless = false;
            formatOptions.effort = 6;
        } else if (targetFormat === 'png') {
            formatOptions.compressionLevel = 9;
            formatOptions.progressive = true;
        }

        transformations.toFormat(targetFormat, formatOptions);

        // Get image metadata for response headers
        const metadata = await transformations.metadata();

        // Set appropriate headers
        res.setHeader('Content-Type', `image/${targetFormat}`);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('X-Proxy-By', 'ImageCompressionProxy/1.0');
        res.setHeader('X-Original-Size', contentLength);
        res.setHeader('X-Processed-Width', metadata.width);
        res.setHeader('X-Processed-Height', metadata.height);
        res.setHeader('X-Processed-Format', metadata.format);

        // Get the processed image buffer
        const processedImage = await transformations.toBuffer();

        // Send the processed image
        res.send(processedImage);

    } catch (error) {
        console.error('Error processing image:', error.message);
        
        // Handle specific error types
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return res.status(408).json({ error: 'Request timeout' });
        }
        
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return res.status(502).json({ error: 'Failed to connect to image server' });
        }
        
        if (error.response) {
            return res.status(error.response.status).json({ 
                error: `Failed to fetch image: ${error.response.status}` 
            });
        }
        
        if (error.message.includes('Invalid image')) {
            return res.status(400).json({ error: 'Invalid image format' });
        }
        
        if (error.message.includes('Input buffer contains unsupported image format')) {
            return res.status(400).json({ error: 'Unsupported image format' });
        }
        
        // Generic error
        return res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
