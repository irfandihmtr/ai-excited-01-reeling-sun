// Reeling the Sun — ai-excited-01, v4.
// Written from scratch in this session, under recording 01a1e246.
// The idea, chosen by a 3-round panel that won every round (Borda 38-27):
// a small child on a cliff flies a big red diamond kite, and the kite's
// string has snagged the enormous setting sun, dragging it down to the sea.
// One tiny figure, one huge sky, one taut line between them. Violet dusk
// above, gold at the waterline, a glittering path back to the sun, birds
// scattering from the pull. Winning geometry kept: sun radius 165 at
// (648, 575), horizon at y 700, oversized kite high on the left.
// Node 22+, standard library only. Fixed seed, no clock, no network, no
// environment input beyond the output directory: two runs are byte-identical.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;
const SUN_X = 648;
const SUN_Y = 575;
const SUN_R = 165;
const HORIZON = 700;

// SplitMix32, seeded once. Every "random" dab in the picture comes from
// this stream in a fixed order, so the picture is fully reproducible.
let state = 20261116;
function nextRand(): number {
  state = (state + 0x9e3779b9) | 0;
  let z = state;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  z = z ^ (z >>> 15);
  return (z >>> 0) / 4294967296;
}

type RGB = [number, number, number];
type Pt = [number, number];

// The picture lives as floats until the very end, so blends stay smooth
// and only the final PNG step quantises to bytes.
const frame = new Float32Array(W * H * 3);

function idx(x: number, y: number): number {
  return (y * W + x) * 3;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Composite one pixel over what is already there.
function dab(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  if (a > 1) a = 1;
  const i = idx(x, y);
  const rest = 1 - a;
  frame[i] = c[0] * a + frame[i] * rest;
  frame[i + 1] = c[1] * a + frame[i + 1] * rest;
  frame[i + 2] = c[2] * a + frame[i + 2] * rest;
}

function paintRow(y: number, c: RGB): void {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    frame[i] = c[0];
    frame[i + 1] = c[1];
    frame[i + 2] = c[2];
  }
}

// --- Sky ---------------------------------------------------------------
const DUSK: Array<{ at: number; c: RGB }> = [
  { at: 0.0, c: [40, 24, 76] },
  { at: 0.32, c: [172, 58, 108] },
  { at: 0.54, c: [252, 132, 60] },
  { at: 0.65, c: [255, 202, 88] },
  { at: 0.68, c: [208, 92, 90] },
  { at: 1.0, c: [22, 30, 72] },
];

function duskAt(t: number): RGB {
  let k = 0;
  while (k < DUSK.length - 2 && t > DUSK[k + 1].at) k++;
  const lo = DUSK[k];
  const hi = DUSK[k + 1];
  const f = hi.at === lo.at ? 0 : clamp01((t - lo.at) / (hi.at - lo.at));
  return mix(lo.c, hi.c, f);
}

for (let y = 0; y < H; y++) paintRow(y, duskAt(y / (H - 1)));

// Soft disc: solid centre, short feathered rim.
function disc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover = clamp01((r + 0.6 - d) / 1.2);
      if (cover > 0) dab(x, y, c, a * cover);
    }
  }
}

// First stars, high in the violet, thinning out toward the glow.
for (let n = 0; n < 150; n++) {
  const sx = nextRand() * W;
  const sy = nextRand() * 290;
  const sr = 0.7 + nextRand() * 1.5;
  const fade = 1 - sy / 330;
  disc(sx, sy, sr, [255, 243, 212], 0.22 + nextRand() * 0.58 * fade);
}

// --- Shape helpers -------------------------------------------------------
// Soft ellipse: full colour inside, a short falloff at the edge.
function oval(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 2));
  const y0 = Math.max(0, Math.floor(cy - ry - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const cover = clamp01((1.04 - Math.hypot(dx, dy)) / 0.08);
      if (cover > 0) dab(x, y, c, a * cover);
    }
  }
}

function insidePoly(px: number, py: number, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0];
    const yi = pts[i][1];
    const xj = pts[j][0];
    const yj = pts[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Filled polygon, antialiased by 2x2 subsampling inside each pixel.
function fill(pts: Pt[], c: RGB, a = 1): void {
  let loX = W;
  let hiX = 0;
  let loY = H;
  let hiY = 0;
  for (const p of pts) {
    if (p[0] < loX) loX = p[0];
    if (p[0] > hiX) hiX = p[0];
    if (p[1] < loY) loY = p[1];
    if (p[1] > hiY) hiY = p[1];
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
          if (insidePoly(x + ox, y + oy, pts)) hits++;
        }
      }
      if (hits > 0) dab(x, y, c, (a * hits) / 4);
    }
  }
}

// Thick line with a soft edge, by distance to the segment.
function stroke(ax: number, ay: number, bx: number, by: number, w: number, c: RGB, a = 1): void {
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
      if (cover > 0) dab(x, y, c, a * cover);
    }
  }
}

function quadPoint(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

// Quadratic curve drawn as a chain of short strokes.
function curve(p0: Pt, p1: Pt, p2: Pt, w: number, c: RGB, a = 1): void {
  let px = p0[0];
  let py = p0[1];
  const steps = 140;
  for (let i = 1; i <= steps; i++) {
    const np = quadPoint(p0, p1, p2, i / steps);
    stroke(px, py, np[0], np[1], w, c, a);
    px = np[0];
    py = np[1];
  }
}

// --- Sun, sea, clouds, birds -------------------------------------------
// The sun hangs half-dipped: its lower half will be covered by the sea.
for (let r = 348; r > SUN_R; r -= 12) {
  disc(SUN_X, SUN_Y, r, [255, 168, 78], 0.028);
}
// Layered inward so the disc glows instead of lying flat.
const SUN_CORE: Array<[number, RGB]> = [
  [165, [255, 194, 88]],
  [146, [255, 212, 114]],
  [124, [255, 227, 146]],
  [102, [255, 235, 168]],
];
for (const layer of SUN_CORE) disc(SUN_X, SUN_Y, layer[0], layer[1], 1);

// Sea: everything below the horizon, ember at the waterline fading to
// deep night blue at the bottom edge.
const SEA_TOP: RGB = [212, 94, 90];
const SEA_DEEP: RGB = [22, 30, 72];
for (let y = HORIZON; y < H; y++) {
  const t = (y - HORIZON) / (H - HORIZON);
  paintRow(y, mix(SEA_TOP, SEA_DEEP, Math.min(1, t * 1.15)));
}

// Sun glitter: short horizontal dashes in a widening column under the
// sun, fading as they run down the water.
for (let n = 0; n < 240; n++) {
  const ry = 708 + nextRand() * 310;
  const spread = 26 + ((ry - 708) / 310) * 150;
  const rx = SUN_X + (nextRand() - 0.5) * 2 * spread;
  const len = 14 + nextRand() * 66;
  const ra = 0.1 + nextRand() * 0.42 * (1 - (ry - 708) / 400);
  stroke(rx - len / 2, ry, rx + len / 2, ry, 3.2, [255, 188, 108], ra);
}

// Clouds: warm-lit soft blobs flanking the sun, translucent so they
// read as sky, never as solid pills.
const CLOUD_TINTS: RGB[] = [[255, 168, 118], [212, 94, 118], [148, 68, 128]];
const CLOUD_ANCHORS: Array<[number, number, number]> = [[150, 190, 1.0], [880, 150, 0.85]];
for (const anchor of CLOUD_ANCHORS) {
  for (let k = 0; k < 6; k++) {
    const ox = (nextRand() - 0.5) * 130 * anchor[2];
    const oy = (nextRand() - 0.5) * 18 * anchor[2];
    const rw = (42 + nextRand() * 38) * anchor[2];
    const rh = (11 + nextRand() * 9) * anchor[2];
    oval(anchor[0] + ox, anchor[1] + oy, rw, rh, CLOUD_TINTS[k % 3], 0.32);
  }
}

// Birds scattering away from the sun's pull.
const BIRD: RGB = [28, 16, 50];
const FLOCK: Array<[number, number, number]> = [[420, 210, 1], [470, 180, 0.8], [830, 240, 1.1], [790, 200, 0.7]];
for (const bird of FLOCK) {
  const bx = bird[0];
  const by = bird[1];
  const bs = bird[2];
  stroke(bx - 14 * bs, by, bx, by - 7 * bs, 2.4, BIRD, 0.9);
  stroke(bx, by - 7 * bs, bx + 14 * bs, by, 2.4, BIRD, 0.9);
}

// --- Cliff, child, kite, strings -----------------------------------------
const ROCK: RGB = [24, 14, 42];
const KITE_RED: RGB = [230, 36, 60];
const STRING: RGB = [255, 234, 198];

// Cliff in the bottom-left. Its plateau top near x 210 sits near y 789,
// which is where the child's feet land.
fill([[0, 1024], [0, 812], [150, 782], [268, 800], [330, 872], [392, 1024]], ROCK, 1);
// Sunset catching the cliff rim.
stroke(150, 782, 268, 800, 3, [255, 148, 88], 0.55);
stroke(268, 800, 330, 872, 3, [255, 148, 88], 0.35);

// Child silhouette, about 72 px tall. CX/CY anchor the body; feet at CY+26.
const CX = 210;
const CY = 764;
disc(CX - 2, CY - 46, 8.5, ROCK, 1); // head
fill([[CX - 9, CY - 38], [CX + 5, CY - 38], [CX + 8, CY - 6], [CX - 6, CY - 6]], ROCK, 1); // torso
stroke(CX - 4, CY - 6, CX - 10, CY + 26, 5, ROCK, 1); // back leg
stroke(CX + 3, CY - 6, CX + 12, CY + 24, 5, ROCK, 1); // front leg, planted
stroke(CX + 2, CY - 34, CX + 20, CY - 52, 4.5, ROCK, 1); // arm raised to the line

// Red diamond kite, high left and oversized — the panel's winning shape.
const KX = 318;
const KY = 268;
fill([[KX, KY - 78], [KX + 56, KY], [KX, KY + 78], [KX - 56, KY]], KITE_RED, 1);
stroke(KX, KY - 78, KX, KY + 78, 2.5, [255, 255, 255], 0.85); // spine
stroke(KX - 56, KY, KX + 56, KY, 2.5, [255, 255, 255], 0.85); // spar

// Tail: one wavy line from the kite's bottom point, three small bows as
// diamonds sitting ON the line, never floating free of it.
const TAIL_A: Pt = [KX, KY + 78];
const TAIL_B: Pt = [KX - 26, KY + 120];
const TAIL_C: Pt = [KX + 6, KY + 165];
curve(TAIL_A, TAIL_B, TAIL_C, 2, [255, 208, 178], 0.85);
for (let i = 1; i <= 3; i++) {
  const tp = quadPoint(TAIL_A, TAIL_B, TAIL_C, i / 4);
  // Diamond vertices in outline order (top, right, bottom, left) so the
  // fill is one solid diamond, not a bowtie split in two.
  fill([[tp[0], tp[1] - 11], [tp[0] + 8, tp[1]], [tp[0], tp[1] + 11], [tp[0] - 8, tp[1]]], KITE_RED, 0.95);
}

// Strings: hand to kite (slack), kite to sun (taut, hooked).
// Hook point (527, 463) sits on the sun's rim along the kite direction:
// centre (648, 575), radius 165, direction to the kite (-0.735, -0.679).
const HAND: Pt = [CX + 20, CY - 52];
curve(HAND, [260, 480], [KX, KY + 74], 2.2, STRING, 0.9);
curve([KX + 42, KY + 42], [440, 385], [527, 463], 2.6, STRING, 0.95);
// Glint where the line bites the sun's rim.
disc(527, 463, 7, [255, 249, 208], 0.95);
disc(527, 463, 3.5, [255, 255, 255], 1);

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

function pngChunk(kind: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(kind, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function toByte(v: number): number {
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
    const i = idx(x, y);
    const o = row + 1 + x * 3;
    raw[o] = toByte(frame[i]);
    raw[o + 1] = toByte(frame[i + 1]);
    raw[o + 2] = toByte(frame[i + 2]);
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
  pngChunk("IHDR", ihdr),
  pngChunk("IDAT", deflateSync(raw, { level: 9 })),
  pngChunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), png);
