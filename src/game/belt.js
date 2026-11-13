// Bézier conveyor belts, arc-length parameterised, with flowing chevrons.
// States: growing → live → (retracting | fizzling) → dead.

import { COLORS } from '../core/theme.js';
import { makeCanvas, clamp } from '../render/util.js';

const N = 48; // LUT segments
const HALF_W = 10; // half rail separation (logical px)
const CHEV_GAP = 30;

const chevronCache = new Map();
function chevronSprite(color) {
  let c = chevronCache.get(color);
  if (c) return c;
  const k = 2;
  const { canvas, ctx } = makeCanvas(28 * k, 24 * k);
  ctx.scale(k, k);
  ctx.translate(14, 12);
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-5, -7);
  ctx.lineTo(3, 0);
  ctx.lineTo(-5, 7);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  c = canvas;
  chevronCache.set(color, c);
  return c;
}

const RAINBOW = [];
for (let i = 0; i < 12; i++) RAINBOW.push(`hsl(${i * 30},100%,62%)`);

export const BELT_STYLE = Object.freeze({ DEFAULT: 0, GOLD: 1, RAINBOW: 2, OVERCLOCK: 3 });
// Belt skins (shop "belt" styles). `skin` may also be a boolean (legacy goldRails).
const SKINS = {
  steel: null,
  gold: { rail: COLORS.gold, chev: [COLORS.gold] },
  candy: { rail: '#ff5fb8', chev: ['#ff5fb8', '#ffffff'] },
  lava: { rail: '#ff6a1a', chev: ['#ffb020', '#ff3b1f'], flicker: true },
};
export const BELT_SKINS = Object.freeze(Object.keys(SKINS));

export class Belt {
  /** p* are {x,y}. */
  constructor(p0, p1, p2, p3) {
    this.px = new Float32Array(N + 1);
    this.py = new Float32Array(N + 1);
    this.nx = new Float32Array(N + 1); // unit normal
    this.ny = new Float32Array(N + 1);
    this.cum = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      const b0 = u * u * u;
      const b1 = 3 * u * u * t;
      const b2 = 3 * u * t * t;
      const b3 = t * t * t;
      this.px[i] = b0 * p0.x + b1 * p1.x + b2 * p2.x + b3 * p3.x;
      this.py[i] = b0 * p0.y + b1 * p1.y + b2 * p2.y + b3 * p3.y;
      // derivative
      const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
      const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
      const l = Math.hypot(dx, dy) || 1;
      this.nx[i] = -dy / l;
      this.ny[i] = dx / l;
      if (i > 0) this.cum[i] = this.cum[i - 1] + Math.hypot(this.px[i] - this.px[i - 1], this.py[i] - this.py[i - 1]);
    }
    this.length = this.cum[N];
    this.state = 'growing';
    this.head = 0; // fraction of length drawn (0..1)
    this.alpha = 1;
    this.jammed = false;
    this.flow = 0; // chevron scroll (px)
    this.speedMul = 1;
    this.pulse = 0; // flash on ignite
    this._pt = { x: 0, y: 0, a: 0 };
  }

  /** Point at arc length s (px). Writes into a reused object — copy if you need to keep it. */
  pointAt(s, out = this._pt) {
    s = clamp(s, 0, this.length);
    // binary search in cum
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] < s) lo = mid;
      else hi = mid;
    }
    const segLen = this.cum[hi] - this.cum[lo] || 1;
    const f = (s - this.cum[lo]) / segLen;
    out.x = this.px[lo] + (this.px[hi] - this.px[lo]) * f;
    out.y = this.py[lo] + (this.py[hi] - this.py[lo]) * f;
    out.a = Math.atan2(this.py[hi] - this.py[lo], this.px[hi] - this.px[lo]);
    return out;
  }

  get end() {
    return { x: this.px[N], y: this.py[N] };
  }

  retract() {
    if (this.state === 'dead') return;
    this.state = 'retracting';
  }

  fizzle() {
    if (this.state === 'dead') return;
    this.state = 'fizzling';
    this.fizzleT = 0;
  }

  get isLive() {
    return this.state === 'live';
  }

  update(dt) {
    if (this.state === 'growing') {
      this.head = Math.min(1, this.head + dt / 0.35);
      if (this.head >= 1) this.state = 'live';
    } else if (this.state === 'retracting') {
      this.head -= dt / 0.3;
      if (this.head <= 0) {
        this.head = 0;
        this.state = 'dead';
      }
    } else if (this.state === 'fizzling') {
      this.fizzleT += dt;
      this.alpha = Math.max(0, 1 - this.fizzleT / 0.9);
      if (this.alpha <= 0) this.state = 'dead';
    }
    if (!this.jammed) this.flow += dt * 90 * this.speedMul;
    this.pulse = Math.max(0, this.pulse - dt * 2);
  }

  _railPath(ctx, side, endIdx, endFrac) {
    const o = side * HALF_W;
    ctx.moveTo(this.px[0] + this.nx[0] * o, this.py[0] + this.ny[0] * o);
    for (let i = 1; i <= endIdx; i++) ctx.lineTo(this.px[i] + this.nx[i] * o, this.py[i] + this.ny[i] * o);
    if (endIdx < N && endFrac > 0) {
      const j = endIdx + 1;
      const x = this.px[endIdx] + (this.px[j] - this.px[endIdx]) * endFrac;
      const y = this.py[endIdx] + (this.py[j] - this.py[endIdx]) * endFrac;
      ctx.lineTo(x + this.nx[j] * o, y + this.ny[j] * o);
    }
  }

  /**
   * style: BELT_STYLE.*; time: seconds; skin: 'steel'|'gold'|'candy'|'lava' (or true = gold).
   */
  draw(ctx, r, time, style, skin) {
    const sk = skin === true ? SKINS.gold : (typeof skin === 'string' && Object.prototype.hasOwnProperty.call(SKINS, skin) ? SKINS[skin] : null);
    if (this.state === 'dead' || this.head <= 0) return;
    let a = this.alpha;
    if (this.state === 'fizzling') a *= 0.5 + 0.5 * Math.sin(time * 60) * Math.sin(time * 23);
    if (a <= 0.01) return;
    const headLen = this.head * this.length;
    // find index of head
    let endIdx = 0;
    while (endIdx < N && this.cum[endIdx + 1] <= headLen) endIdx++;
    const endFrac = endIdx < N ? (headLen - this.cum[endIdx]) / (this.cum[endIdx + 1] - this.cum[endIdx] || 1) : 0;

    let railColor = COLORS.purple;
    let chevColor = COLORS.cyan;
    let chevList = null;
    if (sk) {
      railColor = sk.rail;
      chevColor = sk.chev[0];
      if (sk.chev.length > 1) chevList = sk.chev;
    }
    if (style === BELT_STYLE.GOLD) {
      railColor = COLORS.gold;
      chevColor = COLORS.gold;
    } else if (style === BELT_STYLE.OVERCLOCK) {
      railColor = COLORS.cyan;
      chevColor = '#bffcff';
      chevList = null;
    }
    if (this.jammed || this.state === 'fizzling') {
      railColor = COLORS.red;
      chevColor = COLORS.red;
    }

    r.resetLocal();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Belt bed (dark)
    ctx.globalAlpha = a * 0.92;
    ctx.strokeStyle = '#070b1f';
    ctx.lineWidth = HALF_W * 2 + 10;
    ctx.beginPath();
    this._railPath(ctx, 0, endIdx, endFrac);
    ctx.stroke();
    // Glow underlay (additive, wide, soft)
    ctx.globalCompositeOperation = 'lighter';
    let glowBoost = style === BELT_STYLE.OVERCLOCK ? 0.4 : 0.18;
    if (sk && sk.flicker && style !== BELT_STYLE.OVERCLOCK) glowBoost += 0.08 + 0.06 * Math.sin(time * 9) * Math.sin(time * 3.7);
    ctx.globalAlpha = a * (glowBoost + this.pulse * 0.5);
    ctx.strokeStyle = railColor;
    ctx.lineWidth = HALF_W * 2 + 22;
    ctx.stroke();
    // Rails
    ctx.globalAlpha = a;
    ctx.lineWidth = 3;
    ctx.beginPath();
    this._railPath(ctx, -1, endIdx, endFrac);
    this._railPath(ctx, 1, endIdx, endFrac);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = a * 0.5;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Chevrons flowing along arc length
    ctx.globalAlpha = a;
    const off = this.flow % CHEV_GAP;
    const pt = this._pt;
    for (let s = off; s < headLen - 6; s += CHEV_GAP) {
      this.pointAt(s, pt);
      let spr;
      if (this.jammed || this.state === 'fizzling') spr = chevronSprite(COLORS.red);
      else if (style === BELT_STYLE.RAINBOW) {
        const k = Math.round((s - this.flow) / CHEV_GAP); // stays constant per chevron
        spr = chevronSprite(RAINBOW[((k % 12) + 12) % 12]);
      } else if (chevList) {
        const k = Math.round((s - this.flow) / CHEV_GAP);
        spr = chevronSprite(chevList[((k % chevList.length) + chevList.length) % chevList.length]);
      } else spr = chevronSprite(chevColor);
      r.local(pt.x, pt.y, pt.a, 1);
      ctx.drawImage(spr, -14, -12, 28, 24);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    r.resetLocal();
  }
}

export const RAINBOW_COLORS = RAINBOW;
