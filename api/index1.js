// File: api/process.js
const sharp = require("sharp");
const axios = require("axios");
const os = require("os");

sharp.concurrency(Math.max(1, Math.min(4, os.cpus().length - 1)));

const config = {
  image: {
    maxWidth: 16383,
    maxHeight: 16383,
    defaultQuality: 80,
    defaultFormat: "webp",
    timeout: 1000, // slightly lower for responsiveness
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

    // ✅ Sanitize inputs
    const targetWidth = width ? parseInt(width, 10) : null;
    const targetHeight = height ? parseInt(height, 10) : null;
    const targetQuality = quality ? parseInt(quality, 10) : config.image.defaultQuality;
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

    // 📥 Fully buffer the image for faster sharp usage
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: config.image.timeout,
      headers: { "User-Agent": "ImageCompressionProxy/fast-mode" },
      maxRedirects: 3,
    });

    const contentType = response.headers["content-type"];
    if (!contentType || !contentType.startsWith("image/")) {
      res.status(400).json({ error: "URL is not a valid image" });
      return;
    }

    const contentLength = Number(response.headers["content-length"]) || response.data.length;
    if (contentLength > config.security.maxFileSize) {
      res.status(413).json({
        error: `Image too large (max ${config.security.maxFileSize / 1024 / 1024} MB)`,
      });
      return;
    }

    // 🚀 Single sharp decode
    const inputBuffer = Buffer.from(response.data);
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    let resizeOptions = null;
    if (
      (metadata.width > config.image.maxWidth) ||
      (metadata.height > config.image.maxHeight) ||
      targetWidth || targetHeight
    ) {
      resizeOptions = {
        width: targetWidth || Math.min(metadata.width, config.image.maxWidth),
        height: targetHeight || Math.min(metadata.height, config.image.maxHeight),
        fit: "inside",
        kernel: "lanczos3",
        withoutEnlargement: true,
      };
    }

    if (!["jpeg", "png", "webp", "avif"].includes(targetFormat)) {
      targetFormat = "webp";
    }

    // Format-specific speed tweaks
    let formatOptions = { quality: targetQuality };
    if (targetFormat === "jpeg") formatOptions = { ...formatOptions, mozjpeg: true };
    if (targetFormat === "webp") formatOptions = { ...formatOptions, effort: 1 };
    if (targetFormat === "png") formatOptions = { ...formatOptions, compressionLevel: 3 };
    if (targetFormat === "avif") formatOptions = { ...formatOptions, speed: 8 };

    let processed = image;
    if (resizeOptions) processed = processed.resize(resizeOptions);
    if (useGrayscale) processed = processed.grayscale();
    processed = processed.toFormat(targetFormat, formatOptions);

    // 🔥 Response headers
    res.setHeader("Content-Type", `image/${targetFormat}`);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Original-Size", contentLength);
    res.setHeader("X-Original-Width", metadata.width);
    res.setHeader("X-Original-Height", metadata.height);

    // 🚀 Stream result
    processed.pipe(res);

  } catch (error) {
    console.error("Error processing image:", error.message);
    res.status(500).json({ error: "Internal server error", message: error.message });
  }
};
