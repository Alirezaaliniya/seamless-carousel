# seamless-carousel

Build **seamless Instagram carousels** (پست اسلایدی ادامه‌دار) from a JSON spec: a dotted path wanders across all slides, shapes and images sit on slide borders, and every slide gets a header (brand + page id) and footer (pagination). RTL / Persian first.

![example](docs/example-strip.jpg)

It works as a **Claude skill** (`SKILL.md`: Claude interviews you, splits your text into slides and builds the post) and as a plain **CLI**.

## Install

```bash
git clone https://github.com/<you>/seamless-carousel.git
cd seamless-carousel
npm install
npx playwright install chromium   # or set CHROME_PATH to your Chrome / Edge
```

## Use

```bash
node scripts/build.js examples/example.json check     # lint + layout report
node scripts/build.js examples/example.json preview   # out/strip.jpg — whole canvas, borders marked
node scripts/build.js examples/example.json full      # out/slide-01.png … + strip.jpg
```

- Spec reference: [`references/spec.md`](references/spec.md)
- Design guide (connector patterns, palettes, text splitting): [`references/design.md`](references/design.md)

### As a Claude skill

Copy this folder into your skills directory (e.g. `~/.claude/skills/seamless-carousel`) and run `npm install` there, or upload `SKILL.md` as a skill and keep the repo cloned — the skill clones/uses the repo for its scripts.

## How it works

The carousel is rendered as **one wide page** (slides × width) in headless Chrome, so anything placed on it crosses slide borders pixel-exactly. Text is auto-fitted per slide. The canvas is then cut into one PNG per slide.

## Fonts

- Bundled: **Vazirmatn** (SIL OFL 1.1, `assets/fonts/Vazirmatn/OFL.txt`).
- Your own fonts: `assets/fonts/user/<Family>/…` — git-ignored, never committed.

## Licence

MIT — see `LICENSE`. Icons: [Lucide](https://lucide.dev) (ISC), installed via npm.
