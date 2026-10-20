"use client";

import { useState } from "react";
import type { ShareCard } from "@/lib/share-card";
import { trackDetail } from "@/lib/track";
import { Button, ErrorNote } from "./ui";

const W = 1080, H = 1920, PAD = 90;
const C = { bg: "#131416", surface: "#1c2023", line: "#2e3337", text: "#eaebed", muted: "#a9aeb3", faint: "#7c8287", accent: "#c3ed89" };

/** Fits text to a width, ending with "…" when it doesn't. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Up to `lines` lines of wrapped text (the last one shortened with "…"); returns the y after it. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, lines: number): number {
  const words = text.split(" ");
  for (let n = 1; words.length; n++) {
    let line = words.shift()!;
    while (words.length && ctx.measureText(`${line} ${words[0]}`).width <= max) line += ` ${words.shift()}`;
    if (n === lines && words.length) line = fit(ctx, `${line} ${words.splice(0).join(" ")}`, max);
    ctx.fillText(fit(ctx, line, max), x, y);
    y += lh;
  }
  return y;
}

/** Draws the 9:16 story image for a workout. */
export function drawShareCard(canvas: HTMLCanvasElement, card: ShareCard, font: string) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.62, 0, W / 2, H * 0.62, W * 0.8);
  glow.addColorStop(0, "rgba(195,237,137,0.14)");
  glow.addColorStop(1, "rgba(195,237,137,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  const f = (weight: number, size: number) => `${weight} ${size}px ${font}`;

  ctx.font = f(700, 58);
  ctx.fillStyle = C.text;
  ctx.fillText("notchlift", PAD, 220);
  ctx.fillStyle = C.accent;
  ctx.fillText(".", PAD + ctx.measureText("notchlift").width, 220);

  // Centre the content between the wordmark and the footer, so short workouts don't leave a gap.
  const rowH = 104;
  const boxH = card.lines.length * rowH + (card.more ? 60 : 0) + 40;
  ctx.font = f(700, 104);
  const titleLines = ctx.measureText(card.title).width > W - 2 * PAD ? 2 : 1;
  const contentH = 110 + titleLines * 108 + 90 + boxH + (card.records.length ? 80 + 70 + card.records.length * 64 : 0);
  const top = Math.max(330, Math.round((300 + (H - 360) - contentH) / 2));

  ctx.font = f(650, 32);
  ctx.fillStyle = C.accent;
  ctx.fillText(fit(ctx, card.eyebrow.toUpperCase(), W - 2 * PAD), PAD, top);
  ctx.font = f(700, 104);
  ctx.fillStyle = C.text;
  let y = wrap(ctx, card.title, PAD, top + 110, W - 2 * PAD, 108, 2);
  ctx.font = f(400, 40);
  ctx.fillStyle = C.muted;
  ctx.fillText(card.stats, PAD, y + 4);
  y += 90;

  // Best set per exercise.
  ctx.fillStyle = C.surface;
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(PAD - 30, y, W - 2 * PAD + 60, boxH, 48);
  ctx.fill();
  ctx.stroke();
  let ry = y + 20 + rowH / 2 + 14;
  for (const [i, l] of card.lines.entries()) {
    ctx.font = f(700, 44);
    const best = l.best;
    const bw = ctx.measureText(best).width;
    ctx.fillStyle = C.accent;
    ctx.fillText(best, W - PAD - bw, ry);
    ctx.font = f(500, 42);
    ctx.fillStyle = C.text;
    ctx.fillText(fit(ctx, l.name, W - 2 * PAD - bw - 40), PAD, ry);
    if (i < card.lines.length - 1) {
      ctx.fillStyle = C.line;
      ctx.fillRect(PAD, ry + rowH / 2 - 10, W - 2 * PAD, 2);
    }
    ry += rowH;
  }
  if (card.more) {
    ctx.font = f(400, 36);
    ctx.fillStyle = C.faint;
    ctx.fillText(`+ ${card.more} more`, PAD, ry - 20);
  }
  y += boxH + 80;

  if (card.records.length) {
    ctx.font = f(650, 32);
    ctx.fillStyle = C.accent;
    ctx.fillText("NEW RECORDS", PAD, y);
    y += 70;
    ctx.font = f(500, 40);
    for (const r of card.records) {
      ctx.fillStyle = C.accent;
      ctx.fillText("★", PAD, y);
      ctx.fillStyle = C.text;
      ctx.fillText(fit(ctx, r, W - 2 * PAD - 60), PAD + 60, y);
      y += 64;
    }
  }

  ctx.font = f(500, 38);
  ctx.fillStyle = C.muted;
  // Above the reply bar Instagram puts over the bottom of a story.
  ctx.fillText("Tracked with NotchLift", PAD, H - 360);
  ctx.font = f(700, 44);
  ctx.fillStyle = C.text;
  ctx.fillText("notchlift.com", PAD, H - 300);
}

/** "Share workout": a story-sized image of this workout, shared from the phone (or downloaded). */
export function ShareWorkoutButton({ card, fileName }: { card: ShareCard; fileName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    trackDetail("cta_click", "share_workout", "/sessions");
    try {
      const canvas = document.createElement("canvas");
      drawShareCard(canvas, card, getComputedStyle(document.body).fontFamily || "sans-serif");
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (!blob) throw new Error("no image");
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (e) {
      // Closing the share sheet isn't an error.
      if (!(e instanceof DOMException && e.name === "AbortError")) setError("Couldn’t create the image. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <Button variant="secondary" size="md" className="w-full" busy={busy} onClick={share}>Share workout</Button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
