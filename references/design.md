# Designing a seamless carousel

A seamless carousel works because the viewer feels the post *continue* when they swipe. Something has to cross every border.

## Connector patterns (pick one main + one accent)

| pattern | how | when |
|---|---|---|
| **Chart line** (default) | `spine.track: "chart"`, `trend: "up"`, `area: true` — try 2–3 `seed`s | the cleanest, smoothest connector; growth / progress / results posts, and good for almost anything |
| **Wandering dotted path** | `spine.track: "wander"`, `dash: "dotted"`, `loops: 0.35` — try 2–3 `seed`s and pick the nicest | the most "hand-made" look; works for almost anything |
| **Journey line** | `spine.track: "bottom"`, `nodeStyle: "number"` | steps, roadmaps, "how to" — the line is the path, nodes are the steps |
| **Weaving line** | `spine.track: "weave"` | storytelling, before/after; text on cards, the line ducks behind them |
| **Top rail** | `spine.track: "top"`, `shape: "straight"`, `dash: "dashed"` | calm, editorial, lists |
| **Split image** | `canvas: [{ "kind": "image", "x": 1, ... }]` | a product shot / mockup / illustration half on each slide — the strongest "swipe" hook; put it on the border of slides 1→2 |
| **Border shapes** | `bridges: "auto"` or custom rings/blobs at `x: 1, 2, 3…` | always-on accent; keep them small (< 2 × padding) so they don't touch text |
| **Giant word** | `{ "kind": "text", "text": "SEO", "x": 2, "fontSize": 420, "opacity": 0.08 }` | a background word that spans two slides |
| **Pointing arrow** | `{ "kind": "arrow", "x": 0.75, "y": 0.8, "x2": 1.3, "y2": 0.75 }` | pull the eye from slide 1 into slide 2 |

Rules of thumb:
- **Every border needs a crossing.** The spine already crosses all of them; add one more accent on 1→2 (the first swipe matters most).
- **Never cross text.** The bottom/top tracks reserve their band automatically; with `weave`/`middle` text sits on cards. With custom elements, preview and move anything that touches text.
- **Slide 1 is the cover**: one idea, a big title (5–8 words), one strong visual. No paragraph.
- **One idea per slide**: 15–45 words. Long text → split it, don't shrink it.
- **Rhythm**: alternate layouts (`visual-top`, `visual-bottom`, `split`, `big` stat, `card`) so slides don't look identical.
- **Last slide**: a CTA (save / share / follow) or a summary.
- **Header**: brand + handle, small and quiet. **Footer**: pagination always visible; the swipe hint on every slide but the last.

## Splitting the user's text into slides

1. Find the hook → slide 1 title (+ a short `sub`).
2. Each main point / step → one slide (`step` number if it's a sequence).
3. A number or result → a `big` stat slide.
4. Lists → `bullets` (3–5 items, each ≤ 8 words).
5. End → CTA slide.
6. Keep the user's wording; shorten only to fit, and show them the slide plan before building.

## Colour palettes (suggest when the user has none)

| name | bg / bg2 | primary | secondary | text / muted |
|---|---|---|---|---|
| Night orange | `#0f1222` / `#1b2142` | `#ff7a1a` | `#4cc9f0` | `#f5f6fa` / `#9aa3c0` |
| Paper ink | `#f6f1e7` / `#efe6d4` | `#e4572e` | `#1d3557` | `#1b1b1b` / `#6b6255` |
| Mint tech | `#0b1f1c` / `#10302a` | `#2ee59d` | `#f9c74f` | `#eafff6` / `#8fb8aa` |
| Violet pop | `#17112b` / `#2a1856` | `#b388ff` | `#ff6ec7` | `#f7f3ff` / `#a99cc9` |
| Clean light | `#ffffff` / `#eef3ff` | `#2f6bff` | `#ff8a3d` | `#0d1530` / `#66708a` |

For light themes set `surface` to something like `rgba(13,21,48,0.06)`.

## Images

- The user's own images: logo, product photos, mockups, illustrations (transparent PNG works best for split images).
- No image? Use a lucide icon (`icon`) — it gets a soft halo in the primary colour.
- Never use photos of real people or brand logos the user doesn't own.
