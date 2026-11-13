// Pet portraits drawn into small canvases. Uses src/render/pets.js (drawPet) when it loads,
// otherwise a rarity-coloured blob so the UI never depends on the renderer being present.
import { el } from './dom.js';

export const RARITY = {
  common: { name: 'COMMON', color: '#9aa7c4', glow: 'rgba(154,167,196,.5)', rank: 0 },
  uncommon: { name: 'UNCOMMON', color: '#39ff88', glow: 'rgba(57,255,136,.55)', rank: 1 },
  rare: { name: 'RARE', color: '#3da8ff', glow: 'rgba(61,168,255,.6)', rank: 2 },
  epic: { name: 'EPIC', color: '#b25cff', glow: 'rgba(178,92,255,.65)', rank: 3 },
  legendary: { name: 'LEGENDARY', color: '#ffd34d', glow: 'rgba(255,211,77,.75)', rank: 4 },
};
export function rarityInfo(r) { return RARITY[r] || RARITY.common; }

let mod = null;
let loading = null;
export function loadPets() {
  if (!loading) {
    loading = import('../render/pets.js')
      .then((m) => { mod = m; repaintAll(); return m; })
      .catch(() => null);
  }
  return loading;
}

const registry = new Set(); // { canvas, opts }
let raf = 0;

function blob(ctx, w, h, opts, t) {
  const info = rarityInfo(opts.rarity);
  const cx = w / 2, cy = h * 0.55, r = Math.min(w, h) * 0.34;
  const bob = Math.sin(t * 3) * r * 0.06;
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4 + bob, r * 0.1, cx, cy + bob, r * 1.1);
  const base = opts.golden ? '#ffd34d' : info.color;
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, base);
  g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy + bob, r * 1.05, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#060a18';
  for (const dx of [-0.38, 0.38]) { ctx.beginPath(); ctx.arc(cx + dx * r, cy - r * 0.1 + bob, r * 0.14, 0, Math.PI * 2); ctx.fill(); }
}

export function paintPet(canvas, opts, t = 0) {
  paintRaw(canvas, opts, t);
  if (opts.silhouette) {
    const c = canvas.getContext('2d');
    if (c) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = '#0a0e22'; c.fillRect(0, 0, canvas.width, canvas.height); c.globalCompositeOperation = 'source-over'; }
  }
}

function paintRaw(canvas, opts, t) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (mod && typeof mod.drawPet === 'function') {
    try { mod.drawPet(ctx, opts.id, w / 2, h * 0.52, h * 0.78, t, !!opts.golden); return; } catch (_) { /* fall through */ }
  }
  blob(ctx, w, h, opts, t);
}

/** Make a portrait canvas of `size` CSS px. opts: {id, rarity, golden, animate, silhouette}. */
export function petCanvas(size, opts) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = el('canvas', 'sx-pet' + (opts.silhouette ? ' sil' : ''));
  c.width = Math.round(size * dpr);
  c.height = Math.round(size * dpr);
  c.style.width = size + 'px';
  c.style.height = size + 'px';
  registry.add({ canvas: c, opts });
  paintPet(c, opts, 0);
  loadPets();
  if (opts.animate) startLoop();
  return c;
}

export function repaintAll() {
  for (const r of registry) {
    if (!r.canvas.isConnected) { registry.delete(r); continue; }
    paintPet(r.canvas, r.opts, performance.now() / 1000);
  }
}

function startLoop() {
  if (raf) return;
  const tick = (now) => {
    let any = false;
    for (const r of registry) {
      if (!r.canvas.isConnected) { if (!r.opts.keep) registry.delete(r); continue; }
      if (r.opts.animate) { any = true; paintPet(r.canvas, r.opts, now / 1000); }
    }
    raf = any ? requestAnimationFrame(tick) : 0;
  };
  raf = requestAnimationFrame(tick);
}
