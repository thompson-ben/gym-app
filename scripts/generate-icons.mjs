// Renders the Splitmate app icons with the bundled Chromium: `node scripts/generate-icons.mjs`.
import { chromium } from "@playwright/test";

const OUT = new URL("../public/icons/", import.meta.url).pathname;
const icon = (size, { maskable = false } = {}) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:#0f1011;display:flex;align-items:center;justify-content:center;
  border-radius:${maskable ? 0 : size * 0.22}px;font-family:Geist,Inter,Helvetica,Arial,sans-serif;">
  <span style="color:#ecebe6;font-weight:700;font-size:${size * (maskable ? 0.46 : 0.58)}px;letter-spacing:-0.04em;line-height:1;transform:translateY(-${size * 0.03}px)">s<span style="color:#c8f53c">.</span></span>
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
  await page.setContent(icon(size, opts));
  await page.screenshot({ path: OUT + name, omitBackground: true });
}
await browser.close();
console.log("icons written to", OUT);
