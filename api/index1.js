// api/proxy.js
// Serverless Bandwidth Hero-style proxy for Vercel (CJS)

const axios = require("axios");
const sharp = require("sharp");

module.exports = async function handler(req, res) {
  try {
    const { url, quality, grayscale, format } = req.query;

    if (!url) {
      res.status(400).send("Missing required ?url= parameter");
      return;
    }

    // Defaults
    const q = parseInt(quality || "60", 10);
    const makeGray = grayscale === "true";
    let outFormat = format ? format.toLowerCase() : null;

    // Auto-detect if WebP supported
    const acceptHeader = req.headers["accept"] || "";
    const clientSupportsWebP = acceptHeader.includes("image/webp");

    if (!outFormat) {
      outFormat = clientSupportsWebP ? "webp" : "jpeg";
    }

    // Fetch source image as stream
    const response = await axios.get(url, { responseType: "stream" });

    // Build transform pipeline
    let transformer = sharp();
    if (makeGray) transformer = transformer.grayscale();

    if (outFormat === "webp") {
      transformer = transformer.webp({ quality: q, effort: 1 }); // fast WebP
      res.setHeader("Content-Type", "image/webp");
    } else if (outFormat === "png") {
      transformer = transformer.png({ quality: q, compressionLevel: 9 });
      res.setHeader("Content-Type", "image/png");
    } else {
      transformer = transformer.jpeg({ quality: q, mozjpeg: true });
      res.setHeader("Content-Type", "image/jpeg");
    }

    // Pipe source -> sharp -> response
    response.data.pipe(transformer).pipe(res);

    response.data.on("error", (err) => {
      console.error("Source stream error:", err.message);
      if (!res.headersSent) res.status(500).send("Source stream error");
      else res.end();
    });
    transformer.on("error", (err) => {
      console.error("Sharp transform error:", err.message);
      if (!res.headersSent) res.status(500).send("Transform error");
      else res.end();
    });

  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(500).send("Proxy failed");
  }
};
