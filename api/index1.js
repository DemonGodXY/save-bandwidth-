const sharp = require("sharp");
const https = require("https");
const http = require("http");
const { URL } = require("url");

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
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const { url, quality, grayscale, format } = req.query;
  if (!url) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "URL parameter is required" }));
    return;
  }

  const targetQuality = parseInt(quality, 10) || config.image.defaultQuality;
  let targetFormat = ["jpeg", "png", "webp", "avif"].includes(format)
    ? format
    : config.image.defaultFormat;

  try {
    const imageUrl = new URL(url);
    const client = imageUrl.protocol === "https:" ? https : http;

    const request = client.get(
      imageUrl,
      {
        timeout: config.image.timeout,
        headers: { "User-Agent": "ImageProxy/stream" },
      },
      (response) => {
        const contentType = response.headers["content-type"] || "";
        const contentLength = Number(response.headers["content-length"]) || 0;

        if (!contentType.startsWith("image/")) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Not a valid image" }));
          response.resume();
          return;
        }

        if (contentLength > config.security.maxFileSize) {
          res.statusCode = 413;
          res.end(
            JSON.stringify({
              error: `Image too large (max ${
                config.security.maxFileSize / 1024 / 1024
              } MB)`,
            })
          );
          response.resume();
          return;
        }

        // Create sharp instance from stream
        const sharpStream = sharp();

        response.pipe(sharpStream);

        (async () => {
          try {
            const metadata = await sharpStream.metadata();

            let transformer = sharp();

            // Resize only if larger than max safe size
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
            res.setHeader(
              "Cache-Control",
              "public, max-age=31536000, immutable"
            );
            res.setHeader(
              "Content-Disposition",
              `inline; filename="processed.${targetFormat}"`
            );
            res.setHeader("X-Proxy-By", "FastImageProxy-Stream");
            res.setHeader("X-Original-Width", metadata.width);
            res.setHeader("X-Original-Height", metadata.height);
            res.setHeader(
              "X-Resize-Applied",
              metadata.width > config.image.maxWidth ||
                metadata.height > config.image.maxHeight
                ? "true"
                : "false"
            );

            // Re-pipe original stream into transformer → client
            response.pipe(sharp().resize()); // dummy fix
          } catch (metaErr) {
            console.error("Metadata error:", metaErr.message);
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Invalid image" }));
          }
        })();
      }
    );

    request.on("error", (err) => {
      console.error("Request error:", err.message);
      res.statusCode = 502;
      res.end(JSON.stringify({ error: "Image fetch failed" }));
    });

    request.setTimeout(config.image.timeout, () => {
      request.abort();
      res.statusCode = 408;
      res.end(JSON.stringify({ error: "Request timeout" }));
    });
  } catch (err) {
    console.error("Processing error:", err.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Processing failed" }));
  }
};
