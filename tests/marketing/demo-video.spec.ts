import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { catalogueId, logSet, newUser, signIn } from "../e2e/helpers";
import { seedDemoAccount } from "./demo-account";

/**
 * A 20–30 second vertical (1080 × 1920) demo of the real app for Reels and Stories, recorded from
 * a demo account with sample data. Frames are full-resolution screenshots taken back to back (the
 * screencast API ignores the device pixel ratio), then ffmpeg (FFMPEG=/path/to/ffmpeg, with
 * libx264) turns them into an MP4. Run after `npm run build`:
 *   FFMPEG=… npx playwright test --config playwright.marketing.config.ts demo-video
 * Output: marketing-out/notchlift-demo.mp4 (git-ignored).
 */

const OUT = process.env.DEMO_OUT ?? "marketing-out";

test.use({ viewport: { width: 405, height: 720 }, deviceScaleFactor: 8 / 3, isMobile: true, hasTouch: true });

/** Tap ripples and a caption pill, so the video reads with the sound off. */
function overlays() {
  const style = document.createElement("style");
  style.textContent = `
    .demo-tap { position: fixed; z-index: 2147483647; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
      background: rgba(195,237,137,.35); border: 2px solid rgba(195,237,137,.9); pointer-events: none; animation: demo-tap .55s ease-out forwards; }
    @keyframes demo-tap { from { transform: scale(.4); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
    .demo-cap { position: fixed; z-index: 2147483646; left: 50%; top: 8px; transform: translateX(-50%); width: max-content; max-width: 92%; padding: 11px 18px;
      border-radius: 18px; background: rgba(19,20,22,.92); border: 1px solid rgba(195,237,137,.5); color: #eaebed; pointer-events: none;
      font: 650 17px/1.25 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; letter-spacing: -.2px;
      box-shadow: 0 12px 40px -10px rgba(0,0,0,.8); }`;
  const show = () => {
    document.head.appendChild(style);
    const text = sessionStorage.getItem("demo-caption");
    if (text) (window as unknown as { __caption: (t: string) => void }).__caption(text);
  };
  (window as unknown as { __caption: (t: string) => void }).__caption = (text: string) => {
    sessionStorage.setItem("demo-caption", text);
    let el = document.querySelector(".demo-cap");
    if (!el) {
      el = document.createElement("div");
      el.className = "demo-cap";
      document.body.appendChild(el);
    }
    el.textContent = text;
  };
  window.addEventListener("pointerdown", (e) => {
    const dot = document.createElement("div");
    dot.className = "demo-tap";
    dot.style.left = `${e.clientX}px`;
    dot.style.top = `${e.clientY}px`;
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 600);
  }, true);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", show);
  else show();
}

const caption = (page: Page, text: string) => page.evaluate((t) => (window as unknown as { __caption: (t: string) => void }).__caption(t), text);
const hold = (page: Page, ms: number) => page.waitForTimeout(ms);

test("demo video", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await newUser("demo-video");
  await seedDemoAccount(user);
  await page.addInitScript(() => {
    for (const id of ["train", "workout", "splits", "progress"]) window.localStorage.setItem(`splitmate-tip:${id}`, "1");
    window.localStorage.setItem("splitmate-install-hint-dismissed", "1");
  });
  await signIn(page, user);
  await page.addInitScript(overlays);
  await page.goto("/train");
  await expect(page.getByRole("button", { name: "Start Push" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await caption(page, "Your next workout, ready to go");

  // Record.
  const frames: { data: Buffer; t: number }[] = [];
  const cdp = await page.context().newCDPSession(page);
  let recording = true;
  const recorder = (async () => {
    while (recording) {
      const t = Date.now() / 1000;
      try {
        // The visible area at full resolution (a plain capture of this session is at 1×).
        const { cssVisualViewport: v } = await cdp.send("Page.getLayoutMetrics");
        const { data } = await cdp.send("Page.captureScreenshot", {
          format: "jpeg",
          quality: 90,
          clip: { x: v.pageX, y: v.pageY, width: v.clientWidth, height: v.clientHeight, scale: 1080 / v.clientWidth },
        });
        frames.push({ data: Buffer.from(data, "base64"), t });
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 30)); // mid-navigation
      }
    }
  })();

  await hold(page, 2800);
  await page.getByRole("button", { name: "Start Push" }).click();
  await page.waitForURL("**/workout/**");
  await page.waitForLoadState("networkidle");
  await caption(page, "Last session sits beside every set");
  await hold(page, 2800);

  const card = page.getByRole("region", { name: "Barbell Bench Press" });
  await caption(page, "Weights filled in. One tap per set");
  await card.getByRole("button", { name: /^Use .* for remaining sets$/ }).click();
  await hold(page, 500);
  // All three sets above the rest-timer bar.
  await card.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: "smooth" }));
  await hold(page, 700);
  for (const [set, reps] of [[1, 6], [2, 7], [3, 6]] as const) {
    await logSet(page, "Barbell Bench Press", set, reps);
    await hold(page, 1400);
  }
  await expect(card.getByText("Target hit!")).toBeVisible();
  await card.getByText("Target hit!").evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 430, behavior: "smooth" }));
  await caption(page, "Hit your target? Add weight next time");
  await hold(page, 3800);

  const bench = await catalogueId("barbell-bench-press");
  await caption(page, "Watch every lift climb");
  await page.goto(`/progress/${bench}`);
  await page.getByRole("link", { name: "Heaviest" }).click();
  await expect(page.getByRole("heading", { level: 2 }).first()).toContainText(/heaviest/i);
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { level: 2 }).first().evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 150, behavior: "smooth" }));
  await hold(page, 4200);

  // End card.
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#131416">
    <div style="height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 34px;box-sizing:border-box;
      background:radial-gradient(70% 45% at 50% 55%,rgba(195,237,137,.16),transparent),#131416;color:#eaebed;
      font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
      <div style="font-size:30px;font-weight:700;letter-spacing:-1.2px">notchlift<span style="color:#c3ed89">.</span></div>
      <div style="margin-top:26px;font-size:42px;line-height:1.04;font-weight:700;letter-spacing:-1.8px">Know exactly what to lift next.</div>
      <div style="margin-top:16px;font-size:20px;font-weight:650;color:#c3ed89">Stop guessing. Start progressing.</div>
      <div style="margin-top:44px;display:inline-flex;align-self:flex-start;background:#c3ed89;color:#172009;border-radius:16px;padding:15px 22px;font-size:19px;font-weight:700">
        14 days free · notchlift.com</div>
      <div style="margin-top:14px;font-size:14px;color:#7c8287">No card needed. Works in your phone’s browser.</div>
    </div></body></html>`);
  await hold(page, 3800);
  recording = false;
  await recorder;

  // Frames → MP4. Each frame is shown until the next one arrived.
  const dir = path.join(OUT, "frames");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  frames.forEach((f, i) => {
    const file = path.resolve(dir, `${String(i).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, f.data);
    const next = frames[i + 1]?.t ?? f.t + 0.5;
    lines.push(`file '${file}'`, `duration ${Math.max(next - f.t, 1 / 60).toFixed(4)}`);
  });
  lines.push(`file '${path.resolve(dir, `${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, "list.txt"), lines.join("\n"));
  console.log(`frames: ${frames.length}, seconds: ${(frames.at(-1)!.t - frames[0].t + 0.5).toFixed(1)}`);

  if (process.env.FFMPEG) {
    execFileSync(process.env.FFMPEG, [
      "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(dir, "list.txt"),
      "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0x131416,fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart",
      path.join(OUT, "notchlift-demo.mp4"),
    ]);
  }
});
