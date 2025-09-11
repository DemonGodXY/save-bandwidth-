const axios = require("axios");
const sharp = require("sharp");

module.exports = async (req, res) => {
  let { url, format = "jpeg", quality = "60" } = req.query;

  if (!url) {
    res.send("Missing ?url= parameter");
    return;
  }

  try {
    // Decode the provided encoded URI
    const decodedUrl = decodeURIComponent(url);

    // Normalize format
    const fmt = format.toLowerCase();
    const allowedFormats = ["jpeg", "jpg", "png", "webp", "avif"];
    if (!allowedFormats.includes(fmt)) {
      res.status(400).send("Unsupported format: " + fmt);
      return;
    }

    // Fetch the image as raw bytes
    const response = await axios.get(decodedUrl, { responseType: "arraybuffer" });

    // Compress & convert
    const compressed = await sharp(response.data)
      .toFormat(fmt === "jpg" ? "jpeg" : fmt, { quality: parseInt(quality, 10) })
      .toBuffer();

    // Send compressed image
    res.setHeader("Content-Type", `image/${fmt === "jpg" ? "jpeg" : fmt}`);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(compressed);

  } catch (err) {
    res.status(500).send("Compression failed: " + err.message);
  }
};
