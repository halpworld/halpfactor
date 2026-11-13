// Canvas2D renderer: viewport sizing, letterboxed world transform, screen shake,
// flashes, post-FX overlay (scanlines + vignette), portrait "rotate" overlay.

import { WORLD, COLORS, FONT } from '../core/theme.js';
import { makeCanvas, clamp } from './util.js';

const MAX_DPR = 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.scale = 1; // world → css px
    this.offX = 0; // css px
    this.offY = 0;
    this.m = 1; // world → device px  (scale * dpr)
    this.tx = 0; // device px translation incl. shake
    this.ty = 0;
    this.portrait = false;
    this.version = 0; // bumps on every resize (caches compare against it)

    // Shake: trauma model (0..1), decays. Offset ∝ trauma².
    this.trauma = 0;
    this.shakeT = 0;
    // Flash: additive full-screen colour.
    this.flashColor = '#ffffff';
    this.flashA = 0;
    this.flashDecay = 3;

    this.overlay = null; // pre-rendered scanline+vignette canvas (device px)
    this.resize();
  }

  resize() {
    const vv = window.visualViewport;
    const cssW = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const cssH = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    const dpr = clamp(window.devicePixelRatio || 1, 1, MAX_DPR);
    const changed = cssW !== this.cssW || cssH !== this.cssH || dpr !== this.dpr || !this.overlay;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.portrait = cssH > cssW * 1.05;
    const pw = Math.round(cssW * dpr);
    const ph = Math.round(cssH * dpr);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.scale = Math.min(cssW / WORLD.W, cssH / WORLD.H);
    this.offX = (cssW - WORLD.W * this.scale) / 2;
    this.offY = (cssH - WORLD.H * this.scale) / 2;
    this.m = this.scale * dpr;
    if (changed) {
      this._buildOverlay();
      this.version++;
    }
    return changed;
  }

  /** World logical px → screen CSS px. */
  worldToScreen(x, y) {
    return { x: this.offX + x * this.scale, y: this.offY + y * this.scale };
  }

  /** Screen CSS px → world logical px. */
  screenToWorld(x, y) {
    return { x: (x - this.offX) / this.scale, y: (y - this.offY) / this.scale };
  }

  /** World rect {x,y,w,h} → screen CSS rect. */
  rectToScreen(rect) {
    return {
      x: this.offX + rect.x * this.scale,
      y: this.offY + rect.y * this.scale,
      w: rect.w * this.scale,
      h: rect.h * this.scale,
    };
  }

  /** Smallest CSS size of one world unit (for hit-area guarantees). */
  get cssPerWorld() {
    return this.scale;
  }

  addShake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  flash(color, alpha = 0.5, decay = 3) {
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, alpha);
    this.flashDecay = decay;
  }

  update(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.shakeT += dt;
    this.flashA = Math.max(0, this.flashA - dt * this.flashDecay);
  }

  /** Starts a frame: clears letterbox, sets the world transform (with shake). */
  beginFrame() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COLORS.bgDeep;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    let sx = 0;
    let sy = 0;
    if (this.trauma > 0) {
      const t2 = this.trauma * this.trauma;
      const amp = 18 * t2;
      const t = this.shakeT * 38;
      sx = (Math.sin(t * 1.3) + Math.sin(t * 2.9 + 1.7) * 0.5) * amp;
      sy = (Math.sin(t * 1.7 + 0.4) + Math.sin(t * 3.3 + 2.1) * 0.5) * amp;
    }
    this.tx = (this.offX + sx * this.scale) * this.dpr;
    this.ty = (this.offY + sy * this.scale) * this.dpr;
    ctx.setTransform(this.m, 0, 0, this.m, this.tx, this.ty);
  }

  /** Sets transform = world ∘ translate(x,y) ∘ rotate(rot) ∘ scale(sc). Zero allocations. */
  local(x, y, rot, sc) {
    const m = this.m * sc;
    if (rot === 0) {
      this.ctx.setTransform(m, 0, 0, m, this.tx + x * this.m, this.ty + y * this.m);
    } else {
      const c = Math.cos(rot) * m;
      const s = Math.sin(rot) * m;
      this.ctx.setTransform(c, s, -s, c, this.tx + x * this.m, this.ty + y * this.m);
    }
  }

  /** Non-uniform local transform (squash & stretch). */
  localXY(x, y, sx, sy) {
    this.ctx.setTransform(this.m * sx, 0, 0, this.m * sy, this.tx + x * this.m, this.ty + y * this.m);
  }

  resetLocal() {
    this.ctx.setTransform(this.m, 0, 0, this.m, this.tx, this.ty);
  }

  /** Ends a frame: flash + scanline/vignette overlay + letterbox bars. */
  endFrame() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (this.flashA > 0.001) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.flashA;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (this.overlay) ctx.drawImage(this.overlay, 0, 0);
    // Letterbox bars (cover any shake bleed).
    ctx.fillStyle = COLORS.bgDeep;
    const ox = Math.floor(this.offX * this.dpr);
    const oy = Math.floor(this.offY * this.dpr);
    if (ox > 0) {
      ctx.fillRect(0, 0, ox, this.canvas.height);
      ctx.fillRect(this.canvas.width - ox, 0, ox, this.canvas.height);
    }
    if (oy > 0) {
      ctx.fillRect(0, 0, this.canvas.width, oy);
      ctx.fillRect(0, this.canvas.height - oy, this.canvas.width, oy);
    }
  }

  _buildOverlay() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const { canvas, ctx } = makeCanvas(w, h);
    // Vignette
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.hypot(cx, cy);
    const g = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(2,3,10,0.28)');
    g.addColorStop(1, 'rgba(2,3,10,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Scanlines: 1 dark line every 3 device px (subtle).
    const step = Math.max(2, Math.round(3 * this.dpr));
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, Math.max(1, Math.round(this.dpr * 0.8)));
    // Faint cyan edge bloom at top
    const tg = ctx.createLinearGradient(0, 0, 0, h * 0.18);
    tg.addColorStop(0, 'rgba(34,240,255,0.06)');
    tg.addColorStop(1, 'rgba(34,240,255,0)');
    ctx.fillStyle = tg;
    ctx.fillRect(0, 0, w, h * 0.18);
    this.overlay = canvas;
  }

  /** Canvas-drawn portrait warning. t = seconds. */
  drawRotateOverlay(t) {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    const cx = this.cssW / 2;
    const cy = this.cssH * 0.42;
    const u = Math.min(this.cssW, this.cssH) / 600;
    // Animated rotating tablet: rotates 0 → -90° and pauses.
    const cyc = t % 3;
    const p = cyc < 0.6 ? 0 : cyc < 1.6 ? (cyc - 0.6) : 1;
    const ease = p < 1 ? 0.5 - Math.cos(p * Math.PI) / 2 : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-ease * Math.PI / 2);
    const tw = 150 * u;
    const th = 210 * u;
    ctx.lineWidth = 8 * u;
    ctx.strokeStyle = COLORS.cyan;
    ctx.fillStyle = COLORS.panel;
    ctx.beginPath();
    const rr = 22 * u;
    ctx.moveTo(-tw / 2 + rr, -th / 2);
    ctx.arcTo(tw / 2, -th / 2, tw / 2, th / 2, rr);
    ctx.arcTo(tw / 2, th / 2, -tw / 2, th / 2, rr);
    ctx.arcTo(-tw / 2, th / 2, -tw / 2, -th / 2, rr);
    ctx.arcTo(-tw / 2, -th / 2, tw / 2, -th / 2, rr);
    ctx.closePath();
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 22 * u;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 8 * u;
    ctx.fill();
    ctx.stroke();
    // little robot face on the screen
    ctx.fillStyle = COLORS.cyan;
    ctx.beginPath();
    ctx.arc(-26 * u, -14 * u, 12 * u, 0, Math.PI * 2);
    ctx.arc(26 * u, -14 * u, 12 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-30 * u, 24 * u, 60 * u, 8 * u);
    ctx.restore();
    // Arrow arc
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 6 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, 170 * u, -Math.PI * 0.35, -Math.PI * 0.05);
    ctx.stroke();
    const ax = cx + Math.cos(-Math.PI * 0.05) * 170 * u;
    const ay = cy + Math.sin(-Math.PI * 0.05) * 170 * u;
    ctx.fillStyle = COLORS.magenta;
    ctx.beginPath();
    ctx.moveTo(ax - 14 * u, ay - 8 * u);
    ctx.lineTo(ax + 14 * u, ay - 8 * u);
    ctx.lineTo(ax, ay + 14 * u);
    ctx.closePath();
    ctx.fill();
    ctx.font = `800 ${Math.round(40 * u)}px ${FONT.display}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('Rotate your iPad', cx, this.cssH * 0.72);
    ctx.font = `600 ${Math.round(24 * u)}px ${FONT.display}`;
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('The factory runs sideways!', cx, this.cssH * 0.72 + 52 * u);
  }
}
