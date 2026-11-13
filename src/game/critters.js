// Cyber-Cat factory inspector and Auto-Drones.

import { COLORS } from '../core/theme.js';
import { TAU, clamp, easeInOutSine, roundRectPath } from '../render/util.js';
import { PAL } from '../render/sprites.js';
import { FLOOR } from './layout.js';

// ---------------------------------------------------------------------------
// Cyber-Cat
// ---------------------------------------------------------------------------

const CAT_Y = FLOOR.y1 - 8; // paws on the floor line
const X_MIN = 40;
const X_MAX = 1326;

export class CyberCat {
  constructor({ onMeow } = {}) {
    this.onMeow = onMeow || null;
    this.active = false;
    this.x = -80;
    this.dir = 1;
    this.state = 'walk';
    this.stateT = 3;
    this.targetX = 400;
    this.walkPhase = 0;
    this.tail = 0;
    this.blink = 0;
    this.blinkT = 2;
    this.meowT = 0; // mouth open timer
    this.speed = 0;
    this.chaseCooldown = 0;
    this.leaving = false;
  }

  setActive(on) {
    if (on && !this.active) {
      this.active = true;
      this.leaving = false;
      this.x = -60;
      this.dir = 1;
      this.state = 'walk';
      this.targetX = 200 + Math.random() * 500;
    } else if (!on && this.active) {
      this.leaving = true;
      this.state = 'walk';
      this.targetX = -120;
    }
  }

  /** Something sparkly landed at floor x — maybe chase it. */
  notice(x) {
    if (!this.active || this.leaving || this.chaseCooldown > 0) return;
    if (Math.abs(x - this.x) > 700) return;
    this.state = 'chase';
    this.targetX = clamp(x, X_MIN, X_MAX);
    this.chaseCooldown = 4;
  }

  hitTest(wx, wy) {
    return this.active && Math.abs(wx - this.x) < 60 && wy > CAT_Y - 80 && wy < CAT_Y + 20;
  }

  pet() {
    this.state = 'meow';
    this.stateT = 1.2;
    this.meowT = 0.6;
    if (this.onMeow) this.onMeow();
  }

  update(dt) {
    if (!this.active) return;
    this.chaseCooldown = Math.max(0, this.chaseCooldown - dt);
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.15;
      this.blinkT = 1.5 + Math.random() * 3.5;
    }
    this.blink = Math.max(0, this.blink - dt);
    this.meowT = Math.max(0, this.meowT - dt);
    this.stateT -= dt;
    let targetSpeed = 0;
    if (this.state === 'walk' || this.state === 'chase') {
      const dx = this.targetX - this.x;
      this.dir = dx >= 0 ? 1 : -1;
      targetSpeed = this.state === 'chase' ? 260 : 70;
      if (Math.abs(dx) < 6) {
        if (this.leaving) {
          this.active = false;
          return;
        }
        if (this.state === 'chase') {
          this.state = 'sit';
          this.stateT = 1.5;
        } else {
          const roll = Math.random();
          if (roll < 0.5) {
            this.state = 'sit';
            this.stateT = 2 + Math.random() * 4;
          } else if (roll < 0.7) {
            this.state = 'meow';
            this.stateT = 1.2;
            this.meowT = 0.6;
            if (this.onMeow) this.onMeow();
          } else {
            this.targetX = X_MIN + Math.random() * (X_MAX - X_MIN);
          }
        }
      }
    } else if (this.stateT <= 0) {
      this.state = 'walk';
      this.targetX = X_MIN + Math.random() * (X_MAX - X_MIN);
    }
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 6);
    this.x += this.dir * this.speed * dt;
    this.walkPhase += this.speed * dt * 0.09;
    this.tail += dt * (this.state === 'sit' ? 2.2 : 5);
  }

  draw(ctx, r, time, sprites) {
    if (!this.active) return;
    const sitting = this.state === 'sit' || this.state === 'meow';
    r.local(this.x, CAT_Y, 0, 1);
    // flip by direction
    const m = r.m;
    ctx.setTransform(m * this.dir, 0, 0, m, r.tx + this.x * m, r.ty + CAT_Y * m);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 6, 0, 0, TAU);
    ctx.fill();
    const bodyY = sitting ? -30 : -26;
    // Tail (swishing)
    const sw = Math.sin(this.tail) * (sitting ? 0.6 : 0.35);
    ctx.strokeStyle = '#2a3560';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-24, bodyY - 2);
    ctx.bezierCurveTo(-44, bodyY - 10, -46 + sw * 20, bodyY - 34, -36 + sw * 26, bodyY - 48);
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(sprites.glow[PAL.cyan], -36 + sw * 26 - 12, bodyY - 48 - 12, 24, 24);
    ctx.globalCompositeOperation = 'source-over';
    // Legs
    ctx.strokeStyle = '#1b2448';
    ctx.lineWidth = 6;
    ctx.beginPath();
    if (sitting) {
      ctx.moveTo(12, bodyY + 6);
      ctx.lineTo(14, -2);
      ctx.moveTo(20, bodyY + 6);
      ctx.lineTo(22, -2);
    } else {
      const p = this.walkPhase;
      for (let i = 0; i < 4; i++) {
        const lx = i < 2 ? 16 + i * 6 : -18 + (i - 2) * 6;
        const ph = p + (i % 2 ? Math.PI : 0) + (i >= 2 ? Math.PI / 2 : 0);
        ctx.moveTo(lx, bodyY + 4);
        ctx.lineTo(lx + Math.sin(ph) * 7, -2 - Math.max(0, Math.cos(ph)) * 4);
      }
    }
    ctx.stroke();
    // Body
    ctx.fillStyle = '#26305a';
    ctx.beginPath();
    if (sitting) ctx.ellipse(-4, bodyY - 4, 24, 18, -0.35, 0, TAU);
    else ctx.ellipse(0, bodyY, 30, 13, 0, 0, TAU);
    ctx.fill();
    // neon stripes
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, bodyY - 10);
    ctx.lineTo(-10, bodyY + 2);
    ctx.moveTo(-4, bodyY - 12);
    ctx.lineTo(0, bodyY + 2);
    ctx.stroke();
    // Head
    const hx = sitting ? 14 : 28;
    const hy = sitting ? bodyY - 26 : bodyY - 12 + Math.sin(this.walkPhase * 2) * 1.5;
    ctx.fillStyle = '#2f3b6c';
    ctx.beginPath();
    ctx.moveTo(hx - 13, hy - 6);
    ctx.lineTo(hx - 11, hy - 24);
    ctx.lineTo(hx - 3, hy - 12);
    ctx.lineTo(hx + 4, hy - 13);
    ctx.lineTo(hx + 12, hy - 24);
    ctx.lineTo(hx + 14, hy - 5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx, hy, 15, 12, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COLORS.magenta;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx - 10, hy - 18);
    ctx.lineTo(hx - 6, hy - 11);
    ctx.moveTo(hx + 10, hy - 18);
    ctx.lineTo(hx + 6, hy - 11);
    ctx.stroke();
    // Eyes
    const open = this.blink > 0 ? 0.15 : 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8;
    ctx.drawImage(sprites.glow[PAL.green], hx - 2 - 10, hy - 2 - 10, 20, 20);
    ctx.drawImage(sprites.glow[PAL.green], hx + 8 - 10, hy - 2 - 10, 20, 20);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COLORS.green;
    ctx.beginPath();
    ctx.ellipse(hx - 2, hy - 2, 3, 4 * open, 0, 0, TAU);
    ctx.ellipse(hx + 8, hy - 2, 3, 4 * open, 0, 0, TAU);
    ctx.fill();
    // Mouth (meow)
    if (this.meowT > 0) {
      ctx.fillStyle = '#05070f';
      ctx.beginPath();
      ctx.ellipse(hx + 5, hy + 6, 4, 4 * (this.meowT / 0.6), 0, 0, TAU);
      ctx.fill();
    }
    // whiskers
    ctx.strokeStyle = 'rgba(169,182,214,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx + 12, hy + 3);
    ctx.lineTo(hx + 24, hy);
    ctx.moveTo(hx + 12, hy + 5);
    ctx.lineTo(hx + 24, hy + 6);
    ctx.stroke();
    r.resetLocal();
  }
}

// ---------------------------------------------------------------------------
// Auto-Drone
// ---------------------------------------------------------------------------

const HOME = { x: 1040, y: 330 };

export class Drone {
  constructor(tx, ty, sprites) {
    this.sprites = sprites;
    this.sx = HOME.x;
    this.sy = HOME.y;
    this.tx = tx;
    this.ty = ty;
    this.x = HOME.x;
    this.y = HOME.y;
    this.state = 'out';
    this.t = 0;
    this.beam = 0;
    this.done = false;
    this._arrive = null;
    this.arrived = new Promise((res) => (this._arrive = res));
  }

  goHome() {
    if (this.state === 'back' || this.done) return;
    this.state = 'back';
    this.t = 0;
    this.sx = this.x;
    this.sy = this.y;
    this.beam = 0;
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'out') {
      const p = clamp(this.t / 1.0, 0, 1);
      const e = easeInOutSine(p);
      this.x = this.sx + (this.tx - this.sx) * e;
      this.y = this.sy + (this.ty - this.sy) * e - Math.sin(p * Math.PI) * 90;
      if (p >= 1) {
        this.state = 'hover';
        this.t = 0;
        this._arrive();
      }
    } else if (this.state === 'hover') {
      this.x = this.tx + Math.sin(this.t * 3) * 4;
      this.y = this.ty + Math.sin(this.t * 5) * 5;
      this.beam = Math.min(1, this.beam + dt * 4);
    } else if (this.state === 'back') {
      const p = clamp(this.t / 0.9, 0, 1);
      const e = easeInOutSine(p);
      this.x = this.sx + (HOME.x - this.sx) * e;
      this.y = this.sy + (HOME.y - 80 - this.sy) * e - Math.sin(p * Math.PI) * 60;
      if (p >= 1) this.done = true;
    }
  }

  draw(ctx, r, time) {
    if (this.done) return;
    const S = this.sprites;
    const x = this.x;
    const y = this.y;
    r.resetLocal();
    if (this.beam > 0) {
      // calibration beam to the forge
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.beam * (0.5 + 0.3 * Math.sin(time * 30));
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, y + 14);
      ctx.lineTo(this.tx, this.ty + 70);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    const tilt = this.state === 'out' ? -0.15 : this.state === 'back' ? 0.15 : Math.sin(time * 4) * 0.05;
    r.local(x, y, tilt, 1);
    // arms
    ctx.strokeStyle = '#5d6b8f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-30, -8);
    ctx.lineTo(30, -8);
    ctx.stroke();
    // rotors (blurred discs)
    ctx.globalCompositeOperation = 'lighter';
    const fl = 0.55 + 0.2 * Math.sin(time * 70);
    ctx.globalAlpha = fl;
    ctx.drawImage(S.glow[PAL.cyan], -48, -18, 36, 18);
    ctx.drawImage(S.glow[PAL.cyan], 12, -18, 36, 18);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // body
    ctx.fillStyle = '#2a3560';
    roundRectPath(ctx, -18, -10, 36, 24, 10);
    ctx.fill();
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 2;
    ctx.stroke();
    // eye
    ctx.fillStyle = COLORS.green;
    ctx.beginPath();
    ctx.arc(Math.sin(time * 2) * 5, 2, 5, 0, TAU);
    ctx.fill();
    r.resetLocal();
  }
}
