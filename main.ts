// Reeling the Sun — ai-excited-01 entry, v2.
// A small child on a cliff flies a red diamond kite, and the kite string
// has hooked the huge setting sun, reeling it down toward the sea.
// Violet-to-gold dusk, a glittering reflection path on the water, birds
// scattering from the pull. One look, one jolt: a tiny figure hauling
// the whole sky down.
// Concept chosen by panel (3 rounds, 8 models): "Reeling the Sun" won
// outright. Winning geometry from the 7-variant sweep, kept here:
// sun radius 165, horizon at y=700, oversized kite.
// Node 22+, standard library only. Fully deterministic: fixed seed,
// no clock, no environment input. Two runs produce byte-identical PNGs.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const S = 1024;

// ---- seeded random: xorshift32, fixed seed ----
let state = 0x51ab3c9d;
function rnd(): number {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return state / 4294967296;
}

// ---- paint surface: float RGB, one byte per channel at the end ----
const img = new Float32Array(S * S * 3);
type Col = [number, number, number];
const at = (x: number, y: number): number => (y * S + x) * 3;

function paint(x: number, y: number, c: Col, alpha: number): void {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  if (alpha <= 0) return;
  if (alpha > 1) alpha = 1;
  const i = at(x, y);
  const rest = 1 - alpha;
  img[i] = c[0] * alpha + img[i] * rest;
  img[i + 1] = c[1] * alpha + img[i + 1] * rest;
  img[i + 2] = c[2] * alpha + img[i + 2] * rest;
}

function mixCol(a: Col, b: Col, t: number): Col {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Fill every row by interpolating between colour stops.
function skyGradient(stops: Array<[number, Col]>): void {
  for (let y = 0; y < S; y++) {
    const t = y / (S - 1);
    let s = 0;
    while (s < stops.length - 2 && t > stops[s + 1][0]) s++;
    const [ta, ca] = stops[s];
    const [tb, cb] = stops[s + 1];
    const f = tb === ta ? 0 : clamp01((t - ta) / (tb - ta));
    const c = mixCol(ca, cb, f);
    for (let x = 0; x < S; x++) {
      const i = at(x, y);
      img[i] = c[0];
      img[i + 1] = c[1];
      img[i + 2] = c[2];
    }
  }
}

// Soft-edged disc: full colour inside, ~1px falloff at the rim.
function disc(cx: number, cy: number, r: number, c: Col, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(S - 1, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2));
  const y1 = Math.min(S - 1, Math.ceil(cy + r + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover = clamp01((r + 0.6 - d) / 1.2);
      if (cover > 0) paint(x, y, c, alpha * cover);
    }
  }
}

function blob(cx: number, cy: number, rx: number, ry: number, c: Col, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 2));
  const x1 = Math.min(S - 1, Math.ceil(cx + rx + 2));
  const y0 = Math.max(0, Math.floor(cy - ry - 2));
  const y1 = Math.min(S - 1, Math.ceil(cy + ry + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const cover = clamp01((1.04 - Math.hypot(dx, dy)) / 0.08);
      if (cover > 0) paint(x, y, c, alpha * cover);
    }
  }
}

// Filled polygon, even-odd rule, antialiased by 2x2 subsampling.
function fillPoly(pts: Array<[number, number]>, c: Col, alpha = 1): void {
  let minX = S;
  let maxX = 0;
  let minY = S;
  let maxY = 0;
  for (const [px, py] of pts) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const x0 = Math.max(0, Math.floor(minX - 1));
  const x1 = Math.min(S - 1, Math.ceil(maxX + 1));
  const y0 = Math.max(0, Math.floor(minY - 1));
  const y1 = Math.min(S - 1, Math.ceil(maxY + 1));
  const insideAt = (x: number, y: number): boolean => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0];
      const yi = pts[i][1];
      const xj = pts[j][0];
      const yj = pts[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let hits = 0;
      for (const oy of [0.25, 0.75]) {
        for (const ox of [0.25, 0.75]) {
          if (insideAt(x + ox, y + oy)) hits++;
        }
      }
      if (hits > 0) paint(x, y, c, (alpha * hits) / 4);
    }
  }
}

// Thick segment with a soft edge, via distance to the segment.
function stroke(ax: number, ay: number, bx: number, by: number, w: number, c: Col, alpha = 1): void {
  const pad = w / 2 + 2;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
  const x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad));
  const y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by) + pad));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      const cover = clamp01((w / 2 + 0.6 - d) / 1.2);
      if (cover > 0) paint(x, y, c, alpha * cover);
    }
  }
}

// Quadratic curve drawn as a chain of short strokes.
function curve(p0: [number, number], p1: [number, number], p2: [number, number], w: number, c: Col, alpha = 1): void {
  let prevX = p0[0];
  let prevY = p0[1];
  for (let i = 1; i <= 140; i++) {
    const t = i / 140;
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    stroke(prevX, prevY, x, y, w, c, alpha);
    prevX = x;
    prevY = y;
  }
}

function curvePoint(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

// ---- palette ----
const DEEP_VIOLET: Col = [43, 26, 78];
const DUSK_MAGENTA: Col = [178, 62, 110];
const EMBER: Col = [255, 138, 61];
const GOLDEN: Col = [255, 205, 92];
const SUN_HEART: Col = [255, 236, 170];
const SEA_NIGHT: Col = [24, 32, 74];
const SEA_EMBER: Col = [214, 96, 92];
const ROCK: Col = [26, 16, 44];
const KITE: Col = [232, 38, 62];
const STRING: Col = [255, 235, 200];

// Winning geometry (panel sweep, 7 variants): sun radius 165,
// horizon at y = 700, sun centre (648, 575) — half-dipped in the sea.
const SUN_X = 648;
const SUN_Y = 575;
const SUN_R = 165;
const HORIZON = 700;

// ---- sky: violet zenith melting through magenta and orange to gold ----
skyGradient([
  [0, DEEP_VIOLET],
  [0.34, DUSK_MAGENTA],
  [0.55, EMBER],
  [0.66, GOLDEN],
  [0.67, SEA_EMBER],
  [1, SEA_NIGHT],
]);

// Early stars in the upper sky, thinning out toward the horizon glow.
for (let i = 0; i < 160; i++) {
  const sx = rnd() * S;
  const sy = rnd() * 300;
  const sr = 0.7 + rnd() * 1.6;
  const fade = 1 - sy / 340;
  paintStar(sx, sy, sr, 0.25 + rnd() * 0.6 * fade);
}
function paintStar(x: number, y: number, r: number, a: number): void {
  disc(x, y, r, [255, 244, 214], a);
}

// Sun halo: wide faint rings stacked outward, brightest near the disc.
for (let r = 350; r > SUN_R; r -= 12) {
  disc(SUN_X, SUN_Y, r, [255, 170, 80], 0.028);
}
// Sun disc in layered rings, so it glows warm instead of flat pale.
disc(SUN_X, SUN_Y, 165, [255, 196, 90], 1);
disc(SUN_X, SUN_Y, 147, [255, 214, 116], 1);
disc(SUN_X, SUN_Y, 125, [255, 228, 148], 1);
disc(SUN_X, SUN_Y, 103, SUN_HEART, 1);

// Sea band covers the sun's lower half: repaint everything below the
// horizon as water shading from ember at the waterline to deep night.
for (let y = HORIZON; y < S; y++) {
  const t = (y - HORIZON) / (S - HORIZON);
  const c = mixCol(SEA_EMBER, SEA_NIGHT, Math.min(1, t * 1.15));
  for (let x = 0; x < S; x++) {
    const i = at(x, y);
    img[i] = c[0];
    img[i + 1] = c[1];
    img[i + 2] = c[2];
  }
}

// Sun reflection: short horizontal dashes in a widening column
// under the sun, fading as they run down the water.
for (let i = 0; i < 240; i++) {
  const ry = 708 + rnd() * 310;
  const spread = 26 + ((ry - 708) / 310) * 150;
  const rx = SUN_X + (rnd() - 0.5) * 2 * spread;
  const len = 14 + rnd() * 66;
  const a = 0.1 + rnd() * 0.42 * (1 - (ry - 708) / 400);
  stroke(rx - len / 2, ry, rx + len / 2, ry, 3.2, [255, 190, 110], a);
}

// ---- clouds: warm-lit soft blobs flanking the sun, kept translucent
// so they read as sky, never as solid pills ----
const CLOUD_TINTS: Col[] = [[255, 170, 120], [214, 96, 120], [150, 70, 130]];
const cloudGroups: Array<[number, number, number]> = [[150, 190, 1.0], [880, 150, 0.85]];
for (const [cx, cy, s] of cloudGroups) {
  for (let k = 0; k < 6; k++) {
    const ox = (rnd() - 0.5) * 130 * s;
    const oy = (rnd() - 0.5) * 18 * s;
    const rw = (42 + rnd() * 38) * s;
    const rh = (11 + rnd() * 9) * s;
    blob(cx + ox, cy + oy, rw, rh, CLOUD_TINTS[k % 3], 0.32);
  }
}

// ---- birds scattering away from the sun's pull ----
const BIRD: Col = [30, 18, 52];
const birds: Array<[number, number, number]> = [[420, 210, 1], [470, 180, 0.8], [830, 240, 1.1], [790, 200, 0.7]];
for (const [bx, by, bs] of birds) {
  stroke(bx - 14 * bs, by, bx, by - 7 * bs, 2.4, BIRD, 0.9);
  stroke(bx, by - 7 * bs, bx + 14 * bs, by, 2.4, BIRD, 0.9);
}

// ---- cliff, bottom-left, and the child on its edge ----
// Plateau top near x=210 sits at about y=789; the child's feet land there.
fillPoly([[0, 1024], [0, 812], [150, 782], [268, 800], [330, 872], [392, 1024]], ROCK, 1);
// Sunset catching the cliff rim.
stroke(150, 782, 268, 800, 3, [255, 150, 90], 0.55);
stroke(268, 800, 330, 872, 3, [255, 150, 90], 0.35);

// Child silhouette, ~72px tall. HX/HY anchor the body; feet at HY+26.
const HX = 210;
const HY = 764;
disc(HX - 2, HY - 46, 8.5, ROCK, 1); // head
fillPoly([[HX - 9, HY - 38], [HX + 5, HY - 38], [HX + 8, HY - 6], [HX - 6, HY - 6]], ROCK, 1); // torso
stroke(HX - 4, HY - 6, HX - 10, HY + 26, 5, ROCK, 1); // back leg
stroke(HX + 3, HY - 6, HX + 12, HY + 24, 5, ROCK, 1); // front leg
stroke(HX + 2, HY - 34, HX + 20, HY - 52, 4.5, ROCK, 1); // arm raised to the string

// ---- red diamond kite, high left, oversized (sweep winner) ----
const KX = 318;
const KY = 268;
fillPoly([[KX, KY - 78], [KX + 56, KY], [KX, KY + 78], [KX - 56, KY]], KITE, 1);
stroke(KX, KY - 78, KX, KY + 78, 2.5, [255, 255, 255], 0.85); // spine
stroke(KX - 56, KY, KX + 56, KY, 2.5, [255, 255, 255], 0.85); // spar

// Tail: one wavy line from the kite's bottom point, three small bows
// as diamonds sitting ON the line, never floating free of it.
const tailStart: [number, number] = [KX, KY + 78];
const tailMid: [number, number] = [KX - 26, KY + 120];
const tailEnd: [number, number] = [KX + 6, KY + 165];
curve(tailStart, tailMid, tailEnd, 2, [255, 210, 180], 0.85);
for (let i = 1; i <= 3; i++) {
  const [tx, ty] = curvePoint(tailStart, tailMid, tailEnd, i / 4);
  fillPoly([[tx - 8, ty], [tx + 8, ty], [tx, ty + 11], [tx, ty - 11]], KITE, 0.95);
}

// ---- strings: hand -> kite (slack), kite -> sun (taut, hooked) ----
// Hook point (527, 463) sits on the sun's rim along the kite direction:
// centre (648, 575), radius 165, direction to the kite (-0.735, -0.679).
const HAND: [number, number] = [HX + 20, HY - 52];
curve(HAND, [260, 480], [KX, KY + 74], 2.2, STRING, 0.9);
curve([KX + 42, KY + 42], [440, 385], [527, 463], 2.6, STRING, 0.95);
// Glint where the string bites the sun's rim.
disc(527, 463, 7, [255, 250, 210], 0.95);
disc(527, 463, 3.5, [255, 255, 255], 1);

// ---- PNG writer: RGB, filter 0, zlib level 9, hand-rolled CRC ----
function buildCrcTable(): Int32Array {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
}
const CRC_TABLE = buildCrcTable();

function crcOf(bytes: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(kind: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(kind, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crcOf(body), 0);
  return Buffer.concat([size, body, crc]);
}

function quantize(v: number): number {
  const q = Math.round(v);
  return q < 0 ? 0 : q > 255 ? 255 : q;
}

const stride = 1 + S * 3;
const raw = Buffer.alloc(S * stride);
for (let y = 0; y < S; y++) {
  const rowStart = y * stride;
  raw[rowStart] = 0; // filter: none
  for (let x = 0; x < S; x++) {
    const i = at(x, y);
    const o = rowStart + 1 + x * 3;
    raw[o] = quantize(img[i]);
    raw[o + 1] = quantize(img[i + 1]);
    raw[o + 2] = quantize(img[i + 2]);
  }
}

const header = Buffer.alloc(13);
header.writeUInt32BE(S, 0);
header.writeUInt32BE(S, 4);
header[8] = 8; // 8 bits per channel
header[9] = 2; // truecolour RGB
header[10] = 0; // compression: deflate
header[11] = 0; // filter: adaptive (we use 0 per row)
header[12] = 0; // interlace: none

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  pngChunk("IHDR", header),
  pngChunk("IDAT", deflateSync(raw, { level: 9 })),
  pngChunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), png);
