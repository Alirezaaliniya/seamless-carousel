# Spec reference (`carousel.json`)

Everything is optional except `slides`. Unset values come from the defaults in `scripts/build.js`.

## Top level

| key | default | meaning |
|---|---|---|
| `size` | `[1080, 1350]` | one slide in px. 4:5 = `[1080,1350]`, 1:1 = `[1080,1080]`, 9:16 = `[1080,1920]` |
| `dir` / `lang` | `"rtl"` / `"fa"` | page direction and language |
| `digits` | `"fa"` | `"fa"` = Persian digits in pagination, step badges, `big`; `"en"` = Latin |
| `brand` | | `{ "name": "NIAS", "handle": "@nias_ir", "logo": "logo.png" }` — shown small in every header |
| `theme` | dark navy + orange | `bg`, `bg2` (second background colour), `surface` (cards, tracks), `primary`, `secondary`, `text`, `muted`, `line` (spine colour; `null` = gradient primary → secondary) |
| `fonts` | Vazirmatn | `{ "display": "...", "body": "..." }` — a family from `assets/fonts/user/` or `Vazirmatn` |
| `titleSize` / `headingSize` / `textSize` | 118 / 72 / 40 | base font sizes in px (auto-shrunk to fit) |
| `padding` | 110 | side padding of every slide |
| `background` | `"gradient"` | `gradient` (one gradient over the whole canvas, so colour flows between slides) · `solid` · `grid` · `dots` |
| `header` | | `{ "show": true, "line": false, "height": 120 }` — brand on the start side (right in RTL), handle on the other |
| `footer` | | `{ "show": true, "height": 120, "pagination": "numbers"|"dots"|"bar", "format": "{n} / {total}", "hint": "ورق بزن", "hintIcon": "chevrons-left", "left": "" }` — `hint` shows on every slide except the last; `left` is optional small text on the start side |
| `spine` | | the continuous line — see below |
| `bridges` | `"auto"` | elements on slide borders — `"auto"`, `false`, or a list of canvas elements |
| `canvas` | `[]` | free elements on the whole canvas — see below |
| `slides` | **required** | 2–20 slides; **slide 1 must be `type: "title"`** |

## `spine` — the line that runs from the first slide to the last

| key | default | values |
|---|---|---|
| `show` | `true` | |
| `track` | `"chart"` | `chart` (a line chart running through the whole post: one smooth monotone curve — no kinks, no overshoot — through a value at every slide centre and border, alternating peaks and valleys, inside its own band above the footer or under the header; text never enters the band) · `wander` (smooth route: runs along the top band on some slides and the bottom band on others with soft arcs, and changes band with one clean S-curve inside the side margins at a slide border; optional round loops — never over text) · `bottom` (band above the footer; text area is shortened so the line never crosses text) · `top` (band under the header) · `weave` (swings between upper and lower thirds; text goes on cards, the line passes behind them) · `middle` · `custom` (use `slides[i].spine.y`) |
| `chartHeight` | `0.24` | `chart`: band height (fraction of slide height, or px) |
| `chartPosition` | `"bottom"` | `chart`: `bottom` · `top` |
| `trend` | `"up"` | `chart`: `up` · `down` · `none` |
| `noise` | `0.55` | `chart`: size of the peaks/valleys (0 = a straight trend line) |
| `area` | `true` | `chart`: soft gradient fill under the line (`true`, `false` or an opacity like `0.15`) |
| `shape` | `"wave"` | `wave` · `straight` · `zigzag` · `steps` (not used by `wander`) |
| `amplitude` | `50` | wave height / wobble in px |
| `width` | `7` | stroke width |
| `dash` | `"solid"` | `solid` · `dashed` · `dotted` |
| `seed` | `7` | `wander`: a different number = a different random route (same number = same route every build) |
| `switch` | `0.7` | `wander`: chance the line changes band (top ↔ bottom) at each border |
| `turn` | padding | `wander`: half-width (px) of the smooth S-curve where the line changes band; it stays inside the side margins, so keep it ≤ `padding` unless the text is narrow |
| `loops` | `0.35` | `wander`: chance of a loop on a slide (`0` = none) |
| `startBand` | `"top"` | `wander`: band on slide 1 |
| `nodes` | `true` | a marker on the line at every slide |
| `nodeStyle` | `"ring"` | `ring` · `number` (slide number in a circle) · `icon` (uses `slides[i].nodeIcon`) |
| `glow` | `true` | soft glow under the line |
| `arrow` | `true` | arrowhead at the end (else a dot) |

Per slide: `"spine": { "value": 0.8 }` pins the `chart` height at that slide (0 = band bottom, 1 = band top); `"spine": { "band": "top" }` forces the `wander` band on that slide; `"spine": { "y": 0.4 }` pins the line's height on that slide (fraction of the slide height, or px); `"spine": { "node": false }` hides its node.

## Slides

Common keys: `type`, `title`, `image` / `icon`, `visualSize`, `card` (put the text on a card), `spine`, `nodeIcon`.

### `title` (always slide 1)
`kicker` (small pill above), `title` (big), `sub`, and one visual: `image` (path relative to the spec, PNG/JPG/SVG) or `icon` (a [lucide](https://lucide.dev/icons) name).
Visual extras: `shape` (`none` · `circle` · `rounded` · `blob`), `fit` (`contain` · `cover`), `w`/`h`.

### `content`
`step` (number badge), `title`, `text`, `bullets` (strings or `{ "text", "icon" }`), `big` (a huge number/stat), `layout`:
`visual-top` (default with a visual) · `visual-bottom` · `split` (visual beside the text) · `text`.

### `cta` (usually last)
`title`, `text`, `actions`: `[{ "text": "ذخیره", "icon": "bookmark" }, { "text": "اشتراک", "icon": "share-2" }, { "text": "فالو", "icon": "user-plus" }]`.

### Text syntax (in every text field)
`*word*` = primary colour · `^word^` = secondary colour · `` `Latin` `` = isolated LTR run (keeps `WebP`, URLs, code from flipping) · `~word~` = struck through · `\n` = line break.

## Canvas elements (`canvas` and custom `bridges`)

Positions are on the **whole canvas**: `x` in slide units (`0.5` = middle of slide 1, `1` = border between slides 1 and 2, `1.5` = middle of slide 2), `y` as a fraction of the height (≤ 1) or px.

| `kind` | keys |
|---|---|
| `circle` / `ring` / `blob` / `glow` | `size`, `color` (`primary`, `secondary`, … or any CSS colour), `opacity`, `width` (ring), `blur` (blob), `rotate` |
| `icon` | `icon`, `size`, `color`, `stroke` |
| `image` | `image`, `size` or `w`/`h`, `fit`, `shadow: true`, `rotate` — put it on `x: 1` to split a picture across two slides |
| `text` | `text`, `fontSize`, `color`, `opacity`, `rotate` — a huge outline-like word/number running across a border |
| `arrow` | from (`x`,`y`) to (`x2`,`y2`), `bend`, `width`, `dash` — a curved arrow pointing into the next slide |

`"front": true` draws the element above the slides' text (default: behind it).

## Lint codes

`OVERFLOW` text still doesn't fit at minimum size · `SHRUNK` text was auto-shrunk (fine, but check it) · `DENSE` > 70 words on a slide · `MISSING` image file not found · `ICON` unknown icon · `FONT` font family not installed · `EMOJI` emoji in text · `HEADER` no handle.
