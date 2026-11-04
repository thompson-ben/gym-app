// Renders the Setmodo app icons with the bundled Chromium: `node scripts/generate-icons.mjs`.
// Also writes the iOS app icon and launch splash into ios/ (square and opaque, as the App Store requires).
import { chromium } from "@playwright/test";

const OUT = new URL("../public/icons/", import.meta.url).pathname;
// Geist, the app's typeface (next/font loads it on the site), so the splash matches the page exactly.
const FONT = `<link href="https://fonts.googleapis.com/css2?family=Geist:wght@700&display=block" rel="stylesheet">`;
const icon = (size, { maskable = false } = {}) => `<!doctype html><html><head>${FONT}</head><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:#131416;display:flex;align-items:center;justify-content:center;
  border-radius:${maskable ? 0 : size * 0.22}px;font-family:Geist,Inter,Helvetica,Arial,sans-serif;">
  <span style="color:#eaebed;font-weight:700;font-size:${size * (maskable ? 0.46 : 0.58)}px;letter-spacing:-0.04em;line-height:1;transform:translateY(-${size * 0.03}px)">s<span style="color:#c3ed89">.</span></span>
</div></body></html>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage();
for (const [name, size, opts] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["maskable-512.png", 512, { maskable: true }],
  ["apple-touch-icon.png", 180, { maskable: true }],
  ["favicon-32.png", 32],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(icon(size, opts), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT + name, omitBackground: true });
}

const IOS = new URL("../ios/App/App/Assets.xcassets/", import.meta.url).pathname;
// iOS rounds the corners itself, and an icon with transparency is rejected.
await page.setViewportSize({ width: 1024, height: 1024 });
await page.setContent(icon(1024, { maskable: true }), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: IOS + "AppIcon.appiconset/AppIcon-512@2x.png", omitBackground: false });
// Launch splash: the app background with a small mark, shown for a moment while the site loads.
await page.setViewportSize({ width: 2732, height: 2732 });
await page.setContent(`<!doctype html><html><head>${FONT}</head><body style="margin:0;width:2732px;height:2732px;background:#131416;display:flex;align-items:center;justify-content:center;font-family:Geist,Inter,Helvetica,Arial,sans-serif">
<span style="color:#eaebed;font-weight:700;font-size:260px;letter-spacing:-0.045em">setmodo<span style="color:#c3ed89">.</span></span></body></html>`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
  await page.screenshot({ path: IOS + "Splash.imageset/" + name, omitBackground: false });
}
await browser.close();
console.log("icons written to", OUT, "and", IOS);
