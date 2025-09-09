const sharp = require("sharp");
const fetch = require("node-fetch");
const { pipeline } = require("stream");
const { promisify } = require("util");

const streamPipeline = promisify(pipeline);

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
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }

  const { url, quality, grayscale, format } = req.query;
  if (!url) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ error: "URL parameter is required" }));
  }

  const targetQuality = parseInt(quality, 10) || config.image.defaultQuality;
  let targetFormat = ["jpeg", "png", "webp", "avif"].includes(format)
    ? format
    : config.image.defaultFormat;

  try {
    const response = await fetch(url, {
      timeout: config.image.timeout,
      headers: { "User-Agent": "ImageProxy/stream", Accept: "image/*" },
    });

    if (!response.ok) {
      res.statusCode = 502;
      return res.end(
        JSON.stringify({ error: `Failed to fetch image: ${response.status}` })
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const contentLength = Number(response.headers.get("content-length")) || 0;

    if (!contentType.startsWith("image/")) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: "Not a valid image" }));
    }

    if (contentLength > config.security.maxFileSize) {
      res.statusCode = 413;
      return res.end(
        JSON.stringify({
          error: `Image too large (max ${
            config.security.maxFileSize / 1024 / 1024
          } MB)`,
        })
      );
    }

    // First clone the stream to read metadata
    const buffer = await response.clone().arrayBuffer();
    const metadata = await sharp(Buffer.from(buffer)).metadata();

    let transformer = sharp();

    // Resize ONLY if the image exceeds Sharp's max size
    if (
      metadata.width > config.image.maxWidth ||
      metadata.height > config.image.maxHeight
    ) {
      transformer = transformer.resize({
        width: config.image.maxWidth,
        height: config.image.maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (grayscale === "true") transformer = transformer.grayscale();

    const formatOptions = {
      quality: targetQuality,
      ...(targetFormat === "jpeg" && { mozjpeg: true }),
      ...(targetFormat === "png" && { compressionLevel: 6 }),
      ...(targetFormat === "webp" && { effort: 4, lossless: false }),
    };

    transformer = transformer.toFormat(targetFormat, formatOptions);

    // Headers
    res.setHeader("Content-Type", `image/${targetFormat}`);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="processed.${targetFormat}"`
    );
    res.setHeader("X-Proxy-By", "FastImageProxy-Pipeline");
    res.setHeader("X-Original-Width", metadata.width);
    res.setHeader("X-Original-Height", metadata.height);

    // 🚀 Safer stream pipeline: response.body → transformer → res
    await streamPipeline(response.body, transformer, res);
  } catch (err) {
    console.error("Error:", err.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Processing failed" }));
  }
};
