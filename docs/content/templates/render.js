// Renders a template. Usage (from this folder):
//   NODE_PATH=$(npm root -g) node render.js reel  reel-notes-vs-app.html  out-dir  14   → frames + out-dir/reel.mp4 via ffmpeg (see README)
//   NODE_PATH=$(npm root -g) node render.js still cover-before-after.html out-dir     → out-dir/cover.png and out-dir/cover-grid.png
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
(async () => {
  const [mode, file, outDir = "out", seconds = "14"] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  await p.goto("file://" + path.resolve(file), { waitUntil: "networkidle" });
  await p.evaluate(() => document.fonts.ready);
  if (mode === "still") {
    await p.screenshot({ path: path.join(outDir, "cover.png") });
    await p.screenshot({ path: path.join(outDir, "cover-grid.png"), clip: { x: 0, y: 240, width: 1080, height: 1440 } });
  } else {
    const frames = path.join(outDir, "f");
    fs.mkdirSync(frames, { recursive: true });
    for (let i = 0; i < Number(seconds) * 30; i++) {
      await p.evaluate((t) => window.setT(t), i / 30);
      await p.screenshot({ path: path.join(frames, `f${String(i).padStart(4, "0")}.png`) });
    }
  }
  await b.close();
})();
