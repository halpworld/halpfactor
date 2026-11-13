// Pooled particle system. Struct-of-arrays in fixed-size typed arrays:
// zero allocations per frame in steady state.

import { PALETTE } from './sprites.js';

export const P = Object.freeze({
  SPARK: 0, // additive streak, gravity
  STEAM: 1, // soft puff, rises & grows
  SMOKE: 2, // dark puff, rises & grows
  CONFETTI: 3, // spinning ribbon, gravity + flutter
  COIN: 4, // spinning gold bolt-nut, gravity, bounces on floor
  EMBER: 5, // additive soft dot, floats
  RING: 6, // additive expanding ring (shockwave)
});

const CAP = 1400;
const FLOOR_Y = 1000;

export class Particles {
  constructor(sprites) {
    this.sprites = sprites;
    this.cap = CAP;
    this.x = new Float32Array(CAP);
    this.y = new Float32Array(CAP);
    this.vx = new Float32Array(CAP);
    this.vy = new Float32Array(CAP);
    this.life = new Float32Array(CAP);
    this.max = new Float32Array(CAP);
    this.size = new Float32Array(CAP);
    this.rot = new Float32Array(CAP);
    this.vr = new Float32Array(CAP);
    this.grav = new Float32Array(CAP);
    this.drag = new Float32Array(CAP);
    this.color = new Uint8Array(CAP);
    this.type = new Uint8Array(CAP);
    this.cursor = 0;
    this.high = 0; // highest index ever used + 1 (bounds the loops)
    this.count = 0;
    this.onFloorSpark = null; // optional callback(x) — the cat chases sparks
  }

  _alloc() {
    // Ring search from the cursor for a dead slot; overwrite the cursor slot if full.
    for (let n = 0; n < CAP; n++) {
      const i = (this.cursor + n) % CAP;
      if (this.life[i] <= 0) {
        this.cursor = (i + 1) % CAP;
        if (i + 1 > this.high) this.high = i + 1;
        return i;
      }
    }
    const i = this.cursor;
    this.cursor = (i + 1) % CAP;
    return i;
  }

  spawn(type, x, y, vx, vy, life, size, color, grav = 0, drag = 0, rot = 0, vr = 0) {
    const i = this._alloc();
    this.type[i] = type;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.color[i] = color;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.rot[i] = rot;
    this.vr[i] = vr;
    return i;
  }

  // ---- Emitter helpers (gameplay-facing) ---------------------------------

  sparks(x, y, n, color, speed = 380, spread = Math.PI * 2, dir = -Math.PI / 2) {
    for (let k = 0; k < n; k++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.75);
      this.spawn(P.SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.45,
        4 + Math.random() * 4, color, 900, 1.2);
    }
  }

  steam(x, y, n = 1, strength = 1) {
    for (let k = 0; k < n; k++) {
      this.spawn(P.STEAM, x + (Math.random() - 0.5) * 10, y, (Math.random() - 0.5) * 30,
        -(50 + Math.random() * 60) * strength, 0.9 + Math.random() * 0.7, 14 + Math.random() * 10, 7, -20, 1.4,
        0, (Math.random() - 0.5) * 1.5);
    }
  }

  smoke(x, y, n = 6) {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
      const s = 60 + Math.random() * 110;
      this.spawn(P.SMOKE, x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 16, Math.cos(a) * s,
        Math.sin(a) * s, 1.1 + Math.random() * 0.8, 22 + Math.random() * 18, 0, -30, 1.6, 0,
        (Math.random() - 0.5) * 2);
    }
  }

  confetti(x, y, n = 60, power = 520) {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = power * (0.4 + Math.random() * 0.8);
      this.spawn(P.CONFETTI, x, y, Math.cos(a) * s, Math.sin(a) * s, 1.6 + Math.random() * 1.2,
        6 + Math.random() * 6, (Math.random() * PALETTE.length) | 0, 520, 1.8, Math.random() * 6,
        (Math.random() - 0.5) * 18);
    }
  }

  coins(x, y, n = 10) {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
      const s = 280 + Math.random() * 320;
      this.spawn(P.COIN, x, y, Math.cos(a) * s, Math.sin(a) * s, 1.4 + Math.random() * 0.8,
        22 + Math.random() * 8, 5, 1100, 0.4, Math.random() * 6, (Math.random() - 0.5) * 14);
    }
  }

  embers(x, y, n, color, spreadX = 20) {
    for (let k = 0; k < n; k++) {
      this.spawn(P.EMBER, x + (Math.random() - 0.5) * spreadX, y, (Math.random() - 0.5) * 40,
        -30 - Math.random() * 60, 0.6 + Math.random() * 0.8, 10 + Math.random() * 10, color, -10, 0.8);
    }
  }

  ring(x, y, color, size = 160, life = 0.45) {
    this.spawn(P.RING, x, y, 0, 0, life, size, color);
  }

  clear() {
    this.life.fill(0);
    this.count = 0;
  }

  // ---- Simulation -----------------------------------------------------------

  update(dt) {
    let count = 0;
    const { x, y, vx, vy, life, grav, drag, rot, vr, type } = this;
    for (let i = 0; i < this.high; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) continue;
      count++;
      const d = 1 / (1 + drag[i] * dt);
      vx[i] *= d;
      vy[i] = (vy[i] + grav[i] * dt) * d;
      x[i] += vx[i] * dt;
      y[i] += vy[i] * dt;
      rot[i] += vr[i] * dt;
      const t = type[i];
      if (t === P.CONFETTI) {
        vx[i] += Math.sin(life[i] * 9 + i) * 140 * dt; // flutter
      } else if (t === P.COIN || t === P.SPARK) {
        if (y[i] > FLOOR_Y && vy[i] > 0) {
          y[i] = FLOOR_Y;
          vy[i] *= -0.45;
          vx[i] *= 0.7;
          if (t === P.SPARK && this.onFloorSpark && Math.random() < 0.05) this.onFloorSpark(x[i]);
        }
      }
    }
    this.count = count;
  }

  // ---- Rendering ------------------------------------------------------------

  /**
   * Draw all particles. `r` is the Renderer (provides local transforms).
   * Two passes: alpha-blended (steam/smoke/confetti/coins) then additive (sparks/embers/rings).
   */
  draw(ctx, r) {
    const { x, y, vx, vy, life, max, size, rot, color, type } = this;
    const S = this.sprites;
    // Pass 1: normal blending
    for (let i = 0; i < this.high; i++) {
      if (life[i] <= 0) continue;
      const t = type[i];
      const k = life[i] / max[i]; // 1 → 0
      if (t === P.STEAM || t === P.SMOKE) {
        const s = size[i] * (1 + (1 - k) * 2.2);
        ctx.globalAlpha = t === P.STEAM ? k * 0.55 : Math.min(1, k * 1.4) * 0.85;
        r.local(x[i], y[i], rot[i], 1);
        ctx.drawImage(t === P.STEAM ? S.steam : S.smoke, -s, -s, s * 2, s * 2);
      } else if (t === P.CONFETTI) {
        ctx.globalAlpha = Math.min(1, k * 2);
        r.local(x[i], y[i], rot[i], 1);
        ctx.fillStyle = PALETTE[color[i]];
        const s = size[i];
        ctx.fillRect(-s * 0.5, -s * 0.25 * Math.abs(Math.cos(rot[i] * 1.7)) - 1, s, s * 0.5);
      } else if (t === P.COIN) {
        ctx.globalAlpha = Math.min(1, k * 3);
        r.local(x[i], y[i], 0, 1);
        const s = size[i];
        const sx = Math.abs(Math.cos(rot[i])) * 0.8 + 0.2; // coin spin
        ctx.drawImage(S.boltCoin, (-s * sx) / 2, -s / 2, s * sx, s);
      }
    }
    // Pass 2: additive glow
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.high; i++) {
      if (life[i] <= 0) continue;
      const t = type[i];
      const k = life[i] / max[i];
      if (t === P.SPARK) {
        const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
        const len = size[i] * (1.5 + Math.min(4, sp / 120));
        ctx.globalAlpha = Math.min(1, k * 1.6);
        r.local(x[i], y[i], Math.atan2(vy[i], vx[i]), 1);
        const g = S.glow[color[i]];
        ctx.drawImage(g, -len, -size[i], len * 2, size[i] * 2);
      } else if (t === P.EMBER) {
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.9;
        const s = size[i];
        r.local(x[i], y[i], 0, 1);
        ctx.drawImage(S.glow[color[i]], -s, -s, s * 2, s * 2);
      } else if (t === P.RING) {
        const p = 1 - k;
        const s = size[i] * (0.2 + p * 0.9);
        ctx.globalAlpha = k * 0.9;
        r.local(x[i], y[i], 0, 1);
        ctx.strokeStyle = PALETTE[color[i]];
        ctx.lineWidth = 10 * k + 2;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, 6.2832);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    r.resetLocal();
  }
}
