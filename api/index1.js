const axios = require("axios");
const sharp = require("sharp");

module.exports = async (req, res) => {
  const { url, quality = "60" } = req.query;

  if (!url) {
    res.status(400).send("Missing ?url= parameter");
    return;
  }

  try {
    // Fetch the image as raw data
    const response = await axios.get(url, { responseType: "arraybuffer" });

    // Compress with Sharp
    const compressed = await sharp(response.data)
      .jpeg({ quality: parseInt(quality, 10) })
      .toBuffer();

    // Send back the compressed image
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(compressed);

  } catch (err) {
    res.status(500).send("Compression failed: " + err.message);
  }
};
