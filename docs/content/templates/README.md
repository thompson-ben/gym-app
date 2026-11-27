# Content templates (reference quality)

These are the actual source files of the posts Ben rated "a lot better" on 27 Nov 2026. **Start from these** (copy, then change the words, screenshots and timings) rather than from a blank page. They set the bar for quality.

| File | What it is |
|---|---|
| `reel-notes-vs-app.html` | 14 s reel: a messy Notes log typed live → a swipe with a flash → the real app zoomed in, with a lime ring and stickers → a lime end card. All motion comes from `window.setT(t)`. |
| `cover-before-after.html` | The professional cover: eyebrow, a three-tone headline, a "before" Notes card with red strikethroughs, and an "after" real-app phone with a glow and a lime ring. |
| `render.js` | Renders either one (see below). |

## How to render
```
cd docs/content/templates
NODE_PATH=$(npm root -g) node render.js reel reel-notes-vs-app.html /tmp/out 14
ffmpeg -y -framerate 30 -i /tmp/out/f/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart /tmp/out/reel.mp4
NODE_PATH=$(npm root -g) node render.js still cover-before-after.html /tmp/out
```
Screenshots are loaded from `public/landing/`, so keep the relative paths, or copy the images next to your copy of the template.

## Things that took a few tries (so you don't have to)
- **Screenshot coordinates:** the app screenshots are 1170 × 2532. In `target-hit.png`, the "Previous" column (`67.5 × 10`) runs about x 200–490, y 1005–1435, and the "🎯 Target hit" banner about x 100–1070, y 1550–1664. Scale these by your displayed width ÷ 1170 when placing rings and stickers.
- **Keep stickers outside the clipped phone frame,** so they aren't cut off.
- **Check every frame you care about** by rendering single moments, and look at them before making the video.
- **Check the cover's grid crop** (`cover-grid.png`): everything important must sit between y 240 and 1680.
