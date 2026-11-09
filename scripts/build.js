#!/usr/bin/env node
/*
 * seamless-carousel — build a continuous (seamless) Instagram carousel from a JSON spec.
 *
 * The whole carousel is laid out as ONE wide canvas (N x slide width), so lines, shapes
 * and images can run across slide borders. The canvas is then cut into one PNG per slide.
 *
 * Usage:
 *   node scripts/build.js <spec.json> [mode] [--out <dir>]
 *
 * Modes:
 *   check    validate the spec, lay it out, report overflow / missing files (no PNGs)
 *   preview  check + strip.jpg (the whole canvas, small) with slide borders marked
 *   full     check + slide-01.png … slide-NN.png + strip.jpg  (default)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SKILL_DIR = path.resolve(__dirname, '..');
const FONT_DIR = path.join(SKILL_DIR, 'assets', 'fonts');

/* ------------------------------------------------------------------ helpers */

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const toFa = (v) => String(v).replace(/[0-9]/g, (d) => FA_DIGITS[d]);

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Inline text syntax: *highlight*  ^secondary^  `latin run`  ~strike~  \n = line break */
function rich(s) {
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, '<bdi class="ltr" dir="ltr">$1</bdi>');
  out = out.replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>');
  out = out.replace(/\^([^^]+)\^/g, '<span class="hl2">$1</span>');
  out = out.replace(/~([^~]+)~/g, '<span class="strike">$1</span>');
  out = out.replace(/\n/g, '<br>');
  return out;
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

function deepMerge(base, over) {
  if (over === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = deepMerge(base[k], over[k]);
  return out;
}

/* ------------------------------------------------------------------ defaults */

const DEFAULTS = {
  size: [1080, 1350],
  dir: 'rtl',
  lang: 'fa',
  digits: 'fa',
  brand: { name: '', handle: '', logo: '' },
  theme: {
    bg: '#0f1222',
    bg2: '#1a1f3a', // second background colour (gradient across the canvas)
    surface: 'rgba(255,255,255,0.06)',
    primary: '#ff7a1a',
    secondary: '#4cc9f0',
    text: '#f5f6fa',
    muted: '#9aa3c0',
    line: null, // spine colour; null = gradient primary → secondary
  },
  fonts: { display: 'Vazirmatn', body: 'Vazirmatn' },
  header: { show: true, line: false, height: 120 },
  footer: { show: true, height: 120, pagination: 'numbers', format: '{n} / {total}', hint: 'ورق بزن', hintIcon: 'chevrons-left' },
  spine: {
    show: true,
    track: 'chart', // chart | wander | bottom | top | middle | weave | custom
    chartHeight: 0.24, // chart: band height (fraction of slide height, or px)
    chartPosition: 'bottom', // chart: bottom | top
    trend: 'up', // chart: up | down | none
    noise: 0.55, // chart: how much the values jump around (0 = straight trend)
    area: true, // chart: soft gradient fill under the line (true or an opacity like 0.15)
    shape: 'wave', // wave | straight | zigzag | steps   (ignored by wander)
    amplitude: 50,
    turn: null, // wander: half-width of the S-curve at a band change, px (default = padding, so it stays in the margins)
    width: 7,
    dash: 'solid', // solid | dashed | dotted
    seed: 7, // wander: change it for a different random route
    switch: 0.7, // wander: chance the line changes band (top <-> bottom) at each border
    loops: 0.35, // wander: chance of a small curl on a slide (0 = none)
    startBand: 'top', // wander: band on slide 1
    nodes: true, // a node on the line at every slide
    nodeStyle: 'ring', // ring | number | icon
    glow: true,
    arrow: true, // arrowhead at the end of the line
  },
  bridges: 'auto', // 'auto' | false | [ ...canvas elements ]
  canvas: [], // free elements on the whole canvas (x in slide units)
  padding: 110,
  background: 'gradient', // gradient | solid | grid | dots | noise
};

/* ------------------------------------------------------------------ fonts */

const WEIGHT_WORDS = [
  ['thin', 100], ['hairline', 100], ['extralight', 200], ['ultralight', 200], ['light', 300],
  ['regular', 400], ['normal', 400], ['book', 400], ['medium', 500], ['demibold', 600],
  ['semibold', 600], ['extrabold', 800], ['ultrabold', 800], ['bold', 700], ['heavy', 900],
  ['black', 900], ['fat', 900],
];

function fontFormat(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' }[ext];
}

function fontFaces() {
  const css = [];
  // Bundled Vazirmatn: an Arabic-script file and a Latin file per weight, two families.
  for (const w of [400, 500, 700, 900]) {
    for (const [sub, fam] of [['arabic', 'Vazirmatn'], ['latin', 'Vazirmatn Latin']]) {
      const f = path.join(FONT_DIR, 'Vazirmatn', `vazirmatn-${sub}-${w}-normal.woff2`);
      if (fs.existsSync(f)) {
        css.push(`@font-face{font-family:'${fam}';font-weight:${w};font-style:normal;src:url('${pathToFileURL(f).href}') format('woff2');}`);
      }
    }
  }
  // User fonts: assets/fonts/user/<Family>/<file> (git-ignored). Weight from the file name.
  const userDir = path.join(FONT_DIR, 'user');
  const families = [];
  if (fs.existsSync(userDir)) {
    for (const fam of fs.readdirSync(userDir)) {
      const dir = path.join(userDir, fam);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const file of fs.readdirSync(dir)) {
        const fmt = fontFormat(file);
        if (!fmt) continue;
        const low = file.toLowerCase().replace(/[-_ ]/g, '');
        const hit = WEIGHT_WORDS.find(([word]) => low.includes(word));
        const weight = hit ? hit[1] : '100 900';
        css.push(`@font-face{font-family:'${fam}';font-weight:${weight};font-style:normal;src:url('${pathToFileURL(path.join(dir, file)).href}') format('${fmt}');}`);
      }
      families.push(fam);
    }
  }
  return { css: css.join('\n'), families };
}

const fontStack = (name) => `'${name}', 'Vazirmatn Latin', 'Vazirmatn', 'Tahoma', sans-serif`;

/* ------------------------------------------------------------------ icons & images */

let iconDir = null;
function findIconDir() {
  if (iconDir !== null) return iconDir;
  const candidates = [
    path.join(SKILL_DIR, 'node_modules', 'lucide-static', 'icons'),
    path.join(process.cwd(), 'node_modules', 'lucide-static', 'icons'),
  ];
  iconDir = candidates.find((d) => fs.existsSync(d)) || '';
  return iconDir;
}

const warnings = [];
const warn = (code, msg) => warnings.push(`${code.padEnd(9)} ${msg}`);

function iconSvg(name, size, color, stroke = 2) {
  const dir = findIconDir();
  if (!dir) {
    warn('NOICONS', 'lucide-static is not installed — run `npm install` in the skill folder');
    return '';
  }
  const file = path.join(dir, `${name}.svg`);
  if (!fs.existsSync(file)) {
    warn('ICON', `unknown icon "${name}" (see https://lucide.dev/icons)`);
    return '';
  }
  let svg = fs.readFileSync(file, 'utf8');
  svg = svg.replace(/<!--[\s\S]*?-->/g, '');
  svg = svg
    .replace(/width="[^"]*"/, `width="${size}"`)
    .replace(/height="[^"]*"/, `height="${size}"`)
    .replace(/stroke="currentColor"/, `stroke="${color}"`)
    .replace(/stroke-width="[^"]*"/, `stroke-width="${stroke}"`);
  return svg;
}

function resolveAsset(ref, baseDir) {
  if (!ref) return '';
  if (/^(https?:|data:|file:)/.test(ref)) return ref;
  const p = path.isAbsolute(ref) ? ref : path.join(baseDir, ref);
  if (!fs.existsSync(p)) {
    warn('MISSING', `file not found: ${ref}`);
    return '';
  }
  return pathToFileURL(p).href;
}

/** A visual: { image } (photo / PNG / SVG), or { icon } (lucide name). */
function visualHtml(v, baseDir, theme, opts = {}) {
  const size = opts.size || 360;
  if (v.image) {
    const src = resolveAsset(v.image, baseDir);
    const fit = v.fit || 'contain';
    const shape = v.shape || opts.shape || 'none'; // none | circle | rounded | blob
    return `<div class="visual img shape-${shape}" style="width:${v.w || size}px;height:${v.h || size}px">
      <img src="${src}" style="object-fit:${fit}"></div>`;
  }
  if (v.icon) {
    const inner = Math.round(size * 0.5);
    return `<div class="visual icon" style="width:${size}px;height:${size}px">
      <div class="icon-halo"></div>${iconSvg(v.icon, inner, v.color || theme.primary, v.stroke || 1.6)}</div>`;
  }
  return '';
}

/* ------------------------------------------------------------------ slides */

function slideTitle(s, ctx) {
  const v = s.image || s.icon ? visualHtml(s, ctx.baseDir, ctx.theme, { size: s.visualSize || 340 }) : '';
  return `<div class="body layout-title">
    ${v ? `<div class="vwrap">${v}</div>` : ''}
    <div class="text ${(s.card ?? ctx.autoCard) ? 'card' : ''}">
      ${s.kicker ? `<div class="kicker">${rich(s.kicker)}</div>` : ''}
      <h1 class="title fit" data-min="88">${rich(s.title || '')}</h1>
      ${s.sub ? `<p class="sub fit" data-min="28">${rich(s.sub)}</p>` : ''}
    </div>
  </div>`;
}

function slideContent(s, ctx) {
  const layout = s.layout || (s.image || s.icon ? 'visual-top' : 'text');
  const v = s.image || s.icon ? visualHtml(s, ctx.baseDir, ctx.theme, { size: s.visualSize || (layout === 'split' ? 340 : 300) }) : '';
  const badge = s.step != null ? `<div class="step">${ctx.num(s.step)}</div>` : '';
  const bullets = (s.bullets || [])
    .map((b) => {
      const item = typeof b === 'string' ? { text: b } : b;
      const ic = iconSvg(item.icon || 'check', 34, ctx.theme.primary, 2.4);
      return `<li><span class="bi">${ic}</span><span>${rich(item.text)}</span></li>`;
    })
    .join('');
  const big = s.big ? `<div class="big">${rich(ctx.digitize(s.big))}</div>` : '';
  const text = `<div class="text ${(s.card ?? ctx.autoCard) ? 'card' : ''}">
      ${badge}
      ${s.title ? `<h2 class="title fit" data-min="40">${rich(s.title)}</h2>` : ''}
      ${big}
      ${s.text ? `<p class="para fit" data-min="26">${rich(s.text)}</p>` : ''}
      ${bullets ? `<ul class="bullets fit" data-min="24">${bullets}</ul>` : ''}
    </div>`;
  const vw = v ? `<div class="vwrap">${v}</div>` : '';
  const order = layout === 'visual-bottom' ? text + vw : vw + text;
  return `<div class="body layout-${layout}">${order}</div>`;
}

function slideCta(s, ctx) {
  const v = s.image || s.icon ? visualHtml(s, ctx.baseDir, ctx.theme, { size: s.visualSize || 280 }) : '';
  const actions = (s.actions || [])
    .map((a) => {
      const item = typeof a === 'string' ? { text: a } : a;
      return `<div class="action">${iconSvg(item.icon || 'bookmark', 46, ctx.theme.primary, 2)}<span>${rich(item.text)}</span></div>`;
    })
    .join('');
  return `<div class="body layout-cta">
    ${v ? `<div class="vwrap">${v}</div>` : ''}
    <div class="text ${(s.card ?? ctx.autoCard) ? 'card' : ''}">
      ${s.title ? `<h2 class="title fit" data-min="48">${rich(s.title)}</h2>` : ''}
      ${s.text ? `<p class="para fit" data-min="26">${rich(s.text)}</p>` : ''}
      ${actions ? `<div class="actions">${actions}</div>` : ''}
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ header / footer */

function headerHtml(spec, ctx) {
  if (!spec.header.show) return '';
  const b = spec.brand;
  const logo = b.logo ? `<img class="logo" src="${resolveAsset(b.logo, ctx.baseDir)}">` : '';
  return `<header class="hdr ${spec.header.line ? 'with-line' : ''}">
    <div class="brand">${logo}${b.name ? `<span>${rich(b.name)}</span>` : ''}</div>
    <div class="handle"><bdi dir="ltr">${esc(b.handle || '')}</bdi></div>
  </header>`;
}

function footerHtml(spec, ctx, i, n) {
  if (!spec.footer.show) return '';
  const f = spec.footer;
  let pag = '';
  if (f.pagination === 'dots') {
    pag = `<div class="dots">${Array.from({ length: n }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>`;
  } else if (f.pagination === 'bar') {
    pag = `<div class="pbar"><i style="width:${(((i + 1) / n) * 100).toFixed(2)}%"></i></div>
      <div class="pnum">${ctx.num(i + 1)} / ${ctx.num(n)}</div>`;
  } else {
    const txt = f.format.replace('{n}', ctx.num(i + 1)).replace('{total}', ctx.num(n));
    pag = `<div class="pnum">${esc(txt)}</div>`;
  }
  const last = i === n - 1;
  const hint = !last && f.hint
    ? `<div class="hint">${esc(f.hint)}${f.hintIcon ? iconSvg(f.hintIcon, 30, spec.theme.muted, 2.2) : ''}</div>`
    : '<div class="hint"></div>';
  return `<footer class="ftr"><div class="side">${spec.footer.left ? rich(spec.footer.left) : ''}</div><div class="pag">${pag}</div>${hint}</footer>`;
}

/* ------------------------------------------------------------------ spine (the continuous line) */

/**
 * Builds the continuous line across the canvas. Control points: one per slide (at its
 * centre) plus one on every slide border. A slide can pin its own point: slide.spine = { y: 0.4 }.
 */
function spinePoints(spec, n) {
  const [W, H] = spec.size;
  const sp = spec.spine;
  const top = spec.header.height + 60;
  const bottom = H - spec.footer.height - 60;
  const base = { bottom: bottom - sp.amplitude, top: top + sp.amplitude, middle: H / 2, weave: H / 2, custom: H / 2 }[sp.track] ?? bottom - sp.amplitude;
  const pts = [];
  const startX = W * 0.12;
  const endX = n * W - W * 0.12;
  const amp = sp.amplitude;

  if (sp.track === 'wander') return wanderPoints(spec, n);
  if (sp.track === 'chart') return chartPoints(spec, n);

  const yAt = (k, onBorder) => {
    // k = position in slide units (0.5 = first slide centre, 1 = first border)
    if (sp.track === 'weave') {
      // swings between upper and lower thirds; content cards cover it where it passes behind
      return onBorder ? H / 2 : (Math.round(k - 0.5) % 2 === 0 ? H * 0.3 : H * 0.72);
    }
    switch (sp.shape) {
      case 'straight': return base;
      case 'zigzag': return base + (onBorder ? amp : -amp) * (sp.track === 'top' ? -1 : 1);
      case 'steps': return base + ((Math.floor(k) % 2) ? -amp : amp) * 0.8;
      default: return base + Math.sin(k * Math.PI) * amp; // wave
    }
  };

  pts.push({ x: startX, y: yAt(0.12, false), kind: 'start' });
  for (let i = 0; i < n; i++) {
    const s = spec.slides[i];
    const cx = i * W + W / 2;
    let cy = yAt(i + 0.5, false);
    if (s.spine && s.spine.y != null) cy = s.spine.y <= 1 ? s.spine.y * H : s.spine.y;
    if (i > 0 || cx > startX + 40) pts.push({ x: cx, y: cy, kind: 'node', slide: i });
    if (i < n - 1) {
      let by = yAt(i + 1, true);
      const nxt = spec.slides[i + 1];
      if (s.spine && s.spine.y != null && nxt.spine && nxt.spine.y != null) by = (cy + (nxt.spine.y <= 1 ? nxt.spine.y * H : nxt.spine.y)) / 2;
      pts.push({ x: (i + 1) * W, y: by, kind: 'border' });
    }
  }
  pts.push({ x: endX, y: yAt(n - 0.12, false), kind: 'end' });
  return pts;
}

/** Seeded PRNG, so the same spec always draws the same line. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * "wander": a smooth route that runs along the band under the header on some slides and the
 * band above the footer on others (seeded random choice). Between two slides on different
 * bands it makes one clean S-curve whose steep part sits on the slide border (in the side
 * margins), so it goes "from top to bottom" without ever crossing text. No jitter: every
 * piece is a single cubic curve with horizontal tangents at the nodes, so the line is always
 * smooth. Optional loops are perfect circles tangent to the line.
 */
function wanderPoints(spec, n) {
  const [W, H] = spec.size;
  const sp = spec.spine;
  const rnd = mulberry32(sp.seed ?? 7);
  const hh = spec.header.show ? spec.header.height : 50;
  const fh = spec.footer.show ? spec.footer.height : 50;
  const amp = sp.amplitude;
  const yTop = hh + 40 + amp * 0.3;
  const yBot = H - fh - 40 - amp * 0.3;

  const bands = [];
  for (let i = 0; i < n; i++) {
    const s = spec.slides[i];
    if (s.spine && (s.spine.band === 'top' || s.spine.band === 'bottom')) bands.push(s.spine.band === 'top' ? 0 : 1);
    else if (i === 0) bands.push(sp.startBand === 'bottom' ? 1 : 0);
    else bands.push(rnd() < (sp.switch ?? 0.7) ? 1 - bands[i - 1] : bands[i - 1]);
  }
  const loops = bands.map((_, i) => i > 0 && i < n - 1 && sp.loops > 0 && rnd() < sp.loops);
  const yb = (b) => (b ? yBot : yTop);
  const nodeX = (i) => i * W + W / 2;

  const pts = [{ x: W * 0.1, y: yb(bands[0]), kind: 'start' }];
  for (let i = 0; i < n; i++) pts.push({ x: nodeX(i), y: yb(bands[i]), kind: 'node', slide: i });
  pts.push({ x: n * W - W * 0.1, y: yb(bands[n - 1]), kind: 'end' });
  // the point just before the end (for the arrowhead angle): the last segment is horizontal
  pts.splice(pts.length - 1, 0, { x: n * W - W * 0.1 - 10, y: yb(bands[n - 1]), kind: 'mid' });
  pts.bands = bands;
  pts.loops = loops;
  pts.yTop = yTop;
  pts.yBot = yBot;
  return pts;
}

function wanderPath(spec, pts) {
  const [W] = spec.size;
  const sp = spec.spine;
  const amp = sp.amplitude;
  const nodes = pts.filter((p) => p.kind === 'node');
  const r = Math.max(26, Math.min(42, amp * 0.8));
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0].x)},${f(pts[0].y)} L${f(nodes[0].x)},${f(nodes[0].y)}`;
  let sway = 1;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    let ax = a.x;
    if (pts.loops[i]) {
      // a perfect circle tangent to the line, bulging toward the slide centre
      const inward = pts.bands[i] ? -1 : 1;
      const lx = a.x + W * 0.14;
      d += ` L${f(lx)},${f(a.y)} a${r},${r} 0 1 ${inward > 0 ? 1 : 0} 0,${f(inward * 2 * r)} a${r},${r} 0 1 ${inward > 0 ? 1 : 0} 0,${f(-inward * 2 * r)}`;
      ax = lx;
    }
    const b = nodes[i + 1];
    if (!b) break;
    const span = b.x - ax;
    if (pts.bands[i] === pts.bands[i + 1]) {
      // same band: one soft arc, alternating up/down so it breathes
      const inward = pts.bands[i] ? -1 : 1;
      const dy = inward * amp * 0.5 * sway;
      sway = -sway;
      d += ` C${f(ax + span * 0.4)},${f(a.y + dy)} ${f(b.x - span * 0.4)},${f(b.y + dy)} ${f(b.x)},${f(b.y)}`;
    } else {
      // band change: run along the band, then one clean S-curve that stays inside the side
      // margins around the border (its control hull is bx ± turn, so it never reaches text)
      const bx = (a.slide + 1) * W;
      const m = sp.turn ?? spec.padding;
      d += ` C${f(ax + (bx - m - ax) * 0.5)},${f(a.y)} ${f(bx - m - 60)},${f(a.y)} ${f(bx - m)},${f(a.y)}`;
      d += ` C${f(bx + m * 0.15)},${f(a.y)} ${f(bx - m * 0.15)},${f(b.y)} ${f(bx + m)},${f(b.y)}`;
      d += ` C${f(bx + m + 60)},${f(b.y)} ${f(b.x - (b.x - bx - m) * 0.5)},${f(b.y)} ${f(b.x)},${f(b.y)}`;
    }
  }
  const last = pts[pts.length - 1];
  d += ` L${f(last.x)},${f(last.y)}`;
  return d;
}

/** Chart band (where the "chart" line lives), shared by the line and the reserved space. */
function chartBand(spec) {
  const [, H] = spec.size;
  const sp = spec.spine;
  const hh = spec.header.show ? spec.header.height : 50;
  const fh = spec.footer.show ? spec.footer.height : 50;
  const h = sp.chartHeight <= 1 ? sp.chartHeight * H : sp.chartHeight;
  if (sp.chartPosition === 'top') return { top: hh + 30, bottom: hh + 30 + h };
  return { top: H - fh - 30 - h, bottom: H - fh - 30 };
}

/**
 * "chart": the line behaves like a line chart running through the whole post — one smooth,
 * monotone curve (no overshoot, no kinks) through a value at every slide centre and border,
 * inside its own band above the footer (or under the header). Values are seeded-random with an
 * optional trend (up / down / none), so it reads like a growth chart. Optional soft area fill.
 */
function chartPoints(spec, n) {
  const [W] = spec.size;
  const sp = spec.spine;
  const rnd = mulberry32(sp.seed ?? 7);
  const band = chartBand(spec);
  const pad = sp.width * 3 + 34; // room for the nodes inside the band
  const lo = band.bottom - pad, hi = band.top + pad;
  const trend = { up: 1, down: -1, none: 0 }[sp.trend ?? 'up'] ?? 1;
  const K = n * 2; // a value at every slide centre and every border
  const xs = [W * 0.1];
  for (let k = 1; k < K; k++) xs.push((k * W) / 2);
  xs.push(n * W - W * 0.1);
  const vals = xs.map((_, k) => {
    const t = k / (xs.length - 1);
    const base = trend > 0 ? 0.15 + 0.7 * t : trend < 0 ? 0.85 - 0.7 * t : 0.5;
    // alternate peaks and valleys (like a real line chart), with random size
    const swing = (k % 2 === 1 ? 1 : -1) * (0.35 + rnd() * 0.65);
    const noise = swing * (sp.noise ?? 0.55) * 0.5;
    return Math.max(0, Math.min(1, base + noise));
  });
  // pinned values: slide.spine.value (0 = bottom of the band, 1 = top)
  spec.slides.forEach((s, i) => { if (s.spine && s.spine.value != null) vals[2 * i + 1] = s.spine.value; });
  const pts = xs.map((x, k) => {
    const kind = k === 0 ? 'start' : k === xs.length - 1 ? 'end' : k % 2 === 1 ? 'node' : 'border';
    const p = { x, y: lo + (hi - lo) * vals[k], kind };
    if (kind === 'node') p.slide = (k - 1) / 2;
    return p;
  });
  pts.band = band;
  return pts;
}

/** Monotone cubic (Fritsch–Carlson) through the points: smooth, never overshoots. */
function monotonePath(pts) {
  const n = pts.length;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; m[i] = (pts[i + 1].y - pts[i].y) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0].x)},${f(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${f(pts[i].x + h)},${f(pts[i].y + t[i] * h)} ${f(pts[i + 1].x - h)},${f(pts[i + 1].y - t[i + 1] * h)} ${f(pts[i + 1].x)},${f(pts[i + 1].y)}`;
  }
  return d;
}

function pathFrom(pts, shape) {
  if (shape === 'zigzag' || shape === 'steps') {
    if (shape === 'steps') {
      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        const mx = (p.x + q.x) / 2;
        d += ` L${mx - 30},${p.y} Q${mx},${p.y} ${mx},${(p.y + q.y) / 2} Q${mx},${q.y} ${mx + 30},${q.y} L${q.x},${q.y}`;
      }
      return d;
    }
    return 'M' + pts.map((p) => `${p.x},${p.y}`).join(' L');
  }
  // Catmull-Rom → cubic Bézier: smooth curve through every point.
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const t = 0.5;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t * 2, c1y = p1.y + ((p2.y - p0.y) / 6) * t * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * t * 2, c2y = p2.y - ((p3.y - p1.y) / 6) * t * 2;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

function spineSvg(spec, ctx, n) {
  const sp = spec.spine;
  if (!sp.show) return '';
  const [W, H] = spec.size;
  const total = W * n;
  const pts = spinePoints(spec, n);
  const d = sp.track === 'wander' ? wanderPath(spec, pts) : sp.track === 'chart' ? monotonePath(pts) : pathFrom(pts, sp.shape);
  const area = sp.track === 'chart' && sp.area
    ? `<path d="${d} L${pts[pts.length - 1].x},${pts.band.bottom} L${pts[0].x},${pts.band.bottom} Z" fill="url(#areaGrad)" stroke="none"/>`
    : '';
  const t = spec.theme;
  const stroke = t.line || 'url(#spineGrad)';
  const dash = sp.dash === 'dashed' ? `stroke-dasharray="${sp.width * 4} ${sp.width * 3}"` : sp.dash === 'dotted' ? `stroke-dasharray="0.1 ${sp.width * 3}" stroke-linecap="round"` : '';
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const ang = (Math.atan2(last.y - prev.y, last.x - prev.x) * 180) / Math.PI;
  const arrow = sp.arrow
    ? `<g transform="translate(${last.x},${last.y}) rotate(${ang.toFixed(1)})"><path d="M-6,-${sp.width * 3.2} L${sp.width * 4},0 L-6,${sp.width * 3.2} Z" fill="${t.line || t.secondary}"/></g>`
    : `<circle cx="${last.x}" cy="${last.y}" r="${sp.width * 2.4}" fill="${t.line || t.secondary}"/>`;
  const start = `<circle cx="${pts[0].x}" cy="${pts[0].y}" r="${sp.width * 2.2}" fill="${t.line || t.primary}"/>`;
  const nodes = sp.nodes
    ? pts.filter((p) => p.kind === 'node').map((p) => {
        const s = spec.slides[p.slide];
        if (s.spine && s.spine.node === false) return '';
        if (sp.nodeStyle === 'number') {
          return `<g class="node"><circle cx="${p.x}" cy="${p.y}" r="34" fill="${t.bg}" stroke="${t.line || t.primary}" stroke-width="${sp.width}"/>
            <text x="${p.x}" y="${p.y + 12}" text-anchor="middle" font-size="34" font-weight="900" fill="${t.text}">${ctx.num(p.slide + 1)}</text></g>`;
        }
        if (sp.nodeStyle === 'icon' && s.nodeIcon) {
          return `<g class="node"><circle cx="${p.x}" cy="${p.y}" r="40" fill="${t.bg}" stroke="${t.line || t.primary}" stroke-width="${sp.width}"/>
            <g transform="translate(${p.x - 22},${p.y - 22})">${iconSvg(s.nodeIcon, 44, t.text, 2)}</g></g>`;
        }
        return `<circle cx="${p.x}" cy="${p.y}" r="${sp.width * 2.6}" fill="${t.bg}" stroke="${t.line || t.primary}" stroke-width="${sp.width}"/>`;
      }).join('')
    : '';
  return `<svg class="spine" width="${total}" height="${H}" viewBox="0 0 ${total} ${H}">
    <defs>
      <linearGradient id="spineGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${total}" y2="0">
        <stop offset="0" stop-color="${t.primary}"/><stop offset="1" stop-color="${t.secondary}"/>
      </linearGradient>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.primary}" stop-opacity="${sp.area === true ? 0.22 : sp.area}"/><stop offset="1" stop-color="${t.primary}" stop-opacity="0"/></linearGradient>
      <filter id="glow" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="${sp.width * 1.6}"/></filter>
    </defs>
    ${area}
    ${sp.glow ? `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sp.width * 2.2}" opacity="0.55" filter="url(#glow)" ${dash}/>` : ''}
    <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sp.width}" stroke-linecap="round" stroke-linejoin="round" ${dash}/>
    ${start}${nodes}${arrow}
  </svg>`;
}

/* ------------------------------------------------------------------ bridges & free canvas elements */

/** Elements that sit ON slide borders, so half of each shows on two neighbouring slides. */
function autoBridges(spec, n) {
  // Kept small (less than 2 x padding) and inside the free bands, so they never touch text:
  // a shape just under the header, alternating with a soft glow on the spine band.
  const [, H] = spec.size;
  const out = [];
  const size = Math.min(200, spec.padding * 2 - 30);
  const topY = (spec.header.show ? spec.header.height : 50) + size / 2 + 10;
  const kinds = ['ring', 'circle', 'blob'];
  if (spec.spine.show && spec.spine.track === 'chart') {
    // a soft glow where the chart crosses each border (the top area is left to the content)
    const c = chartPoints(spec, n);
    c.filter((p) => p.kind === 'border').forEach((p, k) => {
      out.push({ kind: 'glow', x: p.x / spec.size[0], y: p.y, size: 240, color: k % 2 ? 'primary' : 'secondary', opacity: 0.45 });
    });
    return out;
  }
  if (spec.spine.show && spec.spine.track === 'wander') {
    const w = wanderPoints(spec, n);
    for (let i = 1; i < n; i++) {
      const a = w.bands[i - 1], b = w.bands[i];
      if (a === b) {
        // line stays in one band: put a shape on the empty band across the border
        out.push({ kind: i % 2 ? 'ring' : 'blob', x: i, y: a ? w.yTop : w.yBot, size: size * 0.8, color: i % 2 ? 'primary' : 'secondary', opacity: i % 2 ? 0.85 : 0.45, width: 12 });
      } else {
        // line climbs/drops here: a soft glow where it crosses the border
        out.push({ kind: 'glow', x: i, y: H / 2, size: size * 1.5, color: 'secondary', opacity: 0.5 });
      }
    }
    return out;
  }
  for (let i = 1; i < n; i++) {
    if (i % 2 === 1 || !spec.spine.show) {
      out.push({ kind: kinds[Math.floor(i / 2) % kinds.length], x: i, y: topY, size, color: i % 4 === 1 ? 'primary' : 'secondary', opacity: 0.85, width: 14 });
    } else {
      const band = reservedBands(spec);
      out.push({ kind: 'glow', x: i, y: band.spineY, size: size * 1.6, color: 'secondary', opacity: 0.55 });
    }
  }
  return out;
}

/** The spine's band, reserved so text never sits on the line. */
function reservedBands(spec) {
  const [, H] = spec.size;
  const sp = spec.spine;
  const hh = spec.header.show ? spec.header.height : 50;
  const fh = spec.footer.show ? spec.footer.height : 50;
  const r = { top: 0, bottom: 0, spineY: H / 2 };
  if (!sp.show) return r;
  const reach = sp.amplitude * 2 + (sp.nodeStyle === 'ring' ? sp.width * 3 : 44) + 30;
  if (sp.track === 'chart') {
    const b = chartBand(spec);
    if (sp.chartPosition === 'top') r.top = b.bottom - hh + 10; else r.bottom = H - fh - b.top + 10;
    r.spineY = (b.top + b.bottom) / 2;
  }
  if (sp.track === 'wander') {
    const reachW = sp.amplitude * 0.8 + 50 + (sp.loops ? 90 : 0);
    r.top = reachW; r.bottom = reachW; r.spineY = H / 2;
  }
  if (sp.track === 'bottom') { r.bottom = reach + 40; r.spineY = H - fh - 60 - sp.amplitude; }
  if (sp.track === 'top') { r.top = reach + 40; r.spineY = hh + 60 + sp.amplitude; }
  return r;
}

function colorOf(c, theme) {
  if (!c) return theme.primary;
  return theme[c] || c;
}

function canvasEl(el, spec, ctx) {
  const [W, H] = spec.size;
  const t = spec.theme;
  const size = el.size || 260;
  const cx = el.x * W; // x in slide units: 1 = border between slide 1 and 2, 1.5 = middle of slide 2
  const cy = el.y <= 1 ? el.y * H : el.y;
  const col = colorOf(el.color, t);
  const op = el.opacity != null ? el.opacity : 1;
  const rot = el.rotate || 0;
  const box = (inner, w = size, h = size, extra = '') =>
    `<div class="cel ${extra}" style="left:${cx - w / 2}px;top:${cy - h / 2}px;width:${w}px;height:${h}px;opacity:${op};transform:rotate(${rot}deg)">${inner}</div>`;
  switch (el.kind) {
    case 'circle':
      return box(`<div style="width:100%;height:100%;border-radius:50%;background:${col}"></div>`);
    case 'ring':
      return box(`<div style="width:100%;height:100%;border-radius:50%;border:${el.width || 18}px solid ${col}"></div>`);
    case 'blob':
      return box(`<div style="width:100%;height:100%;background:${col};border-radius:58% 42% 63% 37% / 45% 55% 45% 55%;filter:blur(${el.blur ?? 0}px)"></div>`);
    case 'glow':
      return box(`<div style="width:100%;height:100%;border-radius:50%;background:radial-gradient(circle, ${col} 0%, transparent 70%)"></div>`);
    case 'icon':
      return box(iconSvg(el.icon, size, col, el.stroke || 1.5));
    case 'image': {
      const src = resolveAsset(el.image, ctx.baseDir);
      return box(`<img src="${src}" style="width:100%;height:100%;object-fit:${el.fit || 'contain'}">`, el.w || size, el.h || size, el.shadow ? 'shadow' : '');
    }
    case 'text':
      return `<div class="cel ctext" style="left:${cx}px;top:${cy}px;font-size:${el.fontSize || 220}px;color:${col};opacity:${op};transform:translate(-50%,-50%) rotate(${rot}deg)">${rich(ctx.digitize(el.text || ''))}</div>`;
    case 'arrow': {
      // curved arrow from x to x2 (slide units), useful to point from one slide to the next
      const x2 = (el.x2 != null ? el.x2 : el.x + 0.5) * W;
      const y2 = el.y2 != null ? (el.y2 <= 1 ? el.y2 * H : el.y2) : cy;
      const midx = (cx + x2) / 2, midy = Math.min(cy, y2) - (el.bend ?? 120);
      return `<svg class="cel" style="left:0;top:0;opacity:${op}" width="${W * ctx.n}" height="${H}">
        <path d="M${cx},${cy} Q${midx},${midy} ${x2},${y2}" fill="none" stroke="${col}" stroke-width="${el.width || 6}" stroke-linecap="round" ${el.dash ? 'stroke-dasharray="18 14"' : ''}/>
        <circle cx="${x2}" cy="${y2}" r="${(el.width || 6) * 2}" fill="${col}"/></svg>`;
    }
    default:
      warn('CANVAS', `unknown canvas element kind "${el.kind}"`);
      return '';
  }
}

/* ------------------------------------------------------------------ page */

function backgroundCss(spec) {
  const t = spec.theme;
  const [W, H] = spec.size;
  const n = spec.slides.length;
  switch (spec.background) {
    case 'solid':
      return `background:${t.bg};`;
    case 'grid':
      return `background-color:${t.bg};background-image:linear-gradient(${t.surface} 1px,transparent 1px),linear-gradient(90deg,${t.surface} 1px,transparent 1px);background-size:60px 60px;`;
    case 'dots':
      return `background-color:${t.bg};background-image:radial-gradient(${t.surface} 2px,transparent 2px);background-size:36px 36px;`;
    default:
      // one gradient across the WHOLE canvas, so colour flows from slide to slide
      return `background:linear-gradient(100deg, ${t.bg} 0%, ${t.bg2} ${Math.round(100 / Math.max(n - 1, 1))}%, ${t.bg} 55%, ${t.bg2} 100%);background-size:${W * n}px ${H}px;`;
  }
}

function buildHtml(spec, baseDir) {
  const [W, H] = spec.size;
  const n = spec.slides.length;
  const t = spec.theme;
  const ff = fontFaces();
  for (const role of ['display', 'body']) {
    const f = spec.fonts[role];
    if (f && !['Vazirmatn', 'Tahoma'].includes(f) && !ff.families.includes(f)) {
      warn('FONT', `font "${f}" not found in assets/fonts/user/ — falling back to Vazirmatn`);
    }
  }
  const ctx = {
    baseDir,
    theme: t,
    n,
    // with the line running through the middle, text sits on cards that the line passes behind
    autoCard: spec.spine.show && ['weave', 'middle', 'custom'].includes(spec.spine.track),
    num: (v) => (spec.digits === 'fa' ? toFa(v) : String(v)),
    digitize: (v) => (spec.digits === 'fa' ? toFa(v) : String(v)),
  };

  const slidesHtml = spec.slides
    .map((s, i) => {
      let body = '';
      if (s.type === 'title') body = slideTitle(s, ctx);
      else if (s.type === 'cta') body = slideCta(s, ctx);
      else body = slideContent(s, ctx);
      return `<section class="slide s-${s.type || 'content'}" style="left:${i * W}px" data-i="${i}">
        ${headerHtml(spec, ctx)}${body}${footerHtml(spec, ctx, i, n)}</section>`;
    })
    .join('\n');

  const bridges = spec.bridges === 'auto' ? autoBridges(spec, n) : Array.isArray(spec.bridges) ? spec.bridges : [];
  const under = [...bridges, ...spec.canvas.filter((e) => !e.front)].map((e) => canvasEl(e, spec, ctx)).join('\n');
  const over = spec.canvas.filter((e) => e.front).map((e) => canvasEl(e, spec, ctx)).join('\n');

  const P = spec.padding;
  const band = reservedBands(spec);
  const hh = spec.header.show ? spec.header.height : 50;
  const fh = spec.footer.show ? spec.footer.height : 50;

  return `<!doctype html>
<html lang="${spec.lang}" dir="${spec.dir}"><head><meta charset="utf-8">
<style>
${ff.css}
:root{--bg:${t.bg};--surface:${t.surface};--primary:${t.primary};--secondary:${t.secondary};--text:${t.text};--muted:${t.muted};}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W * n}px;height:${H}px;overflow:hidden}
body{${backgroundCss(spec)}color:var(--text);font-family:${fontStack(spec.fonts.body)};-webkit-font-smoothing:antialiased;position:relative}
.layer{position:absolute;inset:0;width:${W * n}px;height:${H}px;pointer-events:none}
.spine{position:absolute;left:0;top:0}
.cel{position:absolute;display:flex;align-items:center;justify-content:center}
.cel.shadow img{filter:drop-shadow(0 30px 40px rgba(0,0,0,.45))}
.ctext{font-family:${fontStack(spec.fonts.display)};font-weight:900;white-space:nowrap;line-height:1}
.slide{position:absolute;top:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;z-index:3}
.hdr{height:${hh}px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 ${P * 0.7}px;font-size:26px;color:var(--muted);font-weight:500}
.hdr.with-line{border-bottom:1.5px solid var(--surface)}
.hdr .brand{display:flex;align-items:center;gap:14px;font-weight:700;color:var(--text);opacity:.9}
.hdr .logo{height:44px;width:auto}
.hdr .handle{font-family:'Vazirmatn Latin','Vazirmatn',sans-serif;letter-spacing:.5px}
.ftr{height:${fh}px;flex:none;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 ${P * 0.7}px;color:var(--muted);font-size:26px;font-weight:500}
.ftr .hint{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.ftr .pnum{font-weight:700;color:var(--text);opacity:.85;padding:0 12px}
.dots{display:flex;gap:10px}.dots i{width:12px;height:12px;border-radius:6px;background:var(--muted);opacity:.45}
.dots i.on{width:38px;background:var(--primary);opacity:1}
.pbar{width:240px;height:8px;border-radius:4px;background:var(--surface);overflow:hidden;margin-inline-end:14px}.pbar i{display:block;height:100%;background:linear-gradient(90deg,var(--primary),var(--secondary))}
.ftr .pag{display:flex;align-items:center;justify-content:center}
.body{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:40px;padding:${20 + band.top}px ${P}px ${20 + band.bottom}px}
.slide.no-band .body{padding-top:20px;padding-bottom:20px}
.text{display:flex;flex-direction:column;gap:26px;flex-shrink:0}
.text.card{background:${t.bg};border:1.5px solid var(--surface);border-radius:36px;padding:48px;box-shadow:0 30px 80px rgba(0,0,0,.25)}
.vwrap{display:flex;justify-content:center;flex:none}
.visual{position:relative;display:flex;align-items:center;justify-content:center}
.visual img{width:100%;height:100%}
.visual.shape-circle{border-radius:50%;overflow:hidden;border:8px solid var(--primary)}
.visual.shape-rounded{border-radius:40px;overflow:hidden}
.visual.shape-blob{border-radius:58% 42% 63% 37% / 45% 55% 45% 55%;overflow:hidden}
.visual.icon svg{position:relative;z-index:2}
.icon-halo{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle, color-mix(in srgb, var(--primary) 35%, transparent) 0%, transparent 68%)}
.kicker{display:inline-flex;align-self:flex-start;font-size:32px;font-weight:700;color:var(--bg);background:var(--primary);padding:8px 26px;border-radius:40px}
h1.title{font-family:${fontStack(spec.fonts.display)};font-size:${spec.titleSize || 118}px;line-height:1.2;font-weight:900}
h2.title{font-family:${fontStack(spec.fonts.display)};font-size:${spec.headingSize || 72}px;line-height:1.3;font-weight:900}
.sub{font-size:40px;line-height:1.7;color:var(--muted);font-weight:500}
.para{font-size:${spec.textSize || 40}px;line-height:1.85;font-weight:400;color:var(--text);opacity:.92}
.big{font-family:${fontStack(spec.fonts.display)};font-size:200px;line-height:1;font-weight:900;color:var(--primary)}
.bullets{list-style:none;display:flex;flex-direction:column;gap:22px;font-size:${spec.textSize || 40}px;line-height:1.6}
.bullets li{display:flex;gap:18px;align-items:flex-start}.bullets .bi{flex:none;margin-top:.25em;display:flex}
.step{width:96px;height:96px;border-radius:30px;background:var(--primary);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:900;font-family:${fontStack(spec.fonts.display)}}
.layout-title{justify-content:center;gap:56px}
.layout-split{flex-direction:row;align-items:center}.layout-split .text{flex:1}
.layout-cta{align-items:center;text-align:center}.layout-cta .text{align-items:center}
.actions{display:flex;gap:28px;flex-wrap:wrap;justify-content:center;margin-top:10px}
.action{display:flex;flex-direction:column;align-items:center;gap:12px;font-size:32px;font-weight:700;background:var(--surface);border-radius:28px;padding:26px 34px;min-width:200px}
.hl{color:var(--primary)}.hl2{color:var(--secondary)}
.strike{text-decoration:line-through;text-decoration-color:var(--primary);text-decoration-thickness:6px;opacity:.7}
.ltr{font-family:'Vazirmatn Latin','Vazirmatn',sans-serif;direction:ltr;unicode-bidi:isolate}
.guides .g{position:absolute;top:0;width:0;height:${H}px;border-left:3px dashed rgba(255,0,80,.8)}
</style></head>
<body>
  <div class="layer" style="z-index:1">${spineSvg(spec, ctx, n)}</div>
  <div class="layer" style="z-index:2">${under}</div>
  ${slidesHtml}
  <div class="layer" style="z-index:4">${over}</div>
<script>
// Shrink text that overflows its slide until it fits (or reaches data-min).
window.__fit = async () => {
  await document.fonts.ready;
  const report = [];
  document.querySelectorAll('.slide').forEach((slide) => {
    const body = slide.querySelector('.body');
    const fits = [...slide.querySelectorAll('.fit')];
    let guard = 0;
    const over = () => body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1;
    while (over() && guard++ < 80) {
      let changed = false;
      for (const el of fits) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        const min = parseFloat(el.dataset.min || 24);
        if (fs > min) { el.style.fontSize = Math.max(min, fs * 0.96) + 'px'; changed = true; }
      }
      // text alone can't fit: shrink the visual too (down to 35% of its size)
      slide.querySelectorAll('.visual').forEach((v) => {
        const w0 = parseFloat(v.dataset.w0 || (v.dataset.w0 = v.offsetWidth));
        const h0 = parseFloat(v.dataset.h0 || (v.dataset.h0 = v.offsetHeight));
        const w = v.offsetWidth;
        if (w > w0 * 0.35) {
          const k = (w * 0.95) / w0;
          v.style.width = w0 * k + 'px'; v.style.height = h0 * k + 'px';
          const svg = v.querySelector('svg'); if (svg) { svg.setAttribute('width', w0 * k * 0.5); svg.setAttribute('height', w0 * k * 0.5); }
          changed = true;
        }
      });
      if (!changed) break;
    }
    const shrunk = fits.filter(el => el.style.fontSize).map(el => el.className.split(' ')[0] + '→' + Math.round(parseFloat(el.style.fontSize)) + 'px');
    report.push({ i: +slide.dataset.i, overflow: over(), shrunk });
  });
  return report;
};
window.__guides = (W, n) => {
  const g = document.createElement('div'); g.className = 'layer guides'; g.style.zIndex = 9;
  for (let i = 1; i < n; i++) { const l = document.createElement('div'); l.className = 'g'; l.style.left = (i * W) + 'px'; g.appendChild(l); }
  document.body.appendChild(g);
};
</script>
</body></html>`;
}

/* ------------------------------------------------------------------ validate */

function validate(spec) {
  if (!Array.isArray(spec.slides) || spec.slides.length < 2) throw new Error('spec.slides must have at least 2 slides');
  if (spec.slides.length > 20) throw new Error('Instagram allows at most 20 slides');
  if (spec.slides[0].type !== 'title') throw new Error('slide 1 must be a "title" slide (type: "title")');
  spec.slides.forEach((s, i) => {
    const words = [s.title, s.text, ...(s.bullets || []).map((b) => (typeof b === 'string' ? b : b.text))].filter(Boolean).join(' ').split(/\s+/).length;
    if (i > 0 && words > 70) warn('DENSE', `slide ${i + 1} has ~${words} words — split it across two slides`);
    const all = JSON.stringify(s);
    if (EMOJI_RE.test(all)) warn('EMOJI', `slide ${i + 1} contains emoji — use an icon or image instead`);
  });
  if (!spec.brand.handle) warn('HEADER', 'brand.handle is empty — the header will show no page id');
}

/* ------------------------------------------------------------------ render */

async function launch() {
  const { chromium } = require('playwright');
  const tries = [];
  if (process.env.CHROME_PATH) tries.push({ executablePath: process.env.CHROME_PATH });
  tries.push({}, { channel: 'chrome' }, { channel: 'msedge' });
  let last;
  for (const opt of tries) {
    try { return await chromium.launch(opt); } catch (e) { last = e; }
  }
  throw new Error('Could not start Chrome/Chromium. Run `npx playwright install chromium` or set CHROME_PATH.\n' + last.message);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args[0] || args[0] === '-h' || args[0] === '--help') {
    console.log('Usage: node scripts/build.js <spec.json> [check|preview|full] [--out <dir>]');
    process.exit(args[0] ? 0 : 1);
  }
  const specPath = path.resolve(args[0]);
  const mode = ['check', 'preview', 'full'].includes(args[1]) ? args[1] : 'full';
  const oi = args.indexOf('--out');
  const baseDir = path.dirname(specPath);
  const outDir = path.resolve(oi > -1 ? args[oi + 1] : path.join(baseDir, 'out'));
  fs.mkdirSync(outDir, { recursive: true });

  const raw = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  // optional brand kit: ~/.config/seamless-carousel/brand.json (the spec overrides it; "brandKit": false skips it)
  let kit = {};
  const kitPath = path.join(require('os').homedir(), '.config', 'seamless-carousel', 'brand.json');
  if (raw.brandKit !== false && fs.existsSync(kitPath)) {
    try { kit = JSON.parse(fs.readFileSync(kitPath, 'utf8')); } catch (e) { warn('BRANDKIT', `cannot read ${kitPath}: ${e.message}`); }
  }
  const spec = deepMerge(deepMerge(DEFAULTS, kit), raw);
  spec.slides = raw.slides; // arrays are replaced, not merged
  spec.canvas = raw.canvas || [];
  validate(spec);

  const [W, H] = spec.size;
  const n = spec.slides.length;
  const htmlPath = path.join(outDir, 'carousel.html');
  fs.writeFileSync(htmlPath, buildHtml(spec, baseDir));

  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: W * n, height: H }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  const report = await page.evaluate(() => window.__fit());
  await page.waitForTimeout(150);

  for (const r of report) {
    if (r.overflow) warn('OVERFLOW', `slide ${r.i + 1}: text still overflows at minimum size — shorten it or split the slide`);
    else if (r.shrunk.length) warn('SHRUNK', `slide ${r.i + 1}: text shrunk to fit (${r.shrunk.join(', ')})`);
  }

  if (mode !== 'check') {
    if (mode === 'full') {
      for (let i = 0; i < n; i++) {
        const file = path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: file, clip: { x: i * W, y: 0, width: W, height: H } });
      }
    }
    // strip: the whole canvas in one image; slide borders marked in preview mode
    const stripScale = Math.min(1, 3200 / (W * n));
    const p2 = await browser.newPage({ viewport: { width: W * n, height: H }, deviceScaleFactor: stripScale });
    await p2.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await p2.evaluate(() => window.__fit());
    if (mode === 'preview') await p2.evaluate(([w, k]) => window.__guides(w, k), [W, n]);
    await p2.screenshot({ path: path.join(outDir, 'strip.jpg'), type: 'jpeg', quality: 85 });
  }
  await browser.close();

  console.log(`${n} slides · ${W}×${H} · mode ${mode} → ${outDir}`);
  if (warnings.length) console.log(warnings.map((w) => '  ' + w).join('\n'));
  else console.log('  no issues');
}

main().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
