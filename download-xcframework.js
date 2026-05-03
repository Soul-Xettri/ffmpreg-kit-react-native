const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ZIP_URL =
  process.env.FFMPEG_KIT_IOS_XCFRAMEWORK_URL ||
  "https://d2s577d19g6410.cloudfront.net/ffmpeg-gpl-version/ffmpeg-kit-full-gpl-6.0-2-ios-xcframework.zip";

const TARGET_DIR = path.join(
  __dirname,
  "ffmpreg-kit",
  "prebuilt",
  "bundle-apple-xcframework-ios"
);
const ZIP_PATH = path.join(__dirname, ".tmp-ios-xcframework.zip");
const SENTINEL = path.join(TARGET_DIR, "ffmpegkit.xcframework");

if (fs.existsSync(SENTINEL)) {
  console.log("[ffmpeg-kit] iOS xcframeworks already present, skipping download");
  process.exit(0);
}

console.log("[ffmpeg-kit] Downloading iOS xcframeworks from", ZIP_URL);
fs.mkdirSync(TARGET_DIR, { recursive: true });

function download(url, dest, redirects = 0) {
  if (redirects > 5) {
    console.error("[ffmpeg-kit] Too many redirects");
    process.exit(1);
  }
  const client = url.startsWith("https") ? https : http;
  const options = {
    headers: {
      "User-Agent": "ffmpeg-kit-postinstall/1.0 (+node)",
      "Accept": "*/*",
    },
  };
  client
    .get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest, redirects + 1);
        return;
      }
      if (res.statusCode !== 200) {
        console.error("[ffmpeg-kit] Download failed:", res.statusCode);
        let body = "";
        res.on("data", (c) => { if (body.length < 500) body += c.toString(); });
        res.on("end", () => {
          console.error("[ffmpeg-kit] Response body:", body.slice(0, 400));
          process.exit(1);
        });
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => extract());
      });
      file.on("error", (err) => {
        try { fs.unlinkSync(dest); } catch {}
        console.error("[ffmpeg-kit] Write failed:", err);
        process.exit(1);
      });
    })
    .on("error", (err) => {
      console.error("[ffmpeg-kit] Request failed:", err);
      process.exit(1);
    });
}

function extract() {
  const size = (fs.statSync(ZIP_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`[ffmpeg-kit] Downloaded zip (${size} MB), extracting...`);

  const TMP = path.join(__dirname, ".tmp-ios-extract");
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(TMP, { recursive: true });

  try {
    execSync(`unzip -q "${ZIP_PATH}" -d "${TMP}"`);
  } catch (err) {
    console.error("[ffmpeg-kit] unzip failed:", err.message);
    process.exit(1);
  }

  const found = [];
  const stack = [TMP];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.endsWith(".xcframework")) found.push(full);
        else stack.push(full);
      }
    }
  }

  if (found.length === 0) {
    console.error("[ffmpeg-kit] No xcframeworks found in archive");
    process.exit(1);
  }

  for (const xcf of found) {
    const name = path.basename(xcf);
    const dest = path.join(TARGET_DIR, name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(xcf, dest, { recursive: true });
    console.log(`[ffmpeg-kit]   ${name}`);
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  fs.unlinkSync(ZIP_PATH);
  console.log(`[ffmpeg-kit] Installed ${found.length} xcframeworks`);
}

download(ZIP_URL, ZIP_PATH);
