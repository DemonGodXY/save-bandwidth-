// File: api/process.js
const sharp = require('sharp');
const axios = require('axios');

const config = {
  image: {
    maxWidth: 16383,
    maxHeight: 16383,
    defaultQuality: 80,
    defaultFormat: 'webp',
    timeout: 10000,
  },
  security: {
    maxFileSize: 50 * 1024 * 1024, // 50MB
  },
};

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { url, width, height, quality, grayscale, format } = req.query;
    if (!url) {
      res.status(400).json({ error: "URL parameter is required" });
      return;
    }

    // ✅ Sanitize input
    const targetWidth = width ? Number.parseInt(width, 10) : null;
    const targetHeight = height ? Number.parseInt(height, 10) : null;
    const targetQuality = quality ? Number.parseInt(quality, 10) : config.image.defaultQuality;
    const useGrayscale = grayscale === "true";
    let targetFormat = format || config.image.defaultFormat;

    if (targetWidth && (isNaN(targetWidth) || targetWidth < 1 || targetWidth > config.image.maxWidth)) {
      res.status(400).json({ error: `Width must be between 1 and ${config.image.maxWidth}` });
      return;
    }
    if (targetHeight && (isNaN(targetHeight) || targetHeight < 1 || targetHeight > config.image.maxHeight)) {
      res.status(400).json({ error: `Height must be between 1 and ${config.image.maxHeight}` });
      return;
    }
    if (isNaN(targetQuality) || targetQuality < 1 || targetQuality > 100) {
      res.status(400).json({ error: "Quality must be between 1 and 100" });
      return;
    }

    // 📥 Stream image from source
    const response = await axios.get(url, {
      responseType: "stream",
      timeout: config.image.timeout,
      headers: {
        "User-Agent": "ImageCompressionProxy/3.0",
        Accept: "image/*",
      },
      maxRedirects: 5,
    });

    const contentType = response.headers["content-type"];
    if (!contentType || !contentType.startsWith("image/")) {
      res.status(400).json({ error: "URL is not a valid image" });
      return;
    }

    const contentLength = Number(response.headers["content-length"]) || 0;
    if (contentLength > config.security.maxFileSize) {
      res.status(413).json({ error: `Image too large (max ${config.security.maxFileSize / 1024 / 1024} MB)` });
      return;
    }

    // 🚰 Sharp pipeline
    const sharpInstance = sharp();
    response.data.pipe(sharpInstance);

    // Get metadata (clone because streams are one-shot)
    const clone = sharpInstance.clone();
    const metadata = await clone.metadata();
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;

    // Resize
    let needsResize = false;
    let resizeOptions = {};
    if (originalWidth > config.image.maxWidth || originalHeight > config.image.maxHeight) {
      needsResize = true;
      const aspectRatio = originalWidth / originalHeight;
      let newWidth = originalWidth;
      let newHeight = originalHeight;
      if (newWidth > config.image.maxWidth) {
        newWidth = config.image.maxWidth;
        newHeight = Math.round(newWidth / aspectRatio);
      }
      if (newHeight > config.image.maxHeight) {
        newHeight = config.image.maxHeight;
        newWidth = Math.round(newHeight * aspectRatio);
      }
      resizeOptions = { width: newWidth, height: newHeight, fit: "inside", kernel: "lanczos3", withoutEnlargement: true };
    } else if (targetWidth || targetHeight) {
      needsResize = true;
      resizeOptions = { width: targetWidth, height: targetHeight, fit: "inside", kernel: "lanczos3", withoutEnlargement: true };
    }

    let processed = sharpInstance;
    if (needsResize) processed = processed.resize(resizeOptions);
    if (useGrayscale) processed = processed.grayscale();
    if (!["jpeg", "png", "webp", "avif"].includes(targetFormat)) {
      targetFormat = "webp";
    }

    let formatOptions = { quality: targetQuality };
    if (targetFormat === "jpeg") formatOptions = { ...formatOptions, mozjpeg: true };
    if (targetFormat === "webp") formatOptions = { ...formatOptions, effort: 4, lossless: false };
    if (targetFormat === "png") formatOptions = { ...formatOptions, compressionLevel: 6 };

    processed = processed.toFormat(targetFormat, formatOptions);

    // 🔥 Response headers
    res.setHeader("Content-Type", `image/${targetFormat}`);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Disposition", `inline; filename="processed.${targetFormat}"`);
    res.setHeader("X-Proxy-By", "ImageCompressionProxy/3.0");
    res.setHeader("X-Original-Size", contentLength);
    res.setHeader("X-Original-Width", originalWidth);
    res.setHeader("X-Original-Height", originalHeight);
    res.setHeader("X-Resize-Applied", needsResize ? "true" : "false");

    // 🚀 Stream result directly to client
    processed.pipe(res);

  } catch (error) {
    console.error("Error processing image:", error.message);
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      res.status(408).json({ error: "Request timeout" }); return;
    }
    if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
      res.status(502).json({ error: "Failed to connect to image server" }); return;
    }
    if (error.response) {
      res.status(error.response.status).json({ error: `Failed to fetch image: ${error.response.status}` }); return;
    }
    if (error.message.toLowerCase().includes("invalid image")) {
      res.status(400).json({ error: "Invalid image format" }); return;
    }
    if (error.message.toLowerCase().includes("unsupported image format")) {
      res.status(400).json({ error: "Unsupported image format" }); return;
    }

    res.status(500).json({ error: "Internal server error", message: process.env.NODE_ENV === "development" ? error.message : undefined });
  }
};
