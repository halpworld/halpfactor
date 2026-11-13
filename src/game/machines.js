// Raw-material Dispensers (crates 1..12) and Multiplier Forges (×1..×12).
// Static art is pre-rendered once per machine; per-frame work is transforms,
// a few additive glows and a rotating gear sprite.

import { COLORS, FONT } from '../core/theme.js';
import { makeCanvas, roundRectPath, TAU, rgba } from '../render/util.js';
import { PAL } from '../render/sprites.js';
import { dispenserSlot, forgeSlot } from './layout.js';

const K = 2; // sprite density

// ---------------------------------------------------------------------------
// Dispenser
// ---------------------------------------------------------------------------

const CRATE_W = 100;
const CRATE_H = 124;

function renderCrate(value) {
  const { canvas, ctx } = makeCanvas(CRATE_W * K, CRATE_H * K);
  ctx.scale(K, K);
  // Mini cubes stacked on top: rows of 4, bottom-up.
  const cube = 15;
  const gap = 4;
  const perRow = 4;
  const rows = Math.ceil(value / perRow);
  const baseY = 64; // top of the bin
  let n = 0;
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(perRow, value - n);
    const rowW = inRow * cube + (inRow - 1) * gap;
    const x0 = (CRATE_W - rowW) / 2;
    const y = baseY - (r + 1) * (cube + 2);
    for (let i = 0; i < inRow; i++) {
      const x = x0 + i * (cube + gap);
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 6;
      const g = ctx.createLinearGradient(x, y, x, y + cube);
      g.addColorStop(0, '#9ffaff');
      g.addColorStop(1, '#138a9e');
      ctx.fillStyle = g;
      roundRectPath(ctx, x, y, cube, cube, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 3, y + 2, cube - 6, 2);
      n++;
    }
  }
  // Bin
  const bx = 6;
  const by = baseY;
  const bw = CRATE_W - 12;
  const bh = CRATE_H - baseY - 4;
  const g = ctx.createLinearGradient(0, by, 0, by + bh);
  g.addColorStop(0, '#3b4a7c');
  g.addColorStop(1, '#141c3a');
  ctx.fillStyle = g;
  roundRectPath(ctx, bx, by, bw, bh, 9);
  ctx.fill();
  ctx.strokeStyle = rgba(COLORS.cyan, 0.85);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // corner brackets
  ctx.strokeStyle = COLORS.steelLight;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx + 2, by + 14);
  ctx.lineTo(bx + 2, by + 2);
  ctx.lineTo(bx + 14, by + 2);
  ctx.moveTo(bx + bw - 2, by + 14);
  ctx.lineTo(bx + bw - 2, by + 2);
  ctx.lineTo(bx + bw - 14, by + 2);
  ctx.stroke();
  // Number
  ctx.font = `900 40px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(value), CRATE_W / 2, by + bh / 2 + 2);
  ctx.shadowBlur = 0;
  ctx.fillText(String(value), CRATE_W / 2, by + bh / 2 + 2);
  return canvas;
}

export class Dispenser {
  constructor(value) {
    this.value = value;
    const s = dispenserSlot(value);
    this.cx = s.cx;
    this.cy = s.cy;
    this.hit = s.hit;
    this.sprite = renderCrate(value);
    this.selected = false;
    this.hover = false;
    this.hint = 0; // >0 → pulse hint (seconds remaining)
    this.sq = 0; // squash spring displacement
    this.sqv = 0;
    this.selT = 0;
  }

  /** Output port for belts (right edge, mid bin). */
  get port() {
    return { x: this.cx + CRATE_W / 2 - 6, y: this.cy + 22 };
  }

  bump(amount = 0.18) {
    this.sqv -= amount * 14;
  }

  update(dt) {
    // damped spring
    const k = 260;
    const d = 14;
    this.sqv += (-k * this.sq - d * this.sqv) * dt;
    this.sq += this.sqv * dt;
    if (this.hint > 0) this.hint = Math.max(0, this.hint - dt);
    this.selT = this.selected ? Math.min(1, this.selT + dt * 6) : Math.max(0, this.selT - dt * 6);
  }

  draw(ctx, r, time, sprites) {
    const baseY = this.cy + CRATE_H / 2;
    const lift = this.selT * 6;
    // Selection / hover glow
    if (this.selT > 0 || this.hover || this.hint > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + 0.25 * Math.sin(time * 8);
      let a = this.selT * 0.9 * pulse;
      if (this.hover) a = Math.max(a, 0.5);
      let col = PAL.cyan;
      if (this.hint > 0 && this.selT === 0) {
        a = Math.max(a, 0.5 + 0.5 * Math.sin(time * 7));
        col = PAL.gold;
      }
      ctx.globalAlpha = a;
      r.resetLocal();
      ctx.drawImage(sprites.soft[col], this.cx - 90, this.cy - 90, 180, 180);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    const sx = 1 - this.sq * 0.6;
    const sy = 1 + this.sq;
    r.localXY(this.cx, baseY - lift, sx, sy);
    ctx.drawImage(this.sprite, -CRATE_W / 2, -CRATE_H, CRATE_W, CRATE_H);
    if (this.selT > 0) {
      ctx.globalAlpha = this.selT;
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 3;
      roundRectPath(ctx, -CRATE_W / 2 - 4, -CRATE_H - 4, CRATE_W + 8, CRATE_H + 8, 12);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.hint > 0) {
      // expanding gold ring
      const p = (time * 1.3) % 1;
      r.resetLocal();
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, 40 + p * 40, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    r.resetLocal();
  }
}

// ---------------------------------------------------------------------------
// Forge
// ---------------------------------------------------------------------------

const FW = 124;
const FH = 200;
const WIN_Y = -118; // window centre relative to base (y up negative)
const LIGHT = { x: 44, y: -170 };

let gearSprite = null;
function getGearSprite() {
  if (gearSprite) return gearSprite;
  const S = 76;
  const { canvas, ctx } = makeCanvas(S * K, S * K);
  ctx.scale(K, K);
  ctx.translate(S / 2, S / 2);
  const teeth = 12;
  ctx.beginPath();
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * TAU;
    const rr = Math.floor(i / 2) % 2 === 0 ? 36 : 30;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.arc(0, 0, 24, 0, TAU, true);
  const g = ctx.createLinearGradient(-36, -36, 36, 36);
  g.addColorStop(0, '#c9d5f2');
  g.addColorStop(0.5, '#5d6b8f');
  g.addColorStop(1, '#2a3560');
  ctx.fillStyle = g;
  ctx.fill('evenodd');
  ctx.strokeStyle = '#121a36';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // bolt holes
  ctx.fillStyle = '#121a36';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 27, Math.sin(a) * 27, 1.8, 0, TAU);
    ctx.fill();
  }
  gearSprite = canvas;
  return canvas;
}

let smallGear = null;
function getSmallGear() {
  if (smallGear) return smallGear;
  const S = 30;
  const { canvas, ctx } = makeCanvas(S * K, S * K);
  ctx.scale(K, K);
  ctx.translate(S / 2, S / 2);
  ctx.beginPath();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU;
    const rr = Math.floor(i / 2) % 2 === 0 ? 14 : 10.5;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = COLORS.amber;
  ctx.fill();
  ctx.fillStyle = '#3a2606';
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, TAU);
  ctx.fill();
  smallGear = canvas;
  return canvas;
}

function renderForgeBody(mult) {
  const { canvas, ctx } = makeCanvas(FW * K, FH * K);
  ctx.scale(K, K);
  const cx = FW / 2;
  // Chimney
  const cg = ctx.createLinearGradient(14, 0, 36, 0);
  cg.addColorStop(0, '#2a3560');
  cg.addColorStop(0.5, '#8090b8');
  cg.addColorStop(1, '#1b2448');
  ctx.fillStyle = cg;
  ctx.fillRect(16, 2, 20, 40);
  ctx.fillStyle = '#3a4878';
  ctx.fillRect(12, 0, 28, 7);
  // Housing
  const hy = 22;
  const hh = 128;
  const hg = ctx.createLinearGradient(0, hy, 0, hy + hh);
  hg.addColorStop(0, '#46578c');
  hg.addColorStop(0.5, '#25305a');
  hg.addColorStop(1, '#151c3a');
  ctx.fillStyle = hg;
  roundRectPath(ctx, 4, hy, FW - 8, hh, 18);
  ctx.fill();
  ctx.strokeStyle = rgba(COLORS.magenta, 0.9);
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, hy + 4);
  ctx.lineTo(FW - 20, hy + 4);
  ctx.stroke();
  // Window bezel (centre at y = FH + WIN_Y)
  const wy = FH + WIN_Y;
  ctx.fillStyle = '#0a0f24';
  ctx.beginPath();
  ctx.arc(cx, wy, 27, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8090b8';
  ctx.lineWidth = 3;
  ctx.stroke();
  // Side ports
  ctx.fillStyle = '#1b2448';
  roundRectPath(ctx, -2, wy + 16, 14, 26, 4);
  ctx.fill();
  roundRectPath(ctx, FW - 12, wy + 16, 14, 26, 4);
  ctx.fill();
  ctx.fillStyle = rgba(COLORS.cyan, 0.6);
  ctx.fillRect(0, wy + 24, 4, 10);
  ctx.fillRect(FW - 4, wy + 24, 4, 10);
  // Rivets
  ctx.fillStyle = '#7f90b8';
  for (const [x, y] of [[14, hy + 12], [FW - 14, hy + 12], [14, hy + hh - 12], [FW - 14, hy + hh - 12]]) {
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, TAU);
    ctx.fill();
  }
  // Label plate
  const py = hy + hh + 4;
  const ph = FH - py - 2;
  const pg = ctx.createLinearGradient(0, py, 0, py + ph);
  pg.addColorStop(0, '#2b0f3a');
  pg.addColorStop(1, '#14061e');
  ctx.fillStyle = pg;
  roundRectPath(ctx, 10, py, FW - 20, ph, 10);
  ctx.fill();
  ctx.strokeStyle = COLORS.magenta;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `900 34px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = COLORS.magenta;
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffe6fd';
  const label = `×${mult}`;
  ctx.fillText(label, cx, py + ph / 2 + 2);
  ctx.shadowBlur = 0;
  ctx.fillText(label, cx, py + ph / 2 + 2);
  return canvas;
}

export const FORGE_STATUS = Object.freeze({ IDLE: 0, AMBER: 1, GREEN: 2, RED: 3, CYAN: 4 });
const STATUS_PAL = [PAL.blue, PAL.amber, PAL.green, PAL.red, PAL.cyan];

export class Forge {
  constructor(mult) {
    this.mult = mult;
    const s = forgeSlot(mult);
    this.cx = s.cx;
    this.cy = s.cy;
    this.hit = s.hit;
    this.baseY = s.cy + 104;
    this.sprite = renderForgeBody(mult);
    this.gear = getGearSprite();
    this.gear2 = getSmallGear();
    this.status = FORGE_STATUS.IDLE;
    this.running = false;
    this.gearAngle = Math.random() * TAU;
    this.gearSpeed = 0.2;
    this.sq = 0;
    this.sqv = 0;
    this.selected = false;
    this.hover = false;
    this.hint = 0;
    this.steamT = Math.random();
    this.sputter = 0; // seconds of sputter shake
    this.heat = 0; // window glow 0..1
  }

  get inPort() {
    return { x: this.cx - FW / 2 + 2, y: this.baseY + WIN_Y + 29 };
  }

  get outPort() {
    return { x: this.cx + FW / 2 - 2, y: this.baseY + WIN_Y + 29 };
  }

  get windowPos() {
    return { x: this.cx, y: this.baseY + WIN_Y };
  }

  /** Squash & stretch impulse: one manufacturing cycle. */
  cycle(power = 1) {
    this.sqv += 2.6 * power;
    this.heat = 1;
  }

  update(dt, particles, speedMul) {
    const k = 300;
    const d = 12;
    this.sqv += (-k * this.sq - d * this.sqv) * dt;
    this.sq += this.sqv * dt;
    const targetSpeed = this.running ? 5 * speedMul : this.status === FORGE_STATUS.AMBER ? 1.2 : 0.15;
    this.gearSpeed += (targetSpeed - this.gearSpeed) * Math.min(1, dt * 3);
    this.gearAngle += this.gearSpeed * dt;
    this.heat = Math.max(this.running ? 0.45 : 0, this.heat - dt * 1.5);
    if (this.hint > 0) this.hint = Math.max(0, this.hint - dt);
    if (this.sputter > 0) this.sputter = Math.max(0, this.sputter - dt);
    // Steam vent from the chimney.
    this.steamT -= dt * (this.running ? 4 * speedMul : 0.35);
    if (this.steamT <= 0 && particles) {
      this.steamT += 1;
      particles.steam(this.cx - FW / 2 + 26, this.baseY - FH + 2, 1, this.running ? 1.4 : 0.6);
    }
  }

  draw(ctx, r, time, sprites) {
    const st = this.status;
    // Selection / hover glow
    if (this.selected || this.hover || this.hint > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hover ? 0.75 : this.selected ? 0.6 + 0.2 * Math.sin(time * 8) : 0.4 + 0.4 * Math.sin(time * 7);
      r.resetLocal();
      ctx.drawImage(sprites.soft[this.hint > 0 && !this.hover ? PAL.gold : PAL.magenta], this.cx - 120, this.cy - 140, 240, 280);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    let jx = 0;
    if (this.sputter > 0) jx = Math.sin(time * 70) * 4 * Math.min(1, this.sputter * 2);
    const sy = 1 + this.sq * 0.12;
    const sx = 1 - this.sq * 0.08;
    r.localXY(this.cx + jx, this.baseY, sx, sy);
    ctx.drawImage(this.sprite, -FW / 2, -FH, FW, FH);
    if (this.hover || this.selected) {
      ctx.strokeStyle = COLORS.magenta;
      ctx.lineWidth = 3;
      roundRectPath(ctx, -FW / 2 - 5, -FH - 5, FW + 10, FH + 10, 20);
      ctx.stroke();
    } else if (this.hint > 0) {
      // Hinted target (tutorial / build order): pulsing gold outline, visible over the sprite.
      ctx.globalAlpha = 0.55 + 0.45 * Math.sin(time * 7);
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 4;
      roundRectPath(ctx, -FW / 2 - 5, -FH - 5, FW + 10, FH + 10, 20);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Window core glow (status colour)
    const wy = this.baseY + WIN_Y * sy;
    const wx = this.cx + jx;
    const pal = STATUS_PAL[st];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + this.heat * 0.65;
    r.resetLocal();
    const gs = 44 + this.heat * 26;
    ctx.drawImage(sprites.glow[st === FORGE_STATUS.IDLE ? PAL.purple : pal], wx - gs, wy - gs, gs * 2, gs * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // Big gear ring around window
    r.local(wx, wy, this.gearAngle, 1);
    ctx.drawImage(this.gear, -38, -38, 76, 76);
    // Small amber gear meshing on top-right
    r.local(wx + 40, wy - 34, -this.gearAngle * 2.4, 1);
    ctx.drawImage(this.gear2, -15, -15, 30, 30);
    // Status light
    const lx = this.cx + jx + LIGHT.x * sx;
    const ly = this.baseY + LIGHT.y * sy;
    r.resetLocal();
    ctx.fillStyle = '#0a0f24';
    ctx.beginPath();
    ctx.arc(lx, ly, 9, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    let blink = 1;
    if (st === FORGE_STATUS.AMBER) blink = 0.55 + 0.45 * Math.sin(time * 9);
    else if (st === FORGE_STATUS.RED) blink = Math.sin(time * 16) > 0 ? 1 : 0.25;
    else if (st === FORGE_STATUS.IDLE) blink = 0.3;
    ctx.globalAlpha = blink;
    ctx.drawImage(sprites.glow[pal], lx - 20, ly - 20, 40, 40);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
