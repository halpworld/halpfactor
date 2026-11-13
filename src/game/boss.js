// Procedural Boss Robots. Seeded variety: body/head shapes, colours, antennae,
// eye styles, arms, locomotion. Static shells are pre-rendered per boss;
// eyes, mouth, cargo hatch, antenna, arms and wheels animate per frame.

import { COLORS, FONT } from '../core/theme.js';
import { makeCanvas, roundRectPath, mulberry32, TAU, clamp, easeOutBack, easeInCubic, hsl } from '../render/util.js';
import { PAL } from '../render/sprites.js';
import { PART_TYPES } from '../render/items.js';
import { DOCK } from './layout.js';

export const BOSS_NAMES = [
  'Captain Sprocket', 'Duchess Diode', 'Gearzilla', 'Professor Piston', 'Torque-Bot 3000',
  'Baroness Bolt', 'Sir Circuit', 'Doctor Dynamo', 'Major Megawatt', 'Rusty McRivet',
  'Commander Coil', 'Lady Lumen', 'Turbo Tess', 'Queen Quasar', 'Sergeant Servo',
  'Count Kilowatt', 'Widget Wilma', 'Admiral Amp', 'Boris Blinkenlight', 'Penny Pulley',
];

const HUES = [188, 300, 28, 135, 265, 48, 350, 212, 160, 320];
const K = 2;

// Local geometry (origin at boss base centre, y up negative)
const TORSO = { x: -100, y: -265, w: 200, h: 200 };
const HEAD = { x: -78, y: -385, w: 156, h: 112 };
const HATCH = { x: -48, y: -205, w: 96, h: 76 }; // centre y = -167 (≈ world 738)
const HEAD_CY = HEAD.y + HEAD.h / 2;
const EYES_ONE = [[0, 30]];
const EYES_TWO = [[-34, 20], [34, 20]];
const EYES_THREE = [[-38, 14], [0, 14], [38, 14]];
const TREAD_WHEELS = [-74, 0, 74];
const JETS = [-55, 55];

function bodyGradient(ctx, y0, y1, h) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, hsl(h, 38, 52));
  g.addColorStop(0.45, hsl(h, 34, 32));
  g.addColorStop(1, hsl(h, 40, 16));
  return g;
}

function shapePath(ctx, kind, x, y, w, h) {
  ctx.beginPath();
  if (kind === 0) {
    roundRectPath(ctx, x, y, w, h, 18);
  } else if (kind === 1) {
    roundRectPath(ctx, x, y, w, h, Math.min(w, h) * 0.42);
  } else if (kind === 2) {
    // trapezoid (wider at top)
    ctx.moveTo(x, y + 10);
    ctx.quadraticCurveTo(x, y, x + 10, y);
    ctx.lineTo(x + w - 10, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + 10);
    ctx.lineTo(x + w - 24, y + h - 8);
    ctx.quadraticCurveTo(x + w - 26, y + h, x + w - 34, y + h);
    ctx.lineTo(x + 34, y + h);
    ctx.quadraticCurveTo(x + 26, y + h, x + 24, y + h - 8);
    ctx.closePath();
  } else {
    // hexagon-ish
    const c = 34;
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + h * 0.3);
    ctx.lineTo(x + w, y + h * 0.7);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h * 0.7);
    ctx.lineTo(x, y + h * 0.3);
    ctx.closePath();
  }
}

function renderTorso(look) {
  const pad = 10;
  const { canvas, ctx } = makeCanvas((TORSO.w + pad * 2) * K, (TORSO.h + pad * 2) * K);
  ctx.scale(K, K);
  ctx.translate(pad - TORSO.x, pad - TORSO.y);
  const h = look.hue;
  shapePath(ctx, look.body, TORSO.x, TORSO.y, TORSO.w, TORSO.h);
  ctx.fillStyle = bodyGradient(ctx, TORSO.y, TORSO.y + TORSO.h, h);
  ctx.fill();
  ctx.strokeStyle = look.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  // panel seams
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(TORSO.x, TORSO.y + 34);
  ctx.lineTo(TORSO.x + TORSO.w, TORSO.y + 34);
  ctx.moveTo(TORSO.x, TORSO.y + TORSO.h - 34);
  ctx.lineTo(TORSO.x + TORSO.w, TORSO.y + TORSO.h - 34);
  ctx.stroke();
  // sheen
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.ellipse(TORSO.x + 50, TORSO.y + 40, 60, 24, -0.4, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Hatch frame
  ctx.fillStyle = '#05070f';
  roundRectPath(ctx, HATCH.x - 6, HATCH.y - 6, HATCH.w + 12, HATCH.h + 12, 12);
  ctx.fill();
  ctx.strokeStyle = COLORS.steelLight;
  ctx.lineWidth = 2;
  ctx.stroke();
  // hazard chevrons above hatch
  ctx.fillStyle = COLORS.amber;
  for (let i = 0; i < 5; i++) {
    const x = HATCH.x + 6 + i * 18;
    ctx.beginPath();
    ctx.moveTo(x, HATCH.y - 18);
    ctx.lineTo(x + 8, HATCH.y - 12);
    ctx.lineTo(x, HATCH.y - 6);
    ctx.lineTo(x + 4, HATCH.y - 12);
    ctx.closePath();
    ctx.fill();
  }
  // rivets
  ctx.fillStyle = hsl(h, 20, 70);
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(TORSO.x + 24 + i * 30, TORSO.y + TORSO.h - 18, 3, 0, TAU);
    ctx.fill();
  }
  // emblem
  ctx.fillStyle = look.accent;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(TORSO.x + TORSO.w - 30, TORSO.y + 20, 8, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  return { canvas, x: TORSO.x - pad, y: TORSO.y - pad, w: TORSO.w + pad * 2, h: TORSO.h + pad * 2 };
}

function renderHead(look) {
  const pad = 10;
  const { canvas, ctx } = makeCanvas((HEAD.w + pad * 2) * K, (HEAD.h + pad * 2) * K);
  ctx.scale(K, K);
  ctx.translate(pad - HEAD.x, pad - HEAD.y);
  const h = look.hue;
  const kind = look.head;
  ctx.beginPath();
  if (kind === 0) {
    // dome
    ctx.moveTo(HEAD.x, HEAD.y + HEAD.h);
    ctx.lineTo(HEAD.x, HEAD.y + HEAD.h * 0.55);
    ctx.bezierCurveTo(HEAD.x, HEAD.y - 10, HEAD.x + HEAD.w, HEAD.y - 10, HEAD.x + HEAD.w, HEAD.y + HEAD.h * 0.55);
    ctx.lineTo(HEAD.x + HEAD.w, HEAD.y + HEAD.h);
    ctx.closePath();
  } else if (kind === 1) {
    roundRectPath(ctx, HEAD.x, HEAD.y, HEAD.w, HEAD.h, 16);
  } else if (kind === 2) {
    roundRectPath(ctx, HEAD.x - 6, HEAD.y + 14, HEAD.w + 12, HEAD.h - 14, 40);
  } else {
    // TV head with rounded screen bulge
    roundRectPath(ctx, HEAD.x + 4, HEAD.y + 4, HEAD.w - 8, HEAD.h - 4, 26);
  }
  ctx.fillStyle = bodyGradient(ctx, HEAD.y, HEAD.y + HEAD.h, (h + 12) % 360);
  ctx.fill();
  ctx.strokeStyle = look.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  // face plate
  ctx.fillStyle = 'rgba(3,5,14,0.85)';
  roundRectPath(ctx, HEAD.x + 18, HEAD.y + 30, HEAD.w - 36, HEAD.h - 42, 18);
  ctx.fill();
  // ear bolts
  ctx.fillStyle = hsl(h, 25, 60);
  ctx.beginPath();
  ctx.arc(HEAD.x + 4, HEAD_CY + 6, 9, 0, TAU);
  ctx.arc(HEAD.x + HEAD.w - 4, HEAD_CY + 6, 9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.arc(HEAD.x + 4, HEAD_CY + 6, 4, 0, TAU);
  ctx.arc(HEAD.x + HEAD.w - 4, HEAD_CY + 6, 4, 0, TAU);
  ctx.fill();
  return { canvas, x: HEAD.x - pad, y: HEAD.y - pad, w: HEAD.w + pad * 2, h: HEAD.h + pad * 2 };
}

function wrapBubbleText(target, part) {
  return { line1: 'NEED', num: String(target), line2: part.name };
}

function renderBubble(target, partIndex, itemSprites, practice, name) {
  const part = PART_TYPES[partIndex];
  const W = 330;
  const H = 168;
  const { canvas, ctx } = makeCanvas(W * K, (H + 26) * K);
  ctx.scale(K, K);
  // Bubble body
  ctx.fillStyle = 'rgba(8,14,36,0.94)';
  roundRectPath(ctx, 4, 4, W - 8, H - 8, 22);
  ctx.fill();
  ctx.strokeStyle = practice ? COLORS.gold : COLORS.cyan;
  ctx.lineWidth = 4;
  ctx.stroke();
  // Tail
  ctx.beginPath();
  ctx.moveTo(W / 2 - 18, H - 6);
  ctx.lineTo(W / 2, H + 22);
  ctx.lineTo(W / 2 + 18, H - 6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(8,14,36,0.94)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W / 2 - 18, H - 4);
  ctx.lineTo(W / 2, H + 22);
  ctx.lineTo(W / 2 + 18, H - 4);
  ctx.stroke();
  const t = wrapBubbleText(target, part);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `700 17px ${FONT.display}`;
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(name.toUpperCase(), W / 2, 24);
  // NEED + big number + icon
  ctx.font = `900 82px ${FONT.display}`;
  const numW = ctx.measureText(t.num).width;
  const groupW = 62 + 10 + numW + 12 + 56;
  let x = W / 2 - groupW / 2;
  ctx.textAlign = 'left';
  ctx.font = `800 22px ${FONT.display}`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(t.line1, x, 84);
  x += 72;
  ctx.font = `900 82px ${FONT.display}`;
  ctx.shadowColor = practice ? COLORS.gold : COLORS.cyan;
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(t.num, x, 86);
  ctx.shadowBlur = 0;
  ctx.fillText(t.num, x, 86);
  x += numW + 12;
  ctx.drawImage(itemSprites.parts[partIndex], x, 86 - 28, 56, 56);
  ctx.textAlign = 'center';
  ctx.font = `800 24px ${FONT.display}`;
  ctx.fillStyle = part.color;
  ctx.fillText(t.line2, W / 2, 140);
  return { canvas, w: W, h: H + 26 };
}

function renderPracticeTag(bonus) {
  const W = 236;
  const H = 40;
  const { canvas, ctx } = makeCanvas(W * K, H * K);
  ctx.scale(K, K);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffe680');
  g.addColorStop(1, COLORS.goldDeep);
  ctx.fillStyle = g;
  roundRectPath(ctx, 2, 2, W - 4, H - 4, 18);
  ctx.fill();
  ctx.strokeStyle = '#fff6c8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = `900 20px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#3a2400';
  ctx.fillText(`BOSS ORDER ★ +${bonus}`, W / 2, H / 2 + 1);
  return { canvas, w: W, h: H };
}

export class Boss {
  /**
   * @param {object} o { seed, target, partIndex, practice, bonus, sprites, items, name? }
   */
  constructor(o) {
    const rng = mulberry32(o.seed * 7919 + 13);
    this.seed = o.seed;
    this.name = o.name || BOSS_NAMES[o.seed % BOSS_NAMES.length];
    this.target = o.target;
    this.partIndex = o.partIndex;
    this.practice = !!o.practice;
    this.sprites = o.sprites;
    const hue = HUES[(rng() * HUES.length) | 0];
    this.look = {
      hue,
      accent: hsl((hue + 150 + rng() * 60) % 360, 100, 62),
      eye: hsl((hue + 180) % 360, 100, 66),
      body: (rng() * 4) | 0,
      head: (rng() * 4) | 0,
      eyes: (rng() * 5) | 0,
      antenna: (rng() * 5) | 0,
      loco: (rng() * 3) | 0,
      arms: (rng() * 2) | 0,
      scale: 0.92 + rng() * 0.14,
    };
    this.eyePal = [PAL.cyan, PAL.magenta, PAL.green, PAL.gold, PAL.purple][(rng() * 5) | 0];
    this.torso = renderTorso(this.look);
    this.head = renderHead(this.look);
    this.bubble = renderBubble(o.target, o.partIndex, o.items, this.practice, this.name);
    this.tag = this.practice ? renderPracticeTag(o.bonus || 5) : null;

    this.x = DOCK.x1 + 260;
    this.baseY = DOCK.bossBaseY;
    this.state = 'enter';
    this.t = 0;
    this.roll = 0; // wheel rotation
    this.lastX = this.x;
    this.eyeGlow = 0; // spikes on delivery
    this.mouth = 0; // 0..1
    this.mouthTarget = 0;
    this.hatch = 0;
    this.hatchTarget = 0;
    this.happy = 0; // seconds of happy face
    this.turbo = false;
    this.received = 0; // fraction 0..1 of the order delivered
    this.wiggle = 0;
    this.blinkT = 2 + rng() * 2;
    this.blink = 0;
    this.antV = 0;
    this.ant = 0;
    this.bubbleT = 0;
    this.hidden = false;
  }

  get hatchPos() {
    return { x: this.x, y: this.baseY + (HATCH.y + HATCH.h / 2) * this.look.scale };
  }

  get rect() {
    const s = this.look.scale;
    return { x: this.x - 130 * s, y: this.baseY - 420 * s, w: 260 * s, h: 420 * s };
  }

  get bubbleRect() {
    return { x: DOCK.bossX - this.bubble.w / 2, y: 178, w: this.bubble.w, h: this.bubble.h };
  }

  get arrived() {
    return this.state === 'idle';
  }

  leave() {
    if (this.state === 'leave' || this.state === 'gone') return;
    this.state = 'leave';
    this.t = 0;
    this.startX = this.x;
  }

  receive(fraction) {
    this.received = clamp(fraction, 0, 1);
    this.eyeGlow = 1;
    this.hatch = Math.max(this.hatch, 0.6);
    this.mouth = Math.max(this.mouth, 0.7);
    this.antV += 6;
  }

  poke() {
    this.wiggle = 0.6;
    this.antV += 10;
    this.eyeGlow = 0.8;
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'enter') {
      const p = clamp(this.t / 1.3, 0, 1);
      this.x = DOCK.x1 + 260 + (DOCK.bossX - (DOCK.x1 + 260)) * easeOutBack(p);
      if (p >= 1) {
        this.state = 'idle';
        this.t = 0;
      }
    } else if (this.state === 'leave') {
      const hop = 0.45;
      if (this.t < hop) {
        this.x = this.startX;
      } else {
        const p = clamp((this.t - hop) / 1.0, 0, 1);
        this.x = this.startX + (DOCK.x1 + 300 - this.startX) * easeInCubic(p);
        if (p >= 1) this.state = 'gone';
      }
    }
    this.roll += (this.x - this.lastX) / 22;
    this.lastX = this.x;
    this.eyeGlow = Math.max(0, this.eyeGlow - dt * 2.2);
    this.mouth += ((this.mouthTarget || 0) - this.mouth) * Math.min(1, dt * 6);
    this.hatch += ((this.hatchTarget || 0) - this.hatch) * Math.min(1, dt * 5);
    this.happy = Math.max(0, this.happy - dt);
    this.wiggle = Math.max(0, this.wiggle - dt);
    // antenna spring
    this.antV += (-90 * this.ant - 5 * this.antV) * dt;
    this.ant += this.antV * dt;
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 0.14;
      this.blinkT = 2.5 + Math.random() * 3;
    }
    this.blink = Math.max(0, this.blink - dt);
    const showBubble = this.state === 'idle';
    this.bubbleT = clamp(this.bubbleT + (showBubble ? dt * 3.5 : -dt * 5), 0, 1);
  }

  draw(ctx, r, time) {
    if (this.state === 'gone' || this.hidden) return;
    const s = this.look.scale;
    const S = this.sprites;
    let bob = Math.sin(time * 2.2 + this.seed) * 4;
    let jx = 0;
    if (this.turbo) {
      jx = Math.sin(time * 55) * 3;
      bob += Math.sin(time * 31) * 2;
    }
    if (this.state === 'leave' && this.t < 0.45) bob -= Math.sin((this.t / 0.45) * Math.PI) * 40; // happy hop
    if (this.wiggle > 0) jx += Math.sin(time * 40) * 6 * this.wiggle;
    const x = this.x + jx;
    const by = this.baseY;
    const lean = this.state === 'enter' ? -0.06 * (1 - clamp(this.t / 1.3, 0, 1)) : this.state === 'leave' && this.t > 0.45 ? 0.06 : 0;

    // Ground shadow
    r.resetLocal();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, by + 2, 120 * s, 14, 0, 0, TAU);
    ctx.fill();

    // ---- Locomotion (not bobbing)
    r.local(x, by, 0, s);
    this._drawLoco(ctx, time);

    // ---- Upper body (bobbing, leaning)
    r.local(x, by + bob * 0.5, lean, s);
    this._drawArms(ctx, time, -1);
    this._drawArms(ctx, time, 1);
    ctx.drawImage(this.torso.canvas, this.torso.x, this.torso.y, this.torso.w, this.torso.h);
    this._drawHatch(ctx, time);
    // neck
    ctx.fillStyle = '#1b2448';
    ctx.fillRect(-22, -278, 44, 16);
    ctx.fillStyle = 'rgba(169,182,214,0.4)';
    ctx.fillRect(-22, -274, 44, 3);
    ctx.fillRect(-22, -268, 44, 3);
    // head (extra bob)
    r.local(x + Math.sin(time * 2.2 + this.seed) * 1.5, by + bob, lean + Math.sin(time * 1.3 + this.seed) * 0.02, s);
    this._drawAntenna(ctx, time);
    ctx.drawImage(this.head.canvas, this.head.x, this.head.y, this.head.w, this.head.h);
    this._drawEyes(ctx, r, time);
    this._drawMouth(ctx, time);
    r.resetLocal();
  }

  drawOverlay(ctx, r, time) {
    // Speech bubble + tags (drawn above everything else in the world)
    if (this.bubbleT <= 0) return;
    const b = this.bubble;
    const sc = easeOutBack(this.bubbleT);
    const cx = DOCK.bossX;
    const cy = 178 + b.h / 2;
    const float = Math.sin(time * 1.8) * 3;
    r.local(cx, cy + float + b.h / 2, 0, sc);
    ctx.drawImage(b.canvas, -b.w / 2, -b.h, b.w, b.h);
    if (this.tag) {
      const tw = this.tag.w;
      const pulse = 1 + Math.sin(time * 5) * 0.04;
      r.local(cx, 150 + float, Math.sin(time * 2) * 0.03, sc * pulse);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.sprites.soft[PAL.gold], -tw * 0.7, -40, tw * 1.4, 80);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(this.tag.canvas, -tw / 2, -this.tag.h / 2, tw, this.tag.h);
    }
    // Progress meter under the bubble
    if (this.received > 0) {
      r.local(cx, 178 + b.h + 10 + float, 0, sc);
      const w = 220;
      ctx.fillStyle = 'rgba(3,5,14,0.85)';
      roundRectPath(ctx, -w / 2 - 3, -9, w + 6, 18, 9);
      ctx.fill();
      ctx.fillStyle = COLORS.green;
      roundRectPath(ctx, -w / 2, -6, Math.max(12, w * this.received), 12, 6);
      ctx.fill();
    }
    r.resetLocal();
  }

  _drawLoco(ctx, time) {
    const kind = this.look.loco;
    if (kind === 0) {
      // Treads
      ctx.fillStyle = '#141a33';
      roundRectPath(ctx, -110, -62, 220, 60, 28);
      ctx.fill();
      ctx.strokeStyle = '#5d6b8f';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.save();
      roundRectPath(ctx, -106, -58, 212, 52, 24);
      ctx.clip();
      ctx.strokeStyle = 'rgba(169,182,214,0.55)';
      ctx.lineWidth = 4;
      const off = ((this.roll * 22) % 18 + 18) % 18;
      ctx.beginPath();
      for (let x = -130 - off; x < 130; x += 18) {
        ctx.moveTo(x, -58);
        ctx.lineTo(x + 6, -6);
      }
      ctx.stroke();
      ctx.restore();
      for (const wx of TREAD_WHEELS) {
        ctx.fillStyle = '#2a3560';
        ctx.beginPath();
        ctx.arc(wx, -32, 18, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#a9b6d6';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const a = this.roll;
        ctx.moveTo(wx + Math.cos(a) * 14, -32 + Math.sin(a) * 14);
        ctx.lineTo(wx - Math.cos(a) * 14, -32 - Math.sin(a) * 14);
        ctx.stroke();
      }
    } else if (kind === 1) {
      // Big unicycle wheel
      ctx.fillStyle = '#141a33';
      ctx.beginPath();
      ctx.arc(0, -40, 40, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = this.look.accent;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.strokeStyle = '#a9b6d6';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = this.roll + (i * TAU) / 3;
        ctx.moveTo(0, -40);
        ctx.lineTo(Math.cos(a) * 34, -40 + Math.sin(a) * 34);
      }
      ctx.stroke();
      ctx.fillStyle = '#5d6b8f';
      ctx.fillRect(-14, -72, 28, 12);
    } else {
      // Hover jets
      ctx.fillStyle = '#1b2448';
      roundRectPath(ctx, -90, -66, 180, 30, 14);
      ctx.fill();
      ctx.strokeStyle = '#5d6b8f';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const fl = 0.7 + Math.sin(time * 40) * 0.15 + Math.sin(time * 23) * 0.15;
      for (const jx of JETS) {
        ctx.globalAlpha = fl;
        ctx.drawImage(this.sprites.glow[this.turbo ? PAL.orange : PAL.cyan], jx - 22, -44, 44, 70 * fl);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  _drawArms(ctx, time, side) {
    const sx = side * 100;
    const sy = -232;
    const swing = Math.sin(time * 2.2 + this.seed + (side > 0 ? 0 : 1.2)) * 0.12 + (this.happy > 0 ? -0.9 * side * Math.abs(Math.sin(time * 10)) : 0);
    const a1 = side * (0.35 + swing * side) + (this.turbo ? Math.sin(time * 30) * 0.2 : 0);
    const ex = sx + Math.sin(a1) * 70 * side * side;
    const ey = sy + Math.cos(a1) * 70;
    const hx = ex + side * 10;
    const hy = ey + 52;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2a3560';
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = hsl(this.look.hue, 30, 48);
    ctx.lineWidth = 12;
    ctx.stroke();
    if (this.look.arms === 1) {
      // piston rings
      ctx.strokeStyle = '#a9b6d6';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(ex - 8, ey + 18);
      ctx.lineTo(ex + 8, ey + 18);
      ctx.moveTo(ex - 8, ey + 28);
      ctx.lineTo(ex + 8, ey + 28);
      ctx.stroke();
    }
    // shoulder
    ctx.fillStyle = hsl(this.look.hue, 30, 38);
    ctx.beginPath();
    ctx.arc(sx, sy, 16, 0, TAU);
    ctx.fill();
    // claw
    ctx.strokeStyle = this.look.accent;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(hx, hy + 6, 12, Math.PI * 1.15, Math.PI * 1.85, true);
    ctx.stroke();
  }

  _drawHatch(ctx, time) {
    const h = HATCH;
    // Interior glow
    ctx.fillStyle = '#05070f';
    ctx.fillRect(h.x, h.y, h.w, h.h);
    const open = clamp(this.hatch, 0, 1);
    if (open > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = open;
      ctx.drawImage(this.sprites.glow[this.eyePal], -60, h.y + h.h / 2 - 50, 120, 100);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Door slides up
    const doorH = h.h * (1 - open * 0.92);
    const g = ctx.createLinearGradient(0, h.y, 0, h.y + h.h);
    g.addColorStop(0, '#46578c');
    g.addColorStop(1, '#1b2448');
    ctx.fillStyle = g;
    ctx.fillRect(h.x, h.y, h.w, doorH);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = h.y + 12; y < h.y + doorH - 2; y += 12) {
      ctx.moveTo(h.x + 6, y);
      ctx.lineTo(h.x + h.w - 6, y);
    }
    ctx.stroke();
  }

  _drawAntenna(ctx, time) {
    const kind = this.look.antenna;
    const top = HEAD.y + (this.look.head === 2 ? 14 : 0);
    const w = this.ant * 0.25 + Math.sin(time * 3 + this.seed) * 0.06;
    ctx.strokeStyle = '#a9b6d6';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const blink = (Math.sin(time * 5 + this.seed) > 0.3 ? 1 : 0.35) + this.eyeGlow;
    const tips = [];
    if (kind === 0 || kind === 4) {
      const len = kind === 0 ? 56 : 36;
      tips.push([Math.sin(w) * len, top - Math.cos(w) * len]);
    } else if (kind === 1) {
      tips.push([-36 + Math.sin(w - 0.3) * 46, top - Math.cos(w - 0.3) * 46]);
      tips.push([36 + Math.sin(w + 0.3) * 46, top - Math.cos(w + 0.3) * 46]);
    } else if (kind === 2) {
      // coil spring
      ctx.beginPath();
      ctx.moveTo(0, top);
      for (let i = 1; i <= 10; i++) {
        const yy = top - i * 6;
        ctx.lineTo((i % 2 ? 9 : -9) + Math.sin(w) * i * 5, yy);
      }
      ctx.stroke();
      tips.push([Math.sin(w) * 52, top - 64]);
    } else if (kind === 3) {
      // dish
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(Math.sin(w) * 30, top - 30);
      ctx.stroke();
      ctx.save();
      ctx.translate(Math.sin(w) * 30, top - 34);
      ctx.rotate(-0.5 + w + Math.sin(time * 1.5) * 0.4);
      ctx.fillStyle = '#5d6b8f';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 12, 0, Math.PI, TAU);
      ctx.fill();
      ctx.restore();
      tips.push([Math.sin(w) * 30, top - 52]);
    }
    if (kind !== 2 && kind !== 3) {
      ctx.beginPath();
      for (const [tx, ty] of tips) {
        ctx.moveTo(tx < 0 && kind === 1 ? -36 : tx > 0 && kind === 1 ? 36 : 0, top);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    }
    for (const [tx, ty] of tips) {
      ctx.fillStyle = this.look.accent;
      ctx.beginPath();
      ctx.arc(tx, ty, kind === 4 ? 11 : 7, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(blink, 0, 1);
      ctx.drawImage(this.sprites.glow[this.eyePal], tx - 22, ty - 22, 44, 44);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  _drawEyes(ctx, r, time) {
    const style = this.look.eyes;
    const ey = HEAD_CY - 2;
    const glow = 0.55 + this.eyeGlow * 0.45 + (this.turbo ? 0.3 : 0);
    const happy = this.happy > 0;
    const blinkS = this.blink > 0 ? 0.12 : 1;
    let pal = this.eyePal;
    if (this.turbo) pal = Math.sin(time * 14) > 0 ? PAL.red : PAL.cyan;
    const col = this.turbo ? (pal === PAL.red ? COLORS.red : COLORS.cyan) : this.look.eye;
    const eyes = style === 2 ? EYES_ONE : style === 3 ? EYES_THREE : EYES_TWO;
    // glow underlay
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = glow;
    if (style === 1) {
      ctx.drawImage(this.sprites.glow[pal], -80, ey - 34, 160, 68);
    } else {
      for (const [ex, rr] of eyes) ctx.drawImage(this.sprites.glow[pal], ex - rr * 2.2, ey - rr * 2.2, rr * 4.4, rr * 4.4);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    if (happy) {
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [ex, rr] of eyes) {
        const rw = style === 1 ? 20 : Math.min(rr, 18);
        ctx.moveTo(ex - rw, ey + 6);
        ctx.quadraticCurveTo(ex, ey - rw - 6, ex + rw, ey + 6);
      }
      ctx.stroke();
      return;
    }
    if (style === 1) {
      // Visor bar with scanner dot
      roundRectPath(ctx, -56, ey - 11 * blinkS, 112, 22 * blinkS, 11);
      ctx.fill();
      const dx = Math.sin(time * 2.4) * 44;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(dx, ey, 7 * blinkS, 0, TAU);
      ctx.fill();
      return;
    }
    for (const [ex, rr] of eyes) {
      const rad = rr * (0.55 + this.eyeGlow * 0.15);
      if (style === 4) {
        roundRectPath(ctx, ex - rad, ey - rad * blinkS, rad * 2, rad * 2 * blinkS, 5);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(ex, ey, rad, rad * blinkS, 0, 0, TAU);
        ctx.fill();
      }
      // pupil highlight
      if (blinkS === 1) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex - rad * 0.3, ey - rad * 0.3, rad * 0.28, 0, TAU);
        ctx.fill();
        ctx.fillStyle = col;
      }
    }
  }

  _drawMouth(ctx, time) {
    const my = HEAD.y + HEAD.h - 24;
    const open = clamp(this.mouth, 0, 1);
    if (this.happy > 0 && open < 0.3) {
      ctx.strokeStyle = this.look.eye;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, my - 14, 22, 0.25 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
      return;
    }
    const w = 54;
    const h = 8 + open * 20;
    ctx.fillStyle = '#02030a';
    roundRectPath(ctx, -w / 2, my - h / 2, w, h, 5);
    ctx.fill();
    if (open > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = open * 0.8;
      ctx.drawImage(this.sprites.glow[this.eyePal], -32, my - 20, 64, 40);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // grille teeth
    ctx.strokeStyle = 'rgba(169,182,214,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -w / 2 + 9; x < w / 2; x += 9) {
      ctx.moveTo(x, my - h / 2);
      ctx.lineTo(x, my - h / 2 + 4);
      ctx.moveTo(x, my + h / 2);
      ctx.lineTo(x, my + h / 2 - 4);
    }
    ctx.stroke();
  }
}
