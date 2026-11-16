// "Reeling the Sun" — ai-excited-01 entry.
// Panel winner: 3 independent rounds, orders swapped, A won all 3 (38 Borda pts
// vs 27/26/18/11) with the best worst-round rank. See panel/SUMMARY.md (workspace).
// Node 22, standard library only. Draws a 1024x1024 PNG procedurally, fully
// deterministic: fixed seed, no clock, no randomness from the environment.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---- deterministic PRNG (mulberry32, fixed seed) ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261116);

// ---- canvas: RGB float buffer, opaque ----
const buf = new Float32Array(W * H * 3);
type RGB = [number, number, number];
function idx(x: number, y: number): number { return (y * W + x) * 3; }
function blend(x: number, y: number, c: RGB, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  if (a > 1) a = 1;
  const i = idx(x, y);
  buf[i] = c[0] * a + buf[i] * (1 - a);
  buf[i + 1] = c[1] * a + buf[i + 1] * (1 - a);
  buf[i + 2] = c[2] * a + buf[i + 2] * (1 - a);
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Vertical gradient over the whole canvas from colour stops.
function vgrad(stops: [number, RGB][]): void {
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
    const c = mix(c0, c1, Math.max(0, Math.min(1, f)));
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
    }
  }
}

// Antialiased filled circle (soft edge width ~1.2px).
function circle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cov = Math.max(0, Math.min(1, (r + 0.6 - d) / 1.2));
      if (cov > 0) blend(x, y, c, a * cov);
    }
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(cx - rx - 2));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 2));
  const y0 = Math.max(0, Math.floor(cy - ry - 2));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 2));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.hypot(dx, dy);
      const cov = Math.max(0, Math.min(1, (1.04 - d) / 0.08));
      if (cov > 0) blend(x, y, c, a * cov);
    }
  }
}

// Filled polygon with 1px antialiased edge.
function poly(pts: [number, number][], c: RGB, a = 1): void {
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (const [px, py] of pts) {
    x0 = Math.min(x0, px); x1 = Math.max(x1, px);
    y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  x0 = Math.max(0, Math.floor(x0 - 2)); x1 = Math.min(W - 1, Math.ceil(x1 + 2));
  y0 = Math.max(0, Math.floor(y0 - 2)); y1 = Math.min(H - 1, Math.ceil(y1 + 2));
  const inside = (x: number, y: number): boolean => {
    let ins = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]; const [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
    }
    return ins;
  };
  const edgeDist = (x: number, y: number): number => {
    let m = 1e9;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j]; const [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - ax) * dx + (y - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      m = Math.min(m, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
    return m;
  };
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cxp = x + 0.5, cyp = y + 0.5;
      if (inside(cxp, cyp)) {
        const cov = Math.max(0, Math.min(1, (edgeDist(cxp, cyp) + 0.6) / 1.2));
        blend(x, y, c, a * cov);
      }
    }
  }
}

// Thick line segment, antialiased.
function seg(ax: number, ay: number, bx: number, by: number, w: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - w - 2));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + w + 2));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - w - 2));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + w + 2));
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let t = ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x + 0.5 - (ax + t * dx), y + 0.5 - (ay + t * dy));
      const cov = Math.max(0, Math.min(1, (w / 2 + 0.6 - d) / 1.2));
      if (cov > 0) blend(x, y, c, a * cov);
    }
  }
}
// Quadratic bezier as a chain of thick segments.
function bezier(p0: [number, number], p1: [number, number], p2: [number, number], w: number, c: RGB, a = 1): void {
  let prev: [number, number] | null = null;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    if (prev) seg(prev[0], prev[1], x, y, w, c, a);
    prev = [x, y];
  }
}

// ---- scene: Reeling the Sun (draft v1) ----
const VIOLET: RGB = [43, 26, 78];
const MAGENTA: RGB = [178, 62, 110];
const ORANGE: RGB = [255, 138, 61];
const GOLD: RGB = [255, 205, 92];
const SUN_CORE: RGB = [255, 236, 170];
const SEA_DEEP: RGB = [24, 32, 74];
const SEA_GLOW: RGB = [214, 96, 92];
const CLIFF: RGB = [26, 16, 44];
const KITE_RED: RGB = [232, 38, 62];

vgrad([[0, VIOLET], [0.34, MAGENTA], [0.55, ORANGE], [0.66, GOLD], [0.67, SEA_GLOW], [1, SEA_DEEP]]);

// Stars, upper sky only, fading toward horizon.
for (let i = 0; i < 160; i++) {
  const x = rnd() * W;
  const y = rnd() * 300;
  const r = 0.7 + rnd() * 1.6;
  circle(x, y, r, [255, 244, 214], 0.25 + rnd() * 0.6 * (1 - y / 340));
}

// Sun glow: soft concentric halos.
for (let r = 350; r > 165; r -= 12) {
  circle(648, 575, r, [255, 170, 80], 0.028);
}
// Sun disc, half-dipped at the horizon (y = 700): layered rings give it a warm
// gradient instead of a flat pale disc. (Variant sweep, 7 renders: r165 + horizon
// 700 beat r148/672, r125, r170-at-672 and sun-right on jolt + 300px read.)
circle(648, 575, 165, [255, 196, 90], 1);
circle(648, 575, 147, [255, 214, 116], 1);
circle(648, 575, 125, [255, 228, 148], 1);
circle(648, 575, 103, SUN_CORE, 1);
// Sun's lower half is hidden behind the sea band: repaint sea over it.
for (let y = 700; y < H; y++) {
  const t = (y - 700) / (H - 700);
  const c = mix(SEA_GLOW, SEA_DEEP, Math.min(1, t * 1.15));
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
  }
}
// Sun reflection: shimmering horizontal dashes in a column under the sun.
for (let i = 0; i < 240; i++) {
  const y = 708 + rnd() * 310;
  const spread = 26 + ((y - 708) / 310) * 150;
  const x = 648 + (rnd() - 0.5) * 2 * spread;
  const len = 14 + rnd() * 66;
  const a = 0.10 + rnd() * 0.42 * (1 - (y - 708) / 400);
  seg(x - len / 2, y, x + len / 2, y, 3.2, [255, 190, 110], a);
}

// Clouds: warm-lit soft ellipses, left and right of the sun — flat, low alpha,
// so they read as sky, not as solid pills.
const cloudCols: RGB[] = [[255, 170, 120], [214, 96, 120], [150, 70, 130]];
for (const [cx, cy, s] of [[150, 190, 1.0], [880, 150, 0.85]] as const) {
  for (let k = 0; k < 6; k++) {
    const ox = (rnd() - 0.5) * 130 * s;
    const oy = (rnd() - 0.5) * 18 * s;
    ellipse(cx + ox, cy + oy, (42 + rnd() * 38) * s, (11 + rnd() * 9) * s,
      cloudCols[k % 3], 0.32);
  }
}

// Birds scattering from the sun's pull.
for (const [bx, by, s] of [[420, 210, 1], [470, 180, 0.8], [830, 240, 1.1], [790, 200, 0.7]] as const) {
  seg(bx - 14 * s, by, bx, by - 7 * s, 2.4, [30, 18, 52], 0.9);
  seg(bx, by - 7 * s, bx + 14 * s, by, 2.4, [30, 18, 52], 0.9);
}

// Cliff, bottom-left, with the child standing at its edge.
poly([[0, 1024], [0, 812], [150, 782], [268, 800], [330, 872], [392, 1024]], CLIFF, 1);
// Cliff rim highlight where the sunset catches it.
seg(150, 782, 268, 800, 3, [255, 150, 90], 0.55);
seg(268, 800, 330, 872, 3, [255, 150, 90], 0.35);

// Child silhouette (~72px tall) standing ON the cliff plateau (feet at y=790,
// plateau top at x=210 is y≈789), arm raised to the kite string.
const HX = 210, HY = 764; // anchor: feet at HY+26 = 790
circle(HX - 2, HY - 46, 8.5, CLIFF, 1); // head
poly([[HX - 9, HY - 38], [HX + 5, HY - 38], [HX + 8, HY - 6], [HX - 6, HY - 6]], CLIFF, 1); // body
seg(HX - 4, HY - 6, HX - 10, HY + 26, 5, CLIFF, 1); // leg back
seg(HX + 3, HY - 6, HX + 12, HY + 24, 5, CLIFF, 1); // leg front
seg(HX + 2, HY - 34, HX + 20, HY - 52, 4.5, CLIFF, 1); // raised arm to string

// Red diamond kite, high left, tail with bows streaming toward the sun.
const KX = 318, KY = 268;
poly([[KX, KY - 78], [KX + 56, KY], [KX, KY + 78], [KX - 56, KY]], KITE_RED, 1);
seg(KX, KY - 78, KX, KY + 78, 2.5, [255, 255, 255], 0.85);
seg(KX - 56, KY, KX + 56, KY, 2.5, [255, 255, 255], 0.85);
// Tail: one continuous wavy line from the kite's bottom point, bows as small
// diamonds sitting ON the line (never floating free of it).
bezier([KX, KY + 78], [KX - 26, KY + 120], [KX + 6, KY + 165], 2, [255, 210, 180], 0.85);
for (let i = 1; i <= 3; i++) {
  const t = i / 4;
  const tx = (1 - t) * (1 - t) * KX + 2 * (1 - t) * t * (KX - 26) + t * t * (KX + 6);
  const ty = (1 - t) * (1 - t) * (KY + 78) + 2 * (1 - t) * t * (KY + 120) + t * t * (KY + 165);
  poly([[tx - 8, ty], [tx + 8, ty], [tx, ty + 11], [tx, ty - 11]], KITE_RED, 0.95);
}
// String: child hand -> kite (slack curve), kite -> sun (taut, hooked).
// Hook point (527,463) is on the sun's rim along the kite direction:
// centre (648,575) r165, direction to kite (-0.735,-0.679).
bezier([HX + 20, HY - 52], [260, 480], [KX, KY + 74], 2.2, [255, 235, 200], 0.9);
bezier([KX + 42, KY + 42], [440, 385], [527, 463], 2.6, [255, 235, 200], 0.95);
// Hook glint where the string bites the sun's rim.
circle(527, 463, 7, [255, 250, 210], 0.95);
circle(527, 463, 3.5, [255, 255, 255], 1);

// ---- PNG encode (RGB, filter 0, zlib level 9) ----
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const o = y * (1 + W * 3) + 1 + x * 3;
    raw[o] = Math.max(0, Math.min(255, Math.round(buf[i])));
    raw[o + 1] = Math.max(0, Math.min(255, Math.round(buf[i + 1])));
    raw[o + 2] = Math.max(0, Math.min(255, Math.round(buf[i + 2])));
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
