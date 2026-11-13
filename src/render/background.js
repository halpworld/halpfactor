// Cached factory backdrop. The heavy static layer is rendered once per resize at
// device resolution; per frame we blit it, then add cheap animated touches
// (drifting holo-grid, floor lane lines, blinking indicator lights, dock beacon).

import { WORLD, COLORS, FONT } from '../core/theme.js';
import { makeCanvas, roundRectPath, mulberry32, rgba } from './util.js';
import { PAL } from './sprites.js';
import { DISPENSER, FORGE, DOCK, FLOOR, forgeSlot, dispenserSlot } from '../game/layout.js';
import { paintTheme, drawThemeFx, themeAccent } from './themes.js';

export class Background {
  constructor(sprites) {
    this.sprites = sprites;
    this.layer = null;
    this.grid = null;
    this.builtFor = -1;
    this.theme = 'neon';
    this.lights = [];
    const rng = mulberry32(1337);
    const cols = [PAL.cyan, PAL.magenta, PAL.green, PAL.amber, PAL.red];
    // Indicator lights on wall panels & pipes.
    for (let i = 0; i < 26; i++) {
      this.lights.push({
        x: 20 + rng() * 1320,
        y: rng() < 0.5 ? 96 : 122,
        c: cols[(rng() * cols.length) | 0],
        phase: rng() * 10,
        rate: 0.4 + rng() * 2.2,
        size: 8 + rng() * 6,
      });
    }
    // Lights along the dock frame and rack posts.
    for (let i = 0; i < 8; i++) {
      this.lights.push({ x: DOCK.x0 + 14, y: 170 + i * 92, c: i % 2 ? PAL.amber : PAL.cyan, phase: i * 0.7, rate: 1.1, size: 10 });
    }
    for (let i = 0; i < 6; i++) {
      this.lights.push({ x: 137, y: DISPENSER.y0 + 20 + i * 136.7, c: PAL.green, phase: i * 1.3, rate: 0.6, size: 7 });
    }
    for (let i = 0; i < 12; i++) {
      const f = forgeSlot(i + 1);
      this.lights.push({ x: f.cx - 64, y: f.cy - 118, c: PAL.cyan, phase: i, rate: 0.35 + (i % 4) * 0.2, size: 6 });
    }
  }

  /** theme: shop theme id (neon|lava|ice|candy|space); the static layer is rebuilt on change. */
  ensure(renderer, theme = 'neon') {
    if (this.builtFor === renderer.version && this.layer && this.theme === theme) return;
    const onlyTheme = this.builtFor === renderer.version && this.grid;
    this.builtFor = renderer.version;
    this.theme = theme;
    const m = renderer.m;
    const { canvas, ctx } = makeCanvas(WORLD.W * m, WORLD.H * m);
    ctx.scale(m, m);
    drawStatic(ctx);
    paintTheme(ctx, theme);
    this.layer = canvas;
    if (onlyTheme) return;
    // Holo-grid tile (drawn additively with drift → parallax depth).
    const g = makeCanvas(WORLD.W + 80, WORLD.H + 80);
    const gc = g.ctx;
    gc.strokeStyle = 'rgba(34,240,255,1)';
    gc.lineWidth = 1;
    gc.beginPath();
    for (let x = 0; x <= WORLD.W + 80; x += 80) {
      gc.moveTo(x + 0.5, 0);
      gc.lineTo(x + 0.5, WORLD.H + 80);
    }
    for (let y = 0; y <= WORLD.H + 80; y += 80) {
      gc.moveTo(0, y + 0.5);
      gc.lineTo(WORLD.W + 80, y + 0.5);
    }
    gc.stroke();
    this.grid = g.canvas;
  }

  draw(ctx, r, time, accent) {
    r.resetLocal();
    ctx.drawImage(this.layer, 0, 0, WORLD.W, WORLD.H);
    // Parallax holo-grid drifting slowly diagonally.
    const off = (time * 6) % 80;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.045;
    ctx.drawImage(this.grid, -off, -off * 0.5, WORLD.W + 80, WORLD.H + 80);
    // Floor lane lines flowing right (towards the dock).
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = accent || themeAccent(this.theme) || COLORS.purple;
    ctx.lineWidth = 2;
    const lane = (time * 60) % 60;
    ctx.beginPath();
    for (let x = -60 + lane; x < WORLD.W; x += 60) {
      ctx.moveTo(x, FLOOR.y1 + 4);
      ctx.lineTo(x + 26, FLOOR.y1 + 4);
    }
    ctx.stroke();
    // Blinking indicator lights.
    const S = this.sprites;
    for (let i = 0; i < this.lights.length; i++) {
      const L = this.lights[i];
      const s = Math.sin(time * L.rate * 3 + L.phase);
      const on = s > 0.2 ? 1 : 0.15 + Math.max(0, s + 0.8) * 0.1;
      ctx.globalAlpha = on;
      const sz = L.size;
      ctx.drawImage(S.glow[L.c], L.x - sz, L.y - sz, sz * 2, sz * 2);
    }
    // Dock beacon sweeping.
    const sweep = (Math.sin(time * 1.4) + 1) / 2;
    ctx.globalAlpha = 0.22;
    const bx = DOCK.x0 + 40 + sweep * (DOCK.x1 - DOCK.x0 - 80);
    ctx.drawImage(S.soft[PAL.amber], bx - 90, 94 - 40, 180, 80);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawThemeFx(ctx, S, time, this.theme);
  }
}

function rivet(ctx, x, y) {
  ctx.fillStyle = '#2a3866';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(169,182,214,0.35)';
  ctx.beginPath();
  ctx.arc(x - 0.8, y - 0.8, 1.2, 0, Math.PI * 2);
  ctx.fill();
}

function pipeH(ctx, x0, x1, y, r, hue = COLORS.steel) {
  const g = ctx.createLinearGradient(0, y - r, 0, y + r);
  g.addColorStop(0, '#1b2546');
  g.addColorStop(0.35, hue);
  g.addColorStop(0.55, '#c8d4f0');
  g.addColorStop(1, '#141b33');
  ctx.fillStyle = g;
  ctx.fillRect(x0, y - r, x1 - x0, r * 2);
  // flanges
  for (let x = x0 + 60; x < x1 - 20; x += 180) {
    ctx.fillStyle = '#26345e';
    ctx.fillRect(x, y - r - 3, 10, r * 2 + 6);
    ctx.fillStyle = 'rgba(200,215,245,0.4)';
    ctx.fillRect(x, y - r - 3, 2, r * 2 + 6);
  }
}

function pipeV(ctx, x, y0, y1, r) {
  const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
  g.addColorStop(0, '#141b33');
  g.addColorStop(0.4, COLORS.steel);
  g.addColorStop(0.6, '#b8c6e6');
  g.addColorStop(1, '#141b33');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y0, r * 2, y1 - y0);
  for (let y = y0 + 50; y < y1 - 20; y += 160) {
    ctx.fillStyle = '#26345e';
    ctx.fillRect(x - r - 3, y, r * 2 + 6, 10);
  }
}

function drawStatic(ctx) {
  const W = WORLD.W;
  const H = WORLD.H;
  // Base gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a1230');
  bg.addColorStop(0.55, COLORS.bg);
  bg.addColorStop(1, COLORS.bgDeep);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Back wall panels
  const rng = mulberry32(7);
  for (let x = 0; x < W; x += 114) {
    for (let y = 84; y < FLOOR.y0; y += 140) {
      const shade = 0.03 + rng() * 0.04;
      ctx.fillStyle = `rgba(120,150,255,${shade})`;
      ctx.fillRect(x + 3, y + 3, 108, 134);
      ctx.strokeStyle = 'rgba(34,48,92,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, 108, 134);
      rivet(ctx, x + 10, y + 10);
      rivet(ctx, x + 104, y + 10);
      rivet(ctx, x + 10, y + 130);
      rivet(ctx, x + 104, y + 130);
    }
  }
  // Faint circuit traces on the wall
  ctx.strokeStyle = 'rgba(138,92,255,0.12)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i++) {
    let x = rng() * W;
    let y = 120 + rng() * 780;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      if (rng() < 0.5) x += (rng() - 0.5) * 160;
      else y += (rng() - 0.5) * 120;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(138,92,255,0.25)';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Overhead pipes
  pipeH(ctx, 0, W, 96, 9);
  pipeH(ctx, 260, 980, 122, 5, '#4a5a85');
  pipeV(ctx, 286, 96, FLOOR.y0, 8);
  pipeV(ctx, 966, 96, FLOOR.y0, 8);

  // Dispenser rack
  ctx.fillStyle = 'rgba(14,22,48,0.85)';
  roundRectPath(ctx, DISPENSER.x0 - 8, DISPENSER.y0 - 12, DISPENSER.x1 - DISPENSER.x0 + 16, DISPENSER.y1 - DISPENSER.y0 + 18, 14);
  ctx.fill();
  ctx.strokeStyle = rgba(COLORS.cyan, 0.25);
  ctx.lineWidth = 2;
  ctx.stroke();
  for (let v = 1; v <= 12; v += 2) {
    const s = dispenserSlot(v);
    const shelfY = s.hit.y + s.hit.h - 8;
    const g = ctx.createLinearGradient(0, shelfY, 0, shelfY + 8);
    g.addColorStop(0, '#5d6b8f');
    g.addColorStop(1, '#1a2340');
    ctx.fillStyle = g;
    ctx.fillRect(DISPENSER.x0, shelfY, DISPENSER.x1 - DISPENSER.x0, 7);
  }
  ctx.font = `800 14px ${FONT.display}`;
  ctx.fillStyle = rgba(COLORS.cyan, 0.55);
  ctx.textAlign = 'center';
  ctx.fillText('RAW MATERIALS', (DISPENSER.x0 + DISPENSER.x1) / 2, DISPENSER.y0 - 0);

  // Forge bays
  for (let i = 1; i <= 12; i++) {
    const f = forgeSlot(i);
    const x = f.cx - 70;
    const y = f.cy - 120;
    ctx.fillStyle = 'rgba(5,8,22,0.75)';
    roundRectPath(ctx, x, y, 140, 236, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34,48,92,0.95)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // hazard footing
    ctx.save();
    roundRectPath(ctx, x + 8, y + 220, 124, 12, 4);
    ctx.clip();
    for (let k = -2; k < 14; k++) {
      ctx.fillStyle = k % 2 ? '#1a1406' : 'rgba(255,176,32,0.55)';
      ctx.beginPath();
      ctx.moveTo(x + 8 + k * 12, y + 232);
      ctx.lineTo(x + 8 + k * 12 + 12, y + 220);
      ctx.lineTo(x + 8 + k * 12 + 24, y + 220);
      ctx.lineTo(x + 8 + k * 12 + 12, y + 232);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = rgba(COLORS.magenta, 0.55);
  ctx.fillText('MULTIPLIER FORGES', (FORGE.x0 + FORGE.x1) / 2, FORGE.y0 - 4);

  // Loading dock bay
  const dx = DOCK.x0;
  const dw = DOCK.x1 - DOCK.x0;
  const dg = ctx.createLinearGradient(dx, 0, DOCK.x1, 0);
  dg.addColorStop(0, '#070b1e');
  dg.addColorStop(1, '#0c1434');
  ctx.fillStyle = dg;
  ctx.fillRect(dx, 130, dw, FLOOR.y0 - 130);
  // Doorframe
  ctx.strokeStyle = '#2a3a6e';
  ctx.lineWidth = 14;
  ctx.strokeRect(dx + 8, 136, dw - 4, FLOOR.y0 - 140);
  ctx.strokeStyle = rgba(COLORS.amber, 0.5);
  ctx.lineWidth = 2;
  ctx.strokeRect(dx + 16, 144, dw - 20, FLOOR.y0 - 156);
  // Shutter slats inside dock
  for (let y = 150; y < 420; y += 18) {
    ctx.fillStyle = 'rgba(93,107,143,0.08)';
    ctx.fillRect(dx + 20, y, dw - 28, 10);
  }
  // Dock platform
  const pg = ctx.createLinearGradient(0, DOCK.bossBaseY, 0, FLOOR.y0 + 6);
  pg.addColorStop(0, '#3a4a78');
  pg.addColorStop(1, '#141c38');
  ctx.fillStyle = pg;
  ctx.fillRect(dx, DOCK.bossBaseY, dw, FLOOR.y0 - DOCK.bossBaseY + 6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, DOCK.bossBaseY + 4, dw, 14);
  ctx.clip();
  for (let k = 0; k < 40; k++) {
    ctx.fillStyle = k % 2 ? '#141006' : 'rgba(255,176,32,0.7)';
    ctx.beginPath();
    ctx.moveTo(dx + k * 16, DOCK.bossBaseY + 18);
    ctx.lineTo(dx + k * 16 + 16, DOCK.bossBaseY + 4);
    ctx.lineTo(dx + k * 16 + 32, DOCK.bossBaseY + 4);
    ctx.lineTo(dx + k * 16 + 16, DOCK.bossBaseY + 18);
    ctx.fill();
  }
  ctx.restore();
  ctx.font = `900 18px ${FONT.display}`;
  ctx.fillStyle = rgba(COLORS.amber, 0.5);
  ctx.fillText('LOADING DOCK', dx + dw / 2, 166);

  // Floor
  const fg = ctx.createLinearGradient(0, FLOOR.y0, 0, H);
  fg.addColorStop(0, '#1a2448');
  fg.addColorStop(0.15, '#10172f');
  fg.addColorStop(1, '#05070f');
  ctx.fillStyle = fg;
  ctx.fillRect(0, FLOOR.y0, W, H - FLOOR.y0);
  ctx.fillStyle = rgba(COLORS.cyan, 0.5);
  ctx.fillRect(0, FLOOR.y0, W, 2);
  ctx.strokeStyle = 'rgba(93,107,143,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 68) {
    ctx.moveTo(x, FLOOR.y0 + 2);
    ctx.lineTo(x + (x - W / 2) * 0.12, H);
  }
  ctx.moveTo(0, FLOOR.y0 + 34);
  ctx.lineTo(W, FLOOR.y0 + 34);
  ctx.stroke();
}
