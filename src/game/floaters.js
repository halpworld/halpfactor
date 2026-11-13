// Pooled floating texts ("+56!", "CRITICAL EFFICIENCY!", "+20 bolts").
// Each slot owns a reusable canvas; text is rasterised once on spawn.

import { makeCanvas, easeOutBack, clamp } from '../render/util.js';
import { renderTextInto } from '../render/sprites.js';

const POOL = 16;

export class Floaters {
  constructor() {
    this.slots = [];
    for (let i = 0; i < POOL; i++) {
      const { canvas, ctx } = makeCanvas(512, 128);
      this.slots.push({ canvas, ctx, w: 0, h: 0, k: 2, alive: false, x: 0, y: 0, vy: 0, t: 0, life: 0, delay: 0, scale: 1, wobble: 0 });
    }
    this.next = 0;
  }

  /**
   * spawn(text, x, y, { size=48, color, glow, life=1.4, vy=-70, delay=0, scale=1, wobble=0 })
   */
  spawn(text, x, y, o = {}) {
    let slot = null;
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[(this.next + i) % POOL];
      if (!s.alive) {
        slot = s;
        this.next = (this.next + i + 1) % POOL;
        break;
      }
    }
    if (!slot) {
      slot = this.slots[this.next];
      this.next = (this.next + 1) % POOL;
    }
    renderTextInto(slot, text, { size: o.size || 48, color: o.color || '#ffffff', glow: o.glow, strokeWidth: (o.size || 48) * 0.16 });
    slot.alive = true;
    slot.x = x;
    slot.y = y;
    slot.vy = o.vy == null ? -70 : o.vy;
    slot.t = 0;
    slot.life = o.life || 1.4;
    slot.delay = o.delay || 0;
    slot.scale = o.scale || 1;
    slot.wobble = o.wobble || 0;
  }

  clear() {
    for (const s of this.slots) s.alive = false;
  }

  update(dt) {
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (!s.alive) continue;
      if (s.delay > 0) {
        s.delay -= dt;
        continue;
      }
      s.t += dt;
      s.y += s.vy * dt;
      s.vy *= 1 - Math.min(1, dt * 1.5);
      if (s.t >= s.life) s.alive = false;
    }
  }

  draw(ctx, r) {
    for (let i = 0; i < POOL; i++) {
      const s = this.slots[i];
      if (!s.alive || s.delay > 0) continue;
      const p = s.t / s.life;
      const pop = s.t < 0.35 ? easeOutBack(s.t / 0.35) : 1;
      ctx.globalAlpha = clamp((1 - p) * 3, 0, 1);
      const rot = s.wobble ? Math.sin(s.t * 12) * 0.05 * s.wobble : 0;
      r.local(s.x, s.y, rot, s.scale * pop);
      ctx.drawImage(s.canvas, 0, 0, s.w * s.k, s.h * s.k, -s.w / 2, -s.h / 2, s.w, s.h);
    }
    ctx.globalAlpha = 1;
    r.resetLocal();
  }
}
