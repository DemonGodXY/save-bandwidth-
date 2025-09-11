const axios = require("axios");
const sharp = require("sharp");

module.exports = async (req, res) => {
  const { url, format = "jpeg", quality = "60" } = req.query;

  if (!url) {
    res.status(400).send("Missing ?url= parameter");
    return;
  }

  try {
    // Fetch the original image as raw bytes
    const response = await axios.get(url, { responseType: "arraybuffer" });

    // Convert with sharp to requested format + quality
    const fmt = format.toLowerCase(); // make sure it's lowercase
    const compressed = await sharp(response.data)
      .toFormat(fmt, { quality: parseInt(quality, 10) })
      .toBuffer();

    // Send compressed image with correct headers
    res.setHeader("Content-Type", `image/${fmt}`);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(compressed);

  } catch (err) {
    res.status(500).send("Compression failed: " + err.message);
  }
};
