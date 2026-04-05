const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const AAR_URL =
  process.env.FFMPEG_KIT_AAR_URL ||
  "https://d2s577d19g6410.cloudfront.net/ffmpeg-gpl-version/ffmpeg-kit-full-gpl-6.0-2.LTS.aar";

const TARGET_DIR = path.join(__dirname, "android", "libs");
const TARGET = path.join(TARGET_DIR, "ffmpeg-kit-full-gpl-6.0-2.LTS.aar");

if (fs.existsSync(TARGET) && fs.statSync(TARGET).size > 50 * 1024 * 1024) {
  console.log("[ffmpeg-kit] AAR already present, skipping download");
  process.exit(0);
}

console.log("[ffmpeg-kit] Downloading full-gpl AAR from", AAR_URL);
fs.mkdirSync(TARGET_DIR, { recursive: true });

function download(url, dest, redirects = 0) {
  if (redirects > 5) {
    console.error("[ffmpeg-kit] Too many redirects");
    process.exit(1);
  }
  const client = url.startsWith("https") ? https : http;
  client
    .get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest, redirects + 1);
        return;
      }
      if (res.statusCode !== 200) {
        console.error("[ffmpeg-kit] Download failed:", res.statusCode);
        process.exit(1);
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
        console.log(`[ffmpeg-kit] AAR downloaded (${size} MB)`);
      });
      file.on("error", (err) => {
        try {
          fs.unlinkSync(dest);
        } catch {}
        console.error("[ffmpeg-kit] Write failed:", err);
        process.exit(1);
      });
    })
    .on("error", (err) => {
      console.error("[ffmpeg-kit] Request failed:", err);
      process.exit(1);
    });
}

download(AAR_URL, TARGET);
