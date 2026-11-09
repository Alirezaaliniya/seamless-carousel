---
name: seamless-carousel
description: Builds seamless (continuous) Instagram carousel posts — a smooth chart-like line, shapes or images run across slide borders — with a header (page id + brand), a footer with pagination, a big title cover, and the user's text split into slides. Asks colours, text, size and every unknown detail first. Use for «پست اسلایدی», «کاروسل», «پست ادامه‌دار», «اسلاید اینستاگرام», carousel, seamless post.
---

# Seamless carousel

Turns the user's text into a finished Instagram carousel where the slides feel like **one continuous picture**: a line (by default a smooth line-chart curve with peaks and valleys and a soft area fill, in its own band above the footer) runs from the first slide to the last, and shapes or images sit on the borders so half shows on each slide.

```
ASK (interview) → slide plan (approve) → carousel.json → check → preview strip (approve) → full render → deliver → OFFER extras
```

You never draw slides by hand. You write a **carousel.json** spec; `scripts/build.js` lays the whole carousel out as one wide canvas (N × slide width) in headless Chrome, so anything placed on the canvas crosses slide borders exactly, then cuts it into `slide-01.png … slide-NN.png`.

Talk to the user in their language (usually Persian). Keep updates short.

**Where the files are.** `<skill>` is this skill's folder. If it has no `scripts/` folder, the full skill is in its GitHub repo (`seamless-carousel`): clone it into the work area and use that folder as `<skill>`.

## Fixed rules (always, never ask)

1. **Slide 1 is always the title slide** (`type: "title"`): a big title, an optional kicker and sub-line, and one related image or icon. The build refuses a spec where slide 1 isn't a title.
2. **Header on every slide**: the brand name (+ logo if given) and the page id (`@handle`), small and quiet.
3. **Footer on every slide**: clear pagination (`۱ / ۷`, dots or a progress bar), plus a swipe hint on every slide except the last.
4. **Something crosses every border.** The line does; add at least one more accent on the 1→2 border.
5. **Nothing covers text.** The line and border shapes live in reserved bands and margins; images on borders must not touch text — check the preview.
6. **The user's words.** Split and shorten the user's text; don't rewrite its meaning. One idea per slide, 15–45 words.
7. **No emoji** — use icons (lucide names) or the user's images.

## Step 1 — interview (before any work)

Ask with AskUserQuestion, max 4 questions per call, recommended option first. Skip anything the user already said, or that a saved brand kit (`~/.config/seamless-carousel/brand.json`) answers. Ask about **every** detail you don't know — never guess colours, the handle or the text.

**Call 1**
- **Text**: "Send the post text" — if they haven't sent it yet, ask in plain text in the same turn (AskUserQuestion can't take long text). Options when relevant: *I'll send the full text* · *Write it from my topic* · *I have bullet points, expand them*.
- **Size**: *4:5 — 1080×1350 (Recommended for feed)* · *1:1 — 1080×1080* · *9:16 — 1080×1920*.
- **Colours**: *Suggest a palette for me (Recommended)* · *My brand colours (I'll send the hex codes)* · *Dark* · *Light*. If they want suggestions, show 3–4 palettes from `references/design.md` as options (name + hex in the description).
- **Brand / header**: brand name and `@handle` (and a logo file if they have one). Ask in plain text if unknown.

**Call 2**
- **Line / connector style**: *Smooth chart line (Recommended)* — like a line chart, peaks and valleys, rising trend, soft fill · *Dotted path between top and bottom* (`wander`) · *Weaving line behind cards* · *Clean straight top rail*. Then, for the chart: solid or dotted, trend up / flat / down, fill on or off. Mention they can ask for a different curve (seed).
- **Images**: *I'll send images (logo, product, photos)* · *Use icons (Recommended if no images)* · *Mix*. Ask which image goes on the cover and whether one image should be **split across slides 1→2**.
- **Pagination style**: *Numbers ۱ / ۷ (Recommended)* · *Dots* · *Progress bar*. Plus the swipe-hint text (default «ورق بزن»).
- **Font**: *Vazirmatn (bundled)* or one of their fonts in `assets/fonts/user/` (list the folders found there).

**Call 3 (only if still unknown)**: number of slides (or "let me decide"), last slide (*CTA: save / share / follow (Recommended)* · *Summary* · *Contact / link*), digits (*Persian ۱۲۳ (Recommended)* · *Latin 123*), background (*gradient* · *solid* · *grid* · *dots*).

## Step 2 — slide plan (approve before building)

Split the text following `references/design.md` ("Splitting the user's text"). Show the plan as a short list — slide number, type, title, the gist of the text, the visual — and ask: *Good, build it (Recommended)* · *Change the split* · *Change the wording*. Loop until approved.

## Step 3 — setup (first run on a machine)

```bash
cd <skill> && npm install && npx playwright install chromium
```

(If Chrome or Edge is installed, the build uses it when Playwright's Chromium isn't there; `CHROME_PATH` overrides.) Tell the user in one line what's installing.

## Step 4 — write carousel.json

Make a work folder (`<user dir>/<post-name>_carousel/`), copy the user's images into it, and write `carousel.json`. Every key is in `references/spec.md`; read it before writing. Start from `examples/example.json`. Minimal shape:

```json
{
  "size": [1080, 1350],
  "brand": { "name": "NIAS", "handle": "@nias_ir", "logo": "logo.png" },
  "theme": { "bg": "#0f1222", "bg2": "#1b2142", "primary": "#ff7a1a", "secondary": "#4cc9f0", "text": "#f5f6fa", "muted": "#9aa3c0" },
  "footer": { "pagination": "numbers", "hint": "ورق بزن" },
  "spine": { "track": "chart", "trend": "up", "dash": "solid", "area": true, "nodeStyle": "number", "seed": 7 },
  "bridges": "auto",
  "canvas": [{ "kind": "image", "image": "mockup.png", "x": 1, "y": 0.5, "w": 520, "h": 520, "shadow": true }],
  "slides": [
    { "type": "title", "kicker": "آموزش", "title": "عنوان *اصلی*", "sub": "زیرعنوان کوتاه", "image": "cover.png" },
    { "type": "content", "step": 1, "title": "قدم اول", "text": "…", "icon": "zap" },
    { "type": "cta", "title": "*ذخیره* کن", "actions": [{ "text": "ذخیره", "icon": "bookmark" }] }
  ]
}
```

Text syntax: `*word*` primary colour · `^word^` secondary · `` `Latin` `` isolated LTR run · `~word~` struck · `\n` line break.

Vary the layouts (`visual-top`, `visual-bottom`, `split`, `big` stat, `card`) so the slides don't look the same.

## Step 5 — check, preview, fix (loop)

```bash
node <skill>/scripts/build.js "<work>/carousel.json" check
node <skill>/scripts/build.js "<work>/carousel.json" preview     # → out/strip.jpg (whole canvas, borders marked)
```

Fix every `OVERFLOW`, `MISSING`, `ICON`, `FONT`, `EMOJI`, `DENSE`. `SHRUNK` is OK if the text is still big enough (title ≥ 80 px on slide 1). Then **look at `out/strip.jpg`**: the line must not cross text, border elements must not touch text, every border must have a crossing. To change the curve, try another `seed` (2–3 tries, pick the nicest); pin a slide's height with `"spine": {"value": 0.8}` (chart: 0 = band bottom, 1 = top) or `{"band": "top"}` (wander).

Send the strip (SendUserFile, display render) and ask: *Looks good — render (Recommended)* · *Change colours* · *Change the line* · *Change text / images*. Loop until approved.

## Step 6 — render and deliver

```bash
node <skill>/scripts/build.js "<work>/carousel.json" full    # → out/slide-01.png … + strip.jpg
```

Look at slide 1 and one middle slide at full size. Deliver the PNGs (and the strip) — into the user's folder if one is connected, otherwise via the chat. Never overwrite earlier renders: use `--out out-v2` for versions.

## Step 7 — offer extras (always, at the end)

Ask with AskUserQuestion (multiSelect), only what wasn't done:
- **Caption text** for the post: a hook line, 2–4 short value lines, the CTA, 8–15 Persian + English hashtags → `post.txt`.
- **Another colour / line version** (A/B): same spec, another palette or `seed`.
- **Other size**: 1:1 or 9:16 from the same text (re-laid out, not cropped).
- **Save as brand kit**: colours, brand, handle, logo, font, line style → `~/.config/seamless-carousel/brand.json` (build.js merges it into every spec as defaults; the spec overrides it; `"brandKit": false` skips it).

## Gotchas

- Instagram's grid preview shows the middle 3:4 of slide 1 — keep the cover title away from the extreme top/bottom.
- Persian text with Latin words: wrap Latin runs in backticks, or they can flip order.
- Images on a border (`x: 1`, `x: 2` …) must fit inside the margins *or* sit in an empty area of both slides; check the strip.
- Max 20 slides (Instagram limit); 6–10 is the sweet spot.
- The user's commercial fonts go in `assets/fonts/user/<Family>/` (git-ignored, never published).
