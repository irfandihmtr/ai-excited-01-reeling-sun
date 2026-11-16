// Reeling the Sun — ai-excited-01
// A small child stands on a dark cliff at dusk and flies a big red
// diamond kite. The kite string has caught the huge setting sun and
// is reeling it down toward the sea. One look, one impossible idea:
// a child fishing the sun out of the sky.
//
// Node 22, standard library only. The picture is painted pixel by
// pixel into a byte buffer with a small hand-rolled rasterizer
// (discs, ellipses, polygons, quadratic curves, all antialiased)
// and written out by a hand-rolled PNG encoder. No randomness at
// run time: every star, sparkle and wave comes from a fixed hash,
// so two runs produce byte-identical files.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;
const HOR = 700; // horizon: the line where the sea begins
const SUN = { x: 648, y: 575, r: 165 }; // the giant setting sun
const HOOK = { x: 527, y: 463 }; // where the string hooks the sun
const KITE = { x: 385, y: 285 }; // centre of the red diamond kite
const HAND = { x: 368, y: 712 }; // the child's raised hand

const px = new Uint8Array(W * H * 3);

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function smooth(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}
// Deterministic 0..1 hash from one integer, and from a pair.
function hash01(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}
function hash2(x, y) {
  return hash01((x | 0) * 374761393 + (y | 0) * 668265263);
}
// Blend one pixel toward (r,g,b) by coverage a (0..1).
function put(x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  if (a >= 1) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    return;
  }
  px[i] = px[i] + (r - px[i]) * a;
  px[i + 1] = px[i + 1] + (g - px[i + 1]) * a;
  px[i + 2] = px[i + 2] + (b - px[i + 2]) * a;
}
// A solid disc with a soft 1px edge. paint(x, y, cover) picks colour.
function disc(cx, cy, rad, paint) {
  const x0 = Math.max(0, Math.floor(cx - rad - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad + 1));
  const y0 = Math.max(0, Math.floor(cy - rad - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover = clamp(rad + 0.5 - d, 0, 1);
      if (cover > 0) paint(x, y, cover);
    }
  }
}
// A solid ellipse with a soft edge.
function ellipse(cx, cy, rx, ry, r, g, b, a) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
  const y0 = Math.max(0, Math.floor(cy - ry - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const cover = clamp(1.5 - d, 0, 1);
      if (cover > 0) put(x, y, r, g, b, a * cover);
    }
  }
}
// Fill a polygon, 2x2 supersampled so edges are smooth.
function poly(points, r, g, b, a) {
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(W - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.ceil(maxY));
  const offs = [0.25, 0.75];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let inside = 0;
      for (const oy of offs) {
        for (const ox of offs) {
          if (pointInPoly(x + ox, y + oy, points)) inside++;
        }
      }
      if (inside > 0) put(x, y, r, g, b, (a * inside) / 4);
    }
  }
}
function pointInPoly(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
// A thick quadratic curve, drawn as a chain of small soft discs.
function curve(p0, c, p1, width, r, g, b, a) {
  const steps = 220;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    const x = u * u * p0.x + 2 * u * t * c.x + t * t * p1.x;
    const y = u * u * p0.y + 2 * u * t * c.y + t * t * p1.y;
    disc(x, y, width / 2, (pxx, pyy, cover) =>
      put(pxx, pyy, r, g, b, a * cover),
    );
  }
}
function line(p0, p1, width, r, g, b, a) {
  curve(p0, { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, p1, width, r, g, b, a);
}

// ---- PNG encoder (stdlib zlib + hand-rolled chunks) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Sky: violet dusk melting into gold at the horizon ----
const SKY_STOPS = [
  [0.0, 24, 12, 52],
  [0.32, 66, 24, 92],
  [0.55, 138, 38, 98],
  [0.74, 206, 66, 88],
  [0.88, 246, 128, 62],
  [1.0, 255, 176, 92],
];
function skyColour(y) {
  const t = clamp(y / HOR, 0, 1);
  for (let s = 1; s < SKY_STOPS.length; s++) {
    if (t <= SKY_STOPS[s][0]) {
      const a = SKY_STOPS[s - 1];
      const b = SKY_STOPS[s];
      const f = (t - a[0]) / (b[0] - a[0]);
      return [lerp(a[1], b[1], f), lerp(a[2], b[2], f), lerp(a[3], b[3], f)];
    }
  }
  const last = SKY_STOPS[SKY_STOPS.length - 1];
  return [last[1], last[2], last[3]];
}
function paintSky() {
  for (let y = 0; y < HOR; y++) {
    const [r, g, b] = skyColour(y);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    }
  }
}
// Faint early stars, only in the upper sky, away from the sun.
function paintStars() {
  for (let i = 0; i < 240; i++) {
    const x = hash01(i * 7 + 3) * W;
    const y = hash01(i * 13 + 11) * 430;
    const dx = x - SUN.x, dy = y - SUN.y;
    if (dx * dx + dy * dy < 210 * 210) continue;
    const bright = 0.25 + hash01(i * 29 + 5) * 0.6;
    const fade = 1 - y / 520; // stars thin out toward the horizon
    const s = 0.8 + hash01(i * 17 + 2) * 1.4;
    disc(x, y, s, (pxx, pyy, cover) =>
      put(pxx, pyy, 255, 244, 220, bright * fade * cover),
    );
    if (hash01(i * 31 + 9) > 0.93) {
      // a few stars get a tiny cross sparkle
      line({ x: x - 5, y }, { x: x + 5, y }, 1, 255, 244, 220, bright * fade * 0.5);
      line({ x, y: y - 5 }, { x, y: y + 5 }, 1, 255, 244, 220, bright * fade * 0.5);
    }
  }
}
// The sun: a soft halo, then a disc that burns white-gold at its
// heart and deepens to orange at its rim.
function paintSun() {
  disc(SUN.x, SUN.y, 330, (x, y, cover) => {
    const d = Math.hypot(x + 0.5 - SUN.x, y + 0.5 - SUN.y);
    const glow = Math.pow(clamp(1 - d / 330, 0, 1), 2.4);
    put(x, y, 255, 178, 105, glow * 0.5 * cover);
  });
  disc(SUN.x, SUN.y, SUN.r, (x, y, cover) => {
    const d = Math.hypot(x + 0.5 - SUN.x, y + 0.5 - SUN.y) / SUN.r;
    const r = lerp(255, 255, 1 - d);
    const g = lerp(248, 168, d);
    const b = lerp(214, 74, d);
    put(x, y, r, g, b, cover);
  });
  // a pale core, hottest at the centre
  disc(SUN.x - 18, SUN.y - 22, 78, (x, y, cover) => {
    const d = Math.hypot(x + 0.5 - (SUN.x - 18), y + 0.5 - (SUN.y - 22)) / 78;
    put(x, y, 255, 252, 232, (1 - d) * 0.55 * cover);
  });
}

// Thin dusk clouds: flat, soft, low in the sky.
function paintClouds() {
  ellipse(170, 618, 250, 16, 232, 96, 110, 0.28);
  ellipse(830, 640, 300, 18, 246, 140, 80, 0.3);
  ellipse(120, 470, 170, 11, 190, 80, 130, 0.25);
  ellipse(900, 470, 190, 12, 180, 70, 120, 0.22);
}
// The sea: dark violet water, gently rippled.
function paintSea() {
  for (let y = HOR; y < H; y++) {
    const t = (y - HOR) / (H - HOR);
    const br = lerp(54, 13, t);
    const bg = lerp(34, 8, t);
    const bb = lerp(98, 38, t);
    for (let x = 0; x < W; x++) {
      const w =
        Math.sin(x * 0.021 + y * 0.13) * 6 +
        Math.sin(x * 0.008 - y * 0.05) * 8 +
        (Math.sin(y * 0.35) > 0.7 ? 7 : 0);
      const i = (y * W + x) * 3;
      px[i] = clamp(br + w, 0, 255);
      px[i + 1] = clamp(bg + w, 0, 255);
      px[i + 2] = clamp(bb + w, 0, 255);
    }
  }
}
// The sun's glitter path: a widening column of gold that shivers
// as it runs down the water toward the viewer.
function paintReflection() {
  // a soft glow where the sun touches the water
  ellipse(SUN.x, HOR + 6, 190, 9, 255, 190, 100, 0.4);
  for (let y = HOR; y < H; y++) {
    const halfW = 26 + (y - HOR) * 0.22;
    const x0 = Math.max(0, Math.floor(SUN.x - halfW));
    const x1 = Math.min(W - 1, Math.ceil(SUN.x + halfW));
    for (let x = x0; x <= x1; x++) {
      const lateral = Math.abs(x - SUN.x) / halfW;
      const shimmer =
        Math.pow(1 - lateral, 2.0) *
        (0.35 + 0.65 * Math.abs(Math.sin(y * 0.33 + Math.sin(x * 0.05) * 2)));
      if (shimmer <= 0.04) continue;
      put(x, y, 255, 190, 90, shimmer * 0.55);
      // occasional single-pixel sparkles inside the path
      if (hash2(x, y) > 0.988) {
        put(x, y, 255, 240, 190, 0.9);
      }
    }
  }
}
// The cliff: a dark headland jutting in from the lower left,
// its top edge catching the sunset's rim light.
const CLIFF_TOP = [
  { x: 0, y: 908 },
  { x: 95, y: 868 },
  { x: 185, y: 838 },
  { x: 265, y: 818 },
  { x: 325, y: 806 },
  { x: 372, y: 802 },
  { x: 412, y: 812 },
  { x: 432, y: 852 },
];
function paintCliff() {
  poly(
    [...CLIFF_TOP, { x: 424, y: 1024 }, { x: 0, y: 1024 }],
    16, 10, 30, 1,
  );
  for (let s = 1; s < CLIFF_TOP.length; s++) {
    line(CLIFF_TOP[s - 1], CLIFF_TOP[s], 3, 255, 150, 70, 0.55);
  }
  // a few grass tufts leaning on the edge
  for (const gx of [120, 210, 300]) {
    const gy = 868 - (gx - 95) * 0.18;
    poly(
      [{ x: gx, y: gy }, { x: gx + 4, y: gy - 14 }, { x: gx + 9, y: gy }],
      28, 16, 44, 1,
    );
  }
  // faint strata on the cliff face
  line({ x: 30, y: 940 }, { x: 260, y: 905 }, 2, 44, 26, 60, 0.5);
  line({ x: 10, y: 985 }, { x: 200, y: 955 }, 2, 44, 26, 60, 0.4);
}
// The child: a small dark figure on the cliff edge, one arm
// raised to the kite string, rim-lit gold on the sun side.
function paintChild() {
  const ink = [14, 9, 26];
  const rim = [255, 170, 95];
  poly([{ x: 336, y: 770 }, { x: 344, y: 770 }, { x: 340, y: 802 }, { x: 334, y: 802 }], ...ink, 1);
  poly([{ x: 348, y: 770 }, { x: 356, y: 770 }, { x: 360, y: 802 }, { x: 354, y: 802 }], ...ink, 1);
  poly([{ x: 334, y: 772 }, { x: 358, y: 772 }, { x: 354, y: 736 }, { x: 338, y: 736 }], ...ink, 1);
  disc(346, 724, 11, (x, y, cover) => put(x, y, ...ink, cover));
  disc(342, 716, 6, (x, y, cover) => put(x, y, ...ink, cover)); // hair tuft
  line({ x: 354, y: 742 }, HAND, 6, ...ink, 1); // raised arm
  line({ x: 338, y: 742 }, { x: 330, y: 772 }, 6, ...ink, 1); // free arm
  disc(337, 802, 4, (x, y, cover) => put(x, y, ...ink, cover));
  disc(357, 802, 4, (x, y, cover) => put(x, y, ...ink, cover));
  // warm rim light on the sun side
  line({ x: 356, y: 738 }, { x: 352, y: 770 }, 2, ...rim, 0.8);
  disc(355, 722, 3, (x, y, cover) => put(x, y, ...rim, 0.6 * cover));
  line({ x: 357, y: 740 }, HAND, 2, ...rim, 0.7);
}
// The kite: a big red diamond with a lighter heart, dark spars
// and a gold medallion at its crossing.
function paintKite() {
  const top = { x: KITE.x, y: 150 };
  const right = { x: 482, y: KITE.y };
  const bottom = { x: KITE.x, y: 420 };
  const left = { x: 288, y: KITE.y };
  poly([top, right, bottom, left], 226, 38, 52, 1);
  poly(
    [
      { x: KITE.x, y: 205 },
      { x: 438, y: KITE.y },
      { x: KITE.x, y: 365 },
      { x: 332, y: KITE.y },
    ],
    244, 84, 66, 0.9,
  );
  poly([top, right, { x: KITE.x, y: KITE.y }], 255, 120, 90, 0.25);
  line(top, bottom, 4, 140, 16, 32, 1);
  line(left, right, 4, 140, 16, 32, 1);
  disc(KITE.x, KITE.y, 16, (x, y, cover) => put(x, y, 255, 196, 80, cover));
  disc(KITE.x, KITE.y, 8, (x, y, cover) => put(x, y, 226, 38, 52, cover));
}
// The kite's tail: a wavy string trailing down-left, with small
// diamond bows fluttering along it.
function paintTail() {
  const p0 = { x: KITE.x, y: 420 };
  const c = { x: 330, y: 500 };
  const p1 = { x: 268, y: 556 };
  curve(p0, c, p1, 2, 250, 220, 190, 0.8);
  for (let k = 0; k < 6; k++) {
    const t = 0.15 + k * 0.16;
    const u = 1 - t;
    const x = u * u * p0.x + 2 * u * t * c.x + t * t * p1.x;
    const y = u * u * p0.y + 2 * u * t * c.y + t * t * p1.y;
    const s = 13 - k;
    const col = k % 2 === 0 ? [226, 38, 52] : [255, 196, 80];
    poly(
      [
        { x, y: y - s },
        { x: x + s * 0.6, y },
        { x, y: y + s },
        { x: x - s * 0.6, y },
      ],
      ...col, 1,
    );
  }
}
// Two strings: one bowing from the kite down to the child's hand,
// one reaching across to hook the sun.
function paintStrings() {
  curve(
    { x: KITE.x, y: 420 },
    { x: 330, y: 560 },
    HAND,
    2.5, 255, 232, 200, 0.95,
  );
  curve(
    { x: KITE.x, y: 420 },
    { x: 470, y: 478 },
    HOOK,
    2.5, 255, 232, 200, 0.95,
  );
}
// The hook itself: a small gold barb biting the sun's edge,
// with a bright glint where string meets fire.
function paintHook() {
  disc(HOOK.x, HOOK.y, 5, (x, y, cover) => put(x, y, 255, 196, 80, cover));
  curve(HOOK, { x: 540, y: 455 }, { x: 548, y: 462 }, 3, 255, 196, 80, 1);
  disc(HOOK.x - 2, HOOK.y - 2, 2.5, (x, y, cover) =>
    put(x, y, 255, 255, 240, cover),
  );
}
// Small birds wheeling away from the sun, high in the sky.
function paintBirds() {
  const flock = [
    [620, 205, 16], [705, 175, 13], [765, 238, 18], [560, 148, 11],
    [185, 175, 14], [245, 228, 11], [835, 295, 15],
  ];
  for (const [bx, by, s] of flock) {
    curve(
      { x: bx - s, y: by },
      { x: bx - s / 2, y: by - s * 0.7 },
      { x: bx, y: by + 2 },
      2.5, 30, 16, 48, 0.9,
    );
    curve(
      { x: bx, y: by + 2 },
      { x: bx + s / 2, y: by - s * 0.7 },
      { x: bx + s, y: by },
      2.5, 30, 16, 48, 0.9,
    );
  }
}
// A gentle darkening toward the corners, to hold the eye
// on the kite, the child and the sun.
function paintVignette() {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - W / 2, y - H / 2) / 720;
      if (d > 0.72) put(x, y, 8, 4, 20, (d - 0.72) * 0.9);
    }
  }
}

function main() {
  paintSky();
  paintStars();
  paintClouds();
  paintSun();
  paintSea();
  paintReflection();
  paintCliff();
  paintChild();
  paintKite();
  paintTail();
  paintStrings();
  paintHook();
  paintBirds();
  paintVignette();
  const outDir = (process.env.MAKEFUN_OUTPUT_DIR || "out").replace(/\/+$/, "");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outDir + "/entry.png", encodePNG());
}

main();

