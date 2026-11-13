// Glowing geometric cargo parts. Each part type is pre-rendered once (with glow)
// into a sprite; per frame we only rotate + drawImage.

import { COLORS } from '../core/theme.js';
import { makeCanvas, TAU } from './util.js';

export const PART_TYPES = [
  { id: 'plasma', name: 'Plasma Cores', color: COLORS.magenta, shape: 'cube' },
  { id: 'battery', name: 'Laser Batteries', color: COLORS.green, shape: 'battery' },
  { id: 'qgear', name: 'Quantum Gears', color: COLORS.cyan, shape: 'gear' },
  { id: 'chrono', name: 'Chrono-Gears', color: COLORS.gold, shape: 'chrono' },
  { id: 'fusion', name: 'Fusion Orbs', color: '#ff7a1a', shape: 'orb' },
  { id: 'chip', name: 'Nano Chips', color: COLORS.purple, shape: 'chip' },
  { id: 'prism', name: 'Photon Prisms', color: '#7dffef', shape: 'prism' },
];

const SIZE = 56; // logical sprite size
const K = 2; // sprite pixel density

function gearPath(ctx, r, teeth, depth) {
  ctx.beginPath();
  const n = teeth * 2;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * TAU;
    const tooth = Math.floor(i / 2) % 2 === 0;
    const rr = tooth ? r : r - depth;
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawPart(ctx, shape, color) {
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  const fillDark = 'rgba(10,14,36,0.9)';
  switch (shape) {
    case 'cube': {
      // isometric cube
      const s = 15;
      ctx.fillStyle = fillDark;
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.15);
      ctx.lineTo(s, -s * 0.55);
      ctx.lineTo(s, s * 0.65);
      ctx.lineTo(0, s * 1.2);
      ctx.lineTo(-s, s * 0.65);
      ctx.lineTo(-s, -s * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s, -s * 0.55);
      ctx.lineTo(0, 0);
      ctx.lineTo(s, -s * 0.55);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, s * 1.2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.15);
      ctx.lineTo(s, -s * 0.55);
      ctx.lineTo(0, 0);
      ctx.lineTo(-s, -s * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'battery': {
      ctx.fillStyle = fillDark;
      ctx.beginPath();
      ctx.rect(-10, -16, 20, 32);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-5, -21, 10, 5);
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = 0.45 + i * 0.25;
        ctx.fillRect(-6, 8 - i * 9, 12, 6);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'gear':
    case 'chrono': {
      ctx.fillStyle = fillDark;
      gearPath(ctx, 19, 8, 5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.stroke();
      if (shape === 'chrono') {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -10);
        ctx.moveTo(0, 0);
        ctx.lineTo(7, 3);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(12, -12, 3.5, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case 'orb': {
      const g = ctx.createRadialGradient(-4, -5, 2, 0, 0, 15);
      g.addColorStop(0, '#fff3d0');
      g.addColorStop(0.4, color);
      g.addColorStop(1, 'rgba(60,20,0,0.9)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 7, -0.4, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'chip': {
      ctx.fillStyle = fillDark;
      ctx.beginPath();
      ctx.rect(-13, -13, 26, 26);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.moveTo(i * 8, -13);
        ctx.lineTo(i * 8, -19);
        ctx.moveTo(i * 8, 13);
        ctx.lineTo(i * 8, 19);
        ctx.moveTo(-13, i * 8);
        ctx.lineTo(-19, i * 8);
        ctx.moveTo(13, i * 8);
        ctx.lineTo(19, i * 8);
      }
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillRect(-5, -5, 10, 10);
      break;
    }
    case 'prism':
    default: {
      ctx.fillStyle = fillDark;
      ctx.beginPath();
      ctx.moveTo(0, -19);
      ctx.lineTo(17, 13);
      ctx.lineTo(-17, 13);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, -19);
      ctx.lineTo(4, 13);
      ctx.lineTo(-17, 13);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  // second pass without shadow for a crisp line
  ctx.shadowBlur = 0;
}

export class ItemSprites {
  constructor() {
    this.size = SIZE;
    this.parts = PART_TYPES.map((p) => {
      const { canvas, ctx } = makeCanvas(SIZE * K, SIZE * K);
      ctx.scale(K, K);
      ctx.translate(SIZE / 2, SIZE / 2);
      drawPart(ctx, p.shape, p.color);
      return canvas;
    });
    // Raw ore pebble (dispenser → forge) in neutral steel with cyan rim.
    const { canvas, ctx } = makeCanvas(32 * K, 32 * K);
    ctx.scale(K, K);
    ctx.translate(16, 16);
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#3a4a7a';
    ctx.strokeStyle = COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-9, -6);
    ctx.lineTo(2, -10);
    ctx.lineTo(10, -2);
    ctx.lineTo(7, 9);
    ctx.lineTo(-6, 9);
    ctx.lineTo(-10, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    this.ore = canvas;
  }

  /** Draw part `typeIndex` at (x,y) with rotation; uses renderer local transform. */
  drawPart(ctx, r, typeIndex, x, y, rot, scale = 1) {
    r.local(x, y, rot, scale);
    ctx.drawImage(this.parts[typeIndex], -SIZE / 2, -SIZE / 2, SIZE, SIZE);
  }

  drawOre(ctx, r, x, y, rot, scale = 1) {
    r.local(x, y, rot, scale);
    ctx.drawImage(this.ore, -16, -16, 32, 32);
  }
}
