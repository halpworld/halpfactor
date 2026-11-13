// Zero-dependency icon generator: draws a neon gear + robot face procedurally (per-pixel SDF,
// 3x3 supersampling) and writes PNGs with zlib. Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const BG = [6, 10, 24];
const PANEL = [14, 22, 48];
const CYAN = [34, 240, 255];
const MAGENTA = [255, 61, 242];
const AMBER = [255, 176, 32];
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
function sdRoundBox(x, y, cx, cy, hw, hh, r) {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdSegment(x, y, ax, ay, bx, by, r) {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) - r;
}

// Unit-space glyph (0..1), centred at (.5,.5). `s` scales the glyph about the centre.
function shade(px, py, s) {
  const x = 0.5 + (px - 0.5) / s;
  const y = 0.5 + (py - 0.5) / s;
  const dx = x - 0.5, dy = y - 0.5;
  const r = Math.hypot(dx, dy);
  const ang = Math.atan2(dy, dx);

  // background: dark navy with a soft radial lift and faint grid
  let col = mix(BG, PANEL, Math.max(0, 1 - r * 1.6) * 0.9);
  const gx = Math.abs(((px * 16) % 1) - 0.5), gy = Math.abs(((py * 16) % 1) - 0.5);
  const grid = 1 - smooth(0.0, 0.03, Math.min(gx, gy) - 0.47 + 0.03);
  col = mix(col, [24, 36, 76], Math.max(0, grid) * 0.18);

  // gear: ring (outer body with 8 rounded teeth, hollow centre)
  const teeth = 8;
  const body = 0.285;
  const toothH = 0.06;
  const tooth = smooth(0.15, 0.55, Math.cos(teeth * ang)); // 0..1 trapezoid-ish
  const rOuter = body + toothH * tooth;
  const dOuter = r - rOuter;
  const dHole = 0.2 - r;
  const dGear = Math.max(dOuter, dHole);

  // neon glow around the gear (outside both edges)
  const glow = Math.exp(-Math.max(0, dGear) * 26) * 0.55;
  col = mix(col, CYAN, Math.min(1, glow) * 0.65);
  const px1 = 1 / 512; // anti-alias width in unit space (SS handles the rest)
  const gearCov = 1 - smooth(-px1, px1, dGear);
  if (gearCov > 0) {
    const shadeT = 0.5 + 0.5 * Math.cos(ang - 0.9); // light from upper-left
    const base = mix([20, 150, 190], CYAN, 0.45 + 0.4 * shadeT);
    const rim = 1 - smooth(0, 0.012, -dGear); // brighter edge
    col = mix(col, mix(base, [220, 255, 255], rim * 0.65), gearCov);
  }
  // inner dark face area
  const faceCov = 1 - smooth(-px1, px1, r - 0.188);
  col = mix(col, [8, 12, 30], faceCov);

  // robot head (rounded visor) inside the gear
  const head = sdRoundBox(x, y, 0.5, 0.515, 0.118, 0.098, 0.034);
  const headCov = 1 - smooth(-px1, px1, head);
  col = mix(col, [30, 44, 92], headCov);
  const headRim = 1 - smooth(0, 0.008, Math.abs(head));
  col = mix(col, MAGENTA, headRim * 0.9);

  // eyes
  for (const ex of [-0.05, 0.05]) {
    const e = sdCircle(x, y, 0.5 + ex, 0.505, 0.026);
    const eg = Math.exp(-Math.max(0, e) * 60) * 0.5;
    col = mix(col, AMBER, eg * headCov);
    col = mix(col, [255, 236, 160], 1 - smooth(-px1, px1, e));
  }
  // mouth grille
  for (let i = -1; i <= 1; i++) {
    const m = sdSegment(x, y, 0.5 + i * 0.028, 0.553, 0.5 + i * 0.028, 0.568, 0.005);
    col = mix(col, CYAN, 1 - smooth(-px1, px1, m));
  }
  // antenna
  const ant = sdSegment(x, y, 0.5, 0.415, 0.5, 0.375, 0.006);
  col = mix(col, MAGENTA, 1 - smooth(-px1, px1, ant));
  const bulb = sdCircle(x, y, 0.5, 0.366, 0.016);
  col = mix(col, MAGENTA, Math.exp(-Math.max(0, bulb) * 55) * 0.6);
  col = mix(col, [255, 190, 250], 1 - smooth(-px1, px1, bulb));

  // vignette
  col = mix(col, [3, 5, 13], smooth(0.55, 0.95, r) * 0.6);
  return col;
}

function render(size, scale) {
  const SS = 3;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let j = 0; j < size; j++) {
    raw[o++] = 0; // filter: none
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sj = 0; sj < SS; sj++) {
        for (let si = 0; si < SS; si++) {
          const c = shade((i + (si + 0.5) / SS) / size, (j + (sj + 0.5) / SS) / size, scale);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      raw[o++] = Math.round(r / n);
      raw[o++] = Math.round(g / n);
      raw[o++] = Math.round(b / n);
    }
  }
  return raw;
}

const CRC = (() => {
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
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
// scale: >1 enlarges the glyph. Maskable keeps the glyph inside the 80% safe zone (scale 1.0:
// gear incl. teeth + glow radius ~0.35 < 0.4); "any" icons fill more of the canvas.
const jobs = [
  ['icon-192.png', 192, 1.25],
  ['icon-512.png', 512, 1.25],
  ['icon-maskable-512.png', 512, 1.0],
  ['apple-touch-icon.png', 180, 1.2],
];
for (const [name, size, scale] of jobs) {
  const data = png(size, render(size, scale));
  writeFileSync(join(OUT, name), data);
  console.log(`${name}  ${size}x${size}  ${data.length} bytes`);
}
