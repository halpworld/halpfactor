// Pre-rendered sprite cache: glow blobs, soft puffs, text labels.
// Everything expensive (gradients, shadowBlur, text shaping) happens once here,
// so per-frame code only does drawImage.

import { COLORS, FONT } from '../core/theme.js';
import { makeCanvas, hexToRgb } from './util.js';

/** Palette used by particles & glows. Index into this for typed-array storage. */
export const PALETTE = [
  COLORS.cyan, // 0
  COLORS.magenta, // 1
  COLORS.amber, // 2
  COLORS.green, // 3
  COLORS.red, // 4
  COLORS.gold, // 5
  COLORS.purple, // 6
  '#ffffff', // 7
  '#ff7a1a', // 8 orange-hot spark
  '#4d7cff', // 9 electric blue
];
export const PAL = Object.freeze({
  cyan: 0, magenta: 1, amber: 2, green: 3, red: 4, gold: 5, purple: 6, white: 7, orange: 8, blue: 9,
});

const GLOW_SIZE = 64;

function makeGlow(hex, size = GLOW_SIZE, core = 0.18) {
  const { canvas, ctx } = makeCanvas(size, size);
  const [r, g, b] = hexToRgb(hex);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(core, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function makeSoftGlow(hex, size = 128) {
  // Wide, faint halo (no white core) for ambient light pools.
  const { canvas, ctx } = makeCanvas(size, size);
  const [r, g, b] = hexToRgb(hex);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
  grad.addColorStop(0.5, `rgba(${r},${g},${b},0.18)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function makePuff(inner, outer, size = 64) {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.6, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function makeBoltCoin(size = 40) {
  // A golden hex-nut "bolt" coin, glowing.
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  ctx.save();
  ctx.shadowColor = COLORS.gold;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  const r = size * 0.36;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = c + Math.cos(a) * r;
    const y = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, c - r, 0, c + r);
  g.addColorStop(0, '#fff2b0');
  g.addColorStop(0.5, COLORS.gold);
  g.addColorStop(1, COLORS.goldDeep);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#7a4c06';
  ctx.beginPath();
  ctx.arc(c, c, r * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.38, Math.PI * 1.1, Math.PI * 1.6);
  ctx.stroke();
  return canvas;
}

export class SpriteCache {
  constructor() {
    this.glow = PALETTE.map((c) => makeGlow(c));
    this.soft = PALETTE.map((c) => makeSoftGlow(c));
    this.steam = makePuff('rgba(220,235,255,0.55)', 'rgba(160,185,220,0.18)');
    this.smoke = makePuff('rgba(18,18,24,0.95)', 'rgba(30,30,38,0.5)');
    this.boltCoin = makeBoltCoin();
    this._labels = new Map();
  }

  glowFor(hex) {
    const i = PALETTE.indexOf(hex);
    return this.glow[i >= 0 ? i : 0];
  }

  /**
   * Cached text label. key must uniquely describe the visual.
   * Returns { canvas, w, h } where w,h are logical size (canvas is rendered at 2x).
   */
  label(key, text, opts = {}) {
    const hit = this._labels.get(key);
    if (hit) return hit;
    const {
      size = 32,
      weight = 800,
      color = COLORS.text,
      glow = null,
      font = FONT.display,
      stroke = null,
      strokeWidth = 0,
      pad = 10,
    } = opts;
    const k = 2;
    const measure = makeCanvas(4, 4).ctx;
    measure.font = `${weight} ${size}px ${font}`;
    const tw = Math.ceil(measure.measureText(text).width);
    const w = tw + pad * 2;
    const h = Math.ceil(size * 1.3) + pad * 2;
    const { canvas, ctx } = makeCanvas(w * k, h * k);
    ctx.scale(k, k);
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = size * 0.45;
    }
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(text, w / 2, h / 2 + size * 0.04);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + size * 0.04);
    if (glow) {
      ctx.shadowBlur = 0;
      ctx.fillText(text, w / 2, h / 2 + size * 0.04);
    }
    const out = { canvas, w, h };
    if (this._labels.size > 400) this._labels.clear(); // safety bound
    this._labels.set(key, out);
    return out;
  }

  /** Draw a cached label centred at (x,y). */
  drawLabel(ctx, lbl, x, y, scale = 1) {
    const w = lbl.w * scale;
    const h = lbl.h * scale;
    ctx.drawImage(lbl.canvas, x - w / 2, y - h / 2, w, h);
  }
}

/** Renders text into an existing reusable canvas (used by pooled floating texts). */
export function renderTextInto(slot, text, { size, color, glow, stroke = '#000', strokeWidth = 6 }) {
  const k = 2;
  const ctx = slot.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `900 ${size}px ${FONT.display}`;
  const tw = Math.ceil(ctx.measureText(text).width);
  const w = tw + 28;
  const h = Math.ceil(size * 1.4) + 20;
  if (slot.canvas.width < w * k || slot.canvas.height < h * k) {
    slot.canvas.width = Math.max(slot.canvas.width, w * k);
    slot.canvas.height = Math.max(slot.canvas.height, h * k);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.font = `900 ${size}px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.strokeText(text, w / 2, h / 2);
  ctx.shadowColor = glow || color;
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2);
  ctx.shadowBlur = 0;
  ctx.fillText(text, w / 2, h / 2);
  slot.w = w;
  slot.h = h;
  slot.k = k;
}
