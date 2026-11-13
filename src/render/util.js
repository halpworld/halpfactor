// Small shared helpers for rendering & simulation. No allocations in the hot helpers.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

export function easeOutCubic(t) {
  const u = 1 - clamp(t, 0, 1);
  return 1 - u * u * u;
}

export function easeInCubic(t) {
  t = clamp(t, 0, 1);
  return t * t * t;
}

export function easeInOutSine(t) {
  return -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;
}

/** Deterministic PRNG (mulberry32). Returns a function producing [0,1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Offscreen canvas factory. Uses DOM canvases for broad Safari support. */
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  return { canvas: c, ctx };
}

/** Builds a rounded-rect path on ctx (does not fill/stroke). */
export function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arcTo(x + w, y, x + w, y + rr, rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  ctx.lineTo(x + rr, y + h);
  ctx.arcTo(x, y + h, x, y + h - rr, rr);
  ctx.lineTo(x, y + rr);
  ctx.arcTo(x, y, x + rr, y, rr);
  ctx.closePath();
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function hsl(h, s, l, a = 1) {
  return `hsla(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%,${a})`;
}

/** Point-in-rect with padding. rect = {x,y,w,h} (top-left). */
export function hitRect(rect, px, py, pad = 0) {
  return px >= rect.x - pad && px <= rect.x + rect.w + pad && py >= rect.y - pad && py <= rect.y + rect.h + pad;
}
