// Background themes (shop "theme" styles): neon (default), lava, ice, candy, space.
// Each theme has a static tint baked into the cached backdrop (`paint`) and cheap per-frame
// effects (`fx`) drawn with the pre-rendered glow sprites. All positions are deterministic
// functions of time, so there is no per-frame allocation.

import { WORLD } from '../core/theme.js';
import { mulberry32 } from './util.js';
import { PAL } from './sprites.js';
import { FLOOR } from '../game/layout.js';

export const THEME_IDS = Object.freeze(['neon', 'lava', 'ice', 'candy', 'space']);

const W = WORLD.W;
const H = WORLD.H;

function seeds(n, seed) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: rng() * W, y: rng() * H, p: rng() * 10, s: 0.5 + rng(), k: rng() });
  return out;
}
const EMBERS = seeds(34, 11);
const FLAKES = seeds(46, 23);
const BUBBLES = seeds(22, 37);
const STARS = seeds(90, 41);

function wash(ctx, top, bottom, alpha) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}

const THEMES = {
  neon: { accent: null, paint: null, fx: null },
  lava: {
    accent: '#ff6a1a',
    paint(ctx) {
      wash(ctx, '#3a0a00', '#ff4a10', 0.22);
      // glowing cracks in the floor
      ctx.strokeStyle = 'rgba(255,120,30,0.55)';
      ctx.lineWidth = 3;
      const rng = mulberry32(5);
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        let x = rng() * W;
        let y = FLOOR.y0 + 10 + rng() * (H - FLOOR.y0 - 20);
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (rng() - 0.3) * 60;
          y += (rng() - 0.5) * 16;
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    },
    fx(ctx, S, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < EMBERS.length; i++) {
        const e = EMBERS[i];
        const life = (t * 0.12 * e.s + e.k) % 1;
        const y = H - life * (H - 90);
        const x = e.x + Math.sin(t * 1.3 + e.p) * 18;
        ctx.globalAlpha = 0.55 * (1 - life);
        const sz = 5 + e.s * 4;
        ctx.drawImage(S.glow[i % 3 ? PAL.orange : PAL.gold], x - sz, y - sz, sz * 2, sz * 2);
      }
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 2);
      ctx.drawImage(S.soft[PAL.orange], -200, FLOOR.y0 - 120, W + 400, 300);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  ice: {
    accent: '#9ae8ff',
    paint(ctx) {
      wash(ctx, '#bfefff', '#0a3a66', 0.16);
      // frost along the top edge
      ctx.fillStyle = 'rgba(220,245,255,0.18)';
      const rng = mulberry32(9);
      ctx.beginPath();
      ctx.moveTo(0, 84);
      for (let x = 0; x <= W; x += 24) ctx.lineTo(x, 86 + rng() * 22);
      ctx.lineTo(W, 84);
      ctx.fill();
    },
    fx(ctx, S, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < FLAKES.length; i++) {
        const f = FLAKES[i];
        const y = ((f.y + t * 26 * f.s) % (H - 84)) + 84;
        const x = (f.x + Math.sin(t * 0.7 + f.p) * 24 + W) % W;
        ctx.globalAlpha = 0.35 + 0.25 * f.k;
        const sz = 3 + f.s * 3;
        ctx.drawImage(S.glow[PAL.white], x - sz, y - sz, sz * 2, sz * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  candy: {
    accent: '#ff5fb8',
    paint(ctx) {
      wash(ctx, '#ffd1ec', '#7a1d6b', 0.2);
      // candy stripes on the floor
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, FLOOR.y0 + 4, W, H - FLOOR.y0);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,120,200,0.13)';
      for (let x = -200; x < W + 200; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + 28, H);
        ctx.lineTo(x + 108, FLOOR.y0);
        ctx.lineTo(x + 80, FLOOR.y0);
        ctx.fill();
      }
      ctx.restore();
    },
    fx(ctx, S, t) {
      ctx.globalCompositeOperation = 'lighter';
      const cols = [PAL.magenta, PAL.cyan, PAL.gold, PAL.green];
      for (let i = 0; i < BUBBLES.length; i++) {
        const b = BUBBLES[i];
        const life = (t * 0.05 * b.s + b.k) % 1;
        const y = FLOOR.y0 - life * (FLOOR.y0 - 100);
        const x = b.x + Math.sin(t * 0.9 + b.p) * 30;
        ctx.globalAlpha = 0.28 * Math.sin(life * Math.PI);
        const sz = 10 + b.s * 10;
        ctx.drawImage(S.soft[cols[i % cols.length]], x - sz, y - sz, sz * 2, sz * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  },
  space: {
    accent: '#8a5cff',
    paint(ctx) {
      wash(ctx, '#000010', '#1a0840', 0.45);
      // a ringed planet on the back wall
      const px = 1180;
      const py = 300;
      const g = ctx.createRadialGradient(px - 30, py - 30, 10, px, py, 90);
      g.addColorStop(0, 'rgba(160,120,255,0.55)');
      g.addColorStop(1, 'rgba(40,20,90,0.15)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(200,180,255,0.35)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(px, py, 150, 30, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    },
    fx(ctx, S, t) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < STARS.length; i++) {
        const s = STARS[i];
        const y = 90 + (s.y % (FLOOR.y0 - 110));
        ctx.globalAlpha = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * (1 + s.s * 2) + s.p));
        const sz = 2 + s.k * 4;
        ctx.drawImage(S.glow[i % 5 ? PAL.white : PAL.cyan], s.x - sz, y - sz, sz * 2, sz * 2);
      }
      // shooting star every ~7 s
      const cyc = (t / 7) % 1;
      if (cyc < 0.12) {
        const k = cyc / 0.12;
        const x = 200 + k * 900;
        const y = 140 + k * 220;
        for (let j = 0; j < 6; j++) {
          ctx.globalAlpha = (1 - j / 6) * (1 - k) * 0.8;
          ctx.drawImage(S.glow[PAL.white], x - j * 16 - 8, y - j * 4 - 8, 16, 16);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  },
};

export function themeOf(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(THEMES, id) ? THEMES[id] : THEMES.neon;
}

/** Bakes the theme's static tint into the cached backdrop context (world coordinates). */
export function paintTheme(ctx, id) {
  const th = themeOf(id);
  if (th.paint) th.paint(ctx);
}

/** Per-frame animated theme effects. */
export function drawThemeFx(ctx, sprites, t, id) {
  const th = themeOf(id);
  if (th.fx) th.fx(ctx, sprites, t);
}

/** Floor-lane accent colour for the theme, or null for the default. */
export function themeAccent(id) {
  return themeOf(id).accent;
}
