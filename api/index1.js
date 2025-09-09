const sharp = require("sharp");
const axios = require("axios");

const config = {
  image: {
    maxWidth: 16383,
    maxHeight: 16383,
    defaultQuality: 80,
    defaultFormat: "webp",
    timeout: 10000,
  },
  security: {
    maxFileSize: 10 * 1024 * 1024, // 10 MB
  },
};

module.exports = async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { url, quality, grayscale, format } = req.query;
    if (!url) return res.status(400).json({ error: "URL parameter is required" });

    const targetQuality = parseInt(quality, 10) || config.image.defaultQuality;
    let targetFormat = ["jpeg", "png", "webp", "avif"].includes(format)
      ? format
      : config.image.defaultFormat;

    // 📥 Download image into buffer
    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: config.image.timeout,
      maxRedirects: 5,
      headers: { "User-Agent": "ImageProxy/fast", Accept: "image/*" },
    });

    const contentType = response.headers["content-type"] || "";
    const contentLength =
      Number(response.headers["content-length"]) || response.data.length;
    if (!contentType.startsWith("image/"))
      return res.status(400).json({ error: "Not a valid image" });
    if (contentLength > config.security.maxFileSize)
      return res.status(413).json({
        error: `Image too large (max ${
          config.security.maxFileSize / 1024 / 1024
        } MB)`,
      });

    // 🧐 Check metadata to ensure Sharp-safe dimensions
    const metadata = await sharp(response.data).metadata();
    let resizeOptions = {};

    if (
      metadata.width > config.image.maxWidth ||
      metadata.height > config.image.maxHeight
    ) {
      resizeOptions = {
        width: config.image.maxWidth,
        height: config.image.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      };
    }

    // 🚀 Process
    let processed = sharp(response.data);
    if (Object.keys(resizeOptions).length) {
      processed = processed.resize(resizeOptions);
    }
    if (grayscale === "true") processed = processed.grayscale();

    const formatOptions = {
      quality: targetQuality,
      ...(targetFormat === "jpeg" && { mozjpeg: true }),
      ...(targetFormat === "png" && { compressionLevel: 6 }),
      ...(targetFormat === "webp" && { effort: 0, lossless: false }),
    };

    const outputBuffer = await processed
      .toFormat(targetFormat, formatOptions)
      .toBuffer();

    // 🔥 Send result
    res.setHeader("Content-Type", `image/${targetFormat}`);
    res.setHeader(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );
    res.setHeader(
      "Content-Disposition",
      `inline; filename="processed.${targetFormat}"`
    );
    res.setHeader("X-Proxy-By", "FastImageProxy");
    res.setHeader("X-Original-Width", metadata.width);
    res.setHeader("X-Original-Height", metadata.height);

    res.end(outputBuffer);
  } catch (error) {
    console.error("Error:", error.message);
    if (["ECONNABORTED", "ETIMEDOUT"].includes(error.code))
      return res.status(408).json({ error: "Request timeout" });
    if (["ENOTFOUND", "ECONNREFUSED"].includes(error.code))
      return res
        .status(502)
        .json({ error: "Failed to connect to image server" });

    res
      .status(500)
      .json({ error: "Image processing failed", detail: error.message });
  }
};
