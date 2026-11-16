// Reeling the Sun — ai-excited-01, v3.
// A child on a cliff flies a red diamond kite. The kite line has caught
// the enormous setting sun and is hauling it down into the sea.
// Violet dusk melts into gold, the water carries a glittering path back
// to the sun, birds scatter from the pull. One small figure, one huge
// sky, one taut diagonal between them.
// Concept decided by a 3-round panel (won every round, Borda 38 vs 27):
// sun radius 165 centred at (648, 575), horizon at y 700, oversized kite.
// Written fresh in this session, under recording 01a1e224.
// Node 22+, standard library only. Deterministic: fixed seed, no clock,
// no network, no environment input. Two runs write identical PNG bytes.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// Mulberry32 with a fixed seed: cheap, stable, and repeatable anywhere.
let seed = 20261116;
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

type RGB = [number, number, number];

// The canvas lives as floats so every blend stays smooth until the
// final quantise step; bytes are produced only by the PNG writer.
const canvas = new Float32Array(W * H * 3);

function cell(x: number, y: number): number {
  return (y * W + x) * 3;
}

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function blend3(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Alpha-composite one pixel; out-of-bounds and zero-alpha are no-ops.
function put(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  if (a > 1) a = 1;
  const i = cell(x, y);
  const keep = 1 - a;
  canvas[i] = c[0] * a + canvas[i] * keep;
  canvas[i + 1] = c[1] * a + canvas[i + 1] * keep;
  canvas[i + 2] = c[2] * a + canvas[i + 2] * keep;
}

function setRow(y: number, c: RGB): void {
  for (let x = 0; x < W; x++) {
    const i = cell(x, y);
    canvas[i] = c[0];
    canvas[i + 1] = c[1];
    canvas[i + 2] = c[2];
  }
}

// --- Sky -----------------------------------------------------------------
// Violet zenith, magenta dusk, ember, then gold at the waterline; below
// the horizon the sea takes over later, so the lowest band here is just
// a warm shadow the water will cover.
const SKY: Array<{ at: number; c: RGB }> = [
  { at: 0.0, c: [43, 26, 78] },
  { at: 0.34, c: [178, 62, 110] },
  { at: 0.55, c: [255, 138, 61] },
  { at: 0.66, c: [255, 205, 92] },
  { at: 0.68, c: [214, 96, 92] },
  { at: 1.0, c: [24, 32, 74] },
];

function skyAt(t: number): RGB {
  let k = 0;
  while (k < SKY.length - 2 && t > SKY[k + 1].at) k++;
  const lo = SKY[k];
  const hi = SKY[k + 1];
  const f = hi.at === lo.at ? 0 : clamp01((t - lo.at) / (hi.at - lo.at));
  return blend3(lo.c, hi.c, f);
}

for (let y = 0; y < H; y++) setRow(y, skyAt(y / (H - 1)));

// Early stars high up, fading as the glow near the horizon takes over.
for (let n = 0; n < 160; n++) {
  const sx = rand() * W;
  const sy = rand() * 300;
  const sr = 0.7 + rand() * 1.6;
  const fade = 1 - sy / 340;
  const sa = 0.25 + rand() * 0.6 * fade;
  softDisc(sx, sy, sr, [255, 244, 214], sa);
}

function softDisc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover = clamp01((r + 0.6 - d) / 1.2);
      if (cover > 0) put(x, y, c, a * cover);
    }
  }
}

// --- Shape helpers -------------------------------------------------------
// Soft ellipse: full colour at the centre, a short falloff at the rim.
function softEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 2));
  const y0 = Math.max(0, Math.floor(cy - ry - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const cover = clamp01((1.04 - Math.hypot(dx, dy)) / 0.08);
      if (cover > 0) put(x, y, c, a * cover);
    }
  }
}

type Pt = [number, number];

function pointInPoly(px: number, py: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Filled polygon, even-odd rule, antialiased with 2x2 subsampling.
function poly(pts: Pt[], c: RGB, a = 1): void {
  let loX = W;
  let hiX = 0;
  let loY = H;
  let hiY = 0;
  for (const [px, py] of pts) {
    if (px < loX) loX = px;
    if (px > hiX) hiX = px;
    if (py < loY) loY = py;
    if (py > hiY) hiY = py;
  }
  const x0 = Math.max(0, Math.floor(loX - 1));
  const x1 = Math.min(W - 1, Math.ceil(hiX + 1));
  const y0 = Math.max(0, Math.floor(loY - 1));
  const y1 = Math.min(H - 1, Math.ceil(hiY + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let hits = 0;
      for (const oy of [0.25, 0.75]) {
        for (const ox of [0.25, 0.75]) {
          if (pointInPoly(x + ox, y + oy, pts)) hits++;
        }
      }
      if (hits > 0) put(x, y, c, (a * hits) / 4);
    }
  }
}

// Thick soft-edged segment, measured by distance to the segment.
function thick(ax: number, ay: number, bx: number, by: number, w: number, c: RGB, a = 1): void {
  const pad = w / 2 + 2;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + pad));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      const cover = clamp01((w / 2 + 0.6 - d) / 1.2);
      if (cover > 0) put(x, y, c, a * cover);
    }
  }
}

function bezierPoint(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

// Quadratic curve as a chain of short thick segments.
function bezier(p0: Pt, p1: Pt, p2: Pt, w: number, c: RGB, a = 1): void {
  let [px, py] = p0;
  const steps = 140;
  for (let i = 1; i <= steps; i++) {
    const [nx, ny] = bezierPoint(p0, p1, p2, i / steps);
    thick(px, py, nx, ny, w, c, a);
    px = nx;
    py = ny;
  }
}

// --- Sun, sea, clouds, birds ---------------------------------------------
// Winning geometry: sun radius 165, centre (648, 575), horizon y 700.
// The disc is half-dipped: its lower half is painted over by the sea.
const SUN_X = 648;
const SUN_Y = 575;
const SUN_R = 165;
const HORIZON = 700;

// Halo: wide faint rings, brightest near the disc.
for (let r = 350; r > SUN_R; r -= 12) {
  softDisc(SUN_X, SUN_Y, r, [255, 170, 80], 0.028);
}
// The disc itself, layered inward so it glows instead of lying flat.
const SUN_LAYERS: Array<[number, RGB]> = [
  [165, [255, 196, 90]],
  [147, [255, 214, 116]],
  [125, [255, 228, 148]],
  [103, [255, 236, 170]],
];
for (const [r, col] of SUN_LAYERS) softDisc(SUN_X, SUN_Y, r, col, 1);

// Sea: everything below the horizon, ember at the waterline fading to
// deep night blue at the bottom edge.
const SEA_TOP: RGB = [214, 96, 92];
const SEA_DEEP: RGB = [24, 32, 74];
for (let y = HORIZON; y < H; y++) {
  const t = (y - HORIZON) / (H - HORIZON);
  setRow(y, blend3(SEA_TOP, SEA_DEEP, Math.min(1, t * 1.15)));
}

// Sun reflection: short horizontal dashes in a widening column under
// the sun, fading as they run down the water.
for (let n = 0; n < 240; n++) {
  const ry = 708 + rand() * 310;
  const spread = 26 + ((ry - 708) / 310) * 150;
  const rx = SUN_X + (rand() - 0.5) * 2 * spread;
  const len = 14 + rand() * 66;
  const ra = 0.1 + rand() * 0.42 * (1 - (ry - 708) / 400);
  thick(rx - len / 2, ry, rx + len / 2, ry, 3.2, [255, 190, 110], ra);
}

// Clouds: warm-lit soft blobs flanking the sun, kept translucent so
// they read as sky, never as solid pills.
const CLOUD_COLOURS: RGB[] = [[255, 170, 120], [214, 96, 120], [150, 70, 130]];
const CLOUD_SPOTS: Array<[number, number, number]> = [[150, 190, 1.0], [880, 150, 0.85]];
for (const [cx, cy, s] of CLOUD_SPOTS) {
  for (let k = 0; k < 6; k++) {
    const ox = (rand() - 0.5) * 130 * s;
    const oy = (rand() - 0.5) * 18 * s;
    const rw = (42 + rand() * 38) * s;
    const rh = (11 + rand() * 9) * s;
    softEllipse(cx + ox, cy + oy, rw, rh, CLOUD_COLOURS[k % 3], 0.32);
  }
}

// Birds scattering away from the sun's pull.
const BIRD: RGB = [30, 18, 52];
const BIRDS: Array<[number, number, number]> = [[420, 210, 1], [470, 180, 0.8], [830, 240, 1.1], [790, 200, 0.7]];
for (const [bx, by, bs] of BIRDS) {
  thick(bx - 14 * bs, by, bx, by - 7 * bs, 2.4, BIRD, 0.9);
  thick(bx, by - 7 * bs, bx + 14 * bs, by, 2.4, BIRD, 0.9);
}

// --- Cliff, child, kite, strings -----------------------------------------
const ROCK: RGB = [26, 16, 44];
const KITE_RED: RGB = [232, 38, 62];
const LINE: RGB = [255, 235, 200];

// Cliff in the bottom-left. Its plateau top near x 210 sits near y 789,
// which is where the child's feet land.
poly([[0, 1024], [0, 812], [150, 782], [268, 800], [330, 872], [392, 1024]], ROCK, 1);
// Sunset catching the cliff rim.
thick(150, 782, 268, 800, 3, [255, 150, 90], 0.55);
thick(268, 800, 330, 872, 3, [255, 150, 90], 0.35);

// Child silhouette, about 72 px tall. HX/HY anchor the body; feet at HY+26.
const HX = 210;
const HY = 764;
softDisc(HX - 2, HY - 46, 8.5, ROCK, 1); // head
poly([[HX - 9, HY - 38], [HX + 5, HY - 38], [HX + 8, HY - 6], [HX - 6, HY - 6]], ROCK, 1); // torso
thick(HX - 4, HY - 6, HX - 10, HY + 26, 5, ROCK, 1); // back leg
thick(HX + 3, HY - 6, HX + 12, HY + 24, 5, ROCK, 1); // front leg, planted
thick(HX + 2, HY - 34, HX + 20, HY - 52, 4.5, ROCK, 1); // arm raised to the line

// Red diamond kite, high left and oversized — the sweep winner.
const KX = 318;
const KY = 268;
poly([[KX, KY - 78], [KX + 56, KY], [KX, KY + 78], [KX - 56, KY]], KITE_RED, 1);
thick(KX, KY - 78, KX, KY + 78, 2.5, [255, 255, 255], 0.85); // spine
thick(KX - 56, KY, KX + 56, KY, 2.5, [255, 255, 255], 0.85); // spar

// Tail: one wavy line from the kite's bottom point, three small bows
// as diamonds sitting ON the line, never floating free of it.
const TAIL_A: Pt = [KX, KY + 78];
const TAIL_B: Pt = [KX - 26, KY + 120];
const TAIL_C: Pt = [KX + 6, KY + 165];
bezier(TAIL_A, TAIL_B, TAIL_C, 2, [255, 210, 180], 0.85);
for (let i = 1; i <= 3; i++) {
  const [tx, ty] = bezierPoint(TAIL_A, TAIL_B, TAIL_C, i / 4);
  // Diamond vertices in outline order (top, right, bottom, left) so
  // the fill is one solid diamond, not a bowtie split in two.
  poly([[tx, ty - 11], [tx + 8, ty], [tx, ty + 11], [tx - 8, ty]], KITE_RED, 0.95);
}

// Strings: hand to kite (slack), kite to sun (taut, hooked).
// Hook point (527, 463) sits on the sun's rim along the kite direction:
// centre (648, 575), radius 165, direction to the kite (-0.735, -0.679).
const HAND: Pt = [HX + 20, HY - 52];
bezier(HAND, [260, 480], [KX, KY + 74], 2.2, LINE, 0.9);
bezier([KX + 42, KY + 42], [440, 385], [527, 463], 2.6, LINE, 0.95);
// Glint where the line bites the sun's rim.
softDisc(527, 463, 7, [255, 250, 210], 0.95);
softDisc(527, 463, 3.5, [255, 255, 255], 1);

// --- PNG writer: RGB, filter 0, zlib level 9, hand-rolled CRC ------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(kind: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(kind, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function byte(v: number): number {
  const q = Math.round(v);
  if (q < 0) return 0;
  if (q > 255) return 255;
  return q;
}

const stride = 1 + W * 3;
const raw = Buffer.alloc(H * stride);
for (let y = 0; y < H; y++) {
  const row = y * stride;
  raw[row] = 0; // filter: none
  for (let x = 0; x < W; x++) {
    const i = cell(x, y);
    const o = row + 1 + x * 3;
    raw[o] = byte(canvas[i]);
    raw[o + 1] = byte(canvas[i + 1]);
    raw[o + 2] = byte(canvas[i + 2]);
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bits per channel
ihdr[9] = 2; // truecolour RGB
ihdr[10] = 0; // compression: deflate
ihdr[11] = 0; // filter: adaptive (we use 0 per row)
ihdr[12] = 0; // interlace: none

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), png);
