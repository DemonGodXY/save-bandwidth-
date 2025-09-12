// api/proxy.js
import http from "http";
import https from "https";
import sharp from "sharp";
import url from "url";

// helper to fetch image from remote URL
async function fetchImage(srcUrl) {
  return new Promise((resolve, reject) => {
    const client = srcUrl.startsWith("https") ? https : http;
    client
      .get(srcUrl, (res) => {
        if (res.statusCode !== 200) return reject(new Error("Fetch failed"));
        const data = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
      })
      .on("error", reject);
  });
}

// Vercel serverless handler
export default async function handler(req, res) {
  const query = url.parse(req.url, true).query;
  const imageUrl = query.url;
  const format = query.format || "webp"; // default WebP
  const quality = query.quality ? parseInt(query.quality, 10) : 50;

  if (!imageUrl) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/plain");
    return res.end("Usage: /api/proxy?url=<image_url>&format=webp&quality=50");
  }

  try {
    const original = await fetchImage(imageUrl);

    const compressed = await sharp(original)
      .toFormat(format, { quality })
      .toBuffer();

    res.statusCode = 200;
    res.setHeader("Content-Type", `image/${format}`);
    res.end(compressed);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain");
    res.end("Error: " + err.message);
  }
}
