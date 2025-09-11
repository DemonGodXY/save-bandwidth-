// api/proxy.js
// Serverless Image Proxy for Vercel (CJS + sharp.toFormat)

const axios = require("axios");
const sharp = require("sharp");

module.exports = async function handler(req, res) {
  try {
    let { url, quality, grayscale, format } = req.query;

    if (!url) {
      res.status(400).send("Missing required ?url= parameter");
      return;
    }

    // Decode safe URL
    try {
      url = decodeURIComponent(url);
    } catch (err) {
      return res.status(400).send("Invalid encoded URL");
    }

    // Defaults
    const q = parseInt(quality || "60", 10);
    const makeGray = grayscale === "true";
    let outFormat = format ? format.toLowerCase() : null;

    // Auto-detect WebP support when format not forced
    const acceptHeader = req.headers["accept"] || "";
    if (!outFormat && acceptHeader.includes("image/webp")) {
      outFormat = "webp";
    }
    if (!outFormat) outFormat = "jpeg"; // fallback

    // Fetch remote image as stream
    const response = await axios.get(url, { responseType: "stream" });

    // Build transformer
    let transformer = sharp();
    if (makeGray) transformer = transformer.grayscale();

    // Format-specific options
    const formatOptions = {};
    if (outFormat === "webp") {
      formatOptions.quality = q;
      formatOptions.effort = 1; // fast WebP in serverless
      res.setHeader("Content-Type", "image/webp");
    } else if (outFormat === "png") {
      formatOptions.quality = q; // not strictly used by sharp PNG, but accepted
      formatOptions.compressionLevel = 9;
      res.setHeader("Content-Type", "image/png");
    } else {
      outFormat = "jpeg"; // normalize jpeg/jpg
      formatOptions.quality = q;
      formatOptions.mozjpeg = true;
      res.setHeader("Content-Type", "image/jpeg");
    }

    // Use sharp.toFormat to unify
    transformer = transformer.toFormat(outFormat, formatOptions);

    // Pipe remote -> sharp -> client
    response.data.pipe(transformer).pipe(res);

    // Error handling
    response.data.on("error", (err) => {
      console.error("Source error:", err.message);
      if (!res.headersSent) res.status(500).send("Source stream error");
      else res.end();
    });
    transformer.on("error", (err) => {
      console.error("Sharp error:", err.message);
      if (!res.headersSent) res.status(500).send("Transform error");
      else res.end();
    });
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy failed");
  }
};
