// Build items (shop "Build" tab) drawn into the factory scene. Every purchase must visibly change
// the factory, so each item is big and bright, but it only uses free space that has no hit area:
//   - the floor strip under the machines (y >= 922; crates/forges end at y 920),
//   - the overhead pipe row (y 84..128),
//   - the gap between the crates and the forges (x 252..318) and between the forges and the
//     dock (x 942..988),
//   - the dock's left edge (x 990..1052) and the dock floor below the boss.
// Drawn right after the backdrop, under machines, belts, cargo, the boss and its bubble, so it can
// never cover anything interactive. Purely visual: no hit areas.

import { FONT } from '../core/theme.js';
import { roundRectPath, easeOutBack } from './util.js';
import { PAL } from './sprites.js';
import { FLOOR, DOCK } from '../game/layout.js';

const BASE = FLOOR.y1 + 8; // feet of floor items (world y 1018)
const TOP = 922; // nothing on the floor strip may rise above this (machines end at 920)
const LIGHT_COLS = [PAL.red, PAL.gold, PAL.green, PAL.cyan, PAL.magenta];
const LIGHT_HEX = ['#ff3b6b', '#ffd34d', '#39ff88', '#22f0ff', '#ff4fd8'];

/** Where each build "lands" — used for the build-in animation, sparkles and the NEW floater. */
export const BUILD_ANCHORS = Object.freeze({
  sign: { x: 1178, y: 108 },
  lights: { x: 500, y: 110 },
  arm: { x: 286, y: 900 },
  steam: { x: 966, y: 330 },
  belt2: { x: 640, y: 1000 },
  lift: { x: 286, y: 420 },
  reactor: { x: 1020, y: 880 },
  trophies: { x: 1185, y: 985 },
  rocket: { x: 966, y: 760 },
  statue: { x: 136, y: 970 },
});

function add(ctx, img, x, y, w, h, a) {
  ctx.globalAlpha = a;
  ctx.drawImage(img, x, y, w, h);
}

function sign(ctx, S, t) {
  // big neon marquee on top of the loading dock
  const x = 1000;
  const y = 86;
  const w = 356;
  const h = 42;
  ctx.fillStyle = '#120a2a';
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = '#ff4fd8';
  ctx.lineWidth = 4;
  ctx.stroke();
  // chasing bulbs around the frame
  ctx.globalCompositeOperation = 'lighter';
  const n = 22;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const bx = x + 8 + k * (w - 16);
    const on = (Math.floor(t * 8) + i) % 3 === 0;
    add(ctx, S.glow[on ? PAL.gold : PAL.amber], bx - 6, y - 4, 12, 12, on ? 1 : 0.35);
    add(ctx, S.glow[on ? PAL.gold : PAL.amber], bx - 6, y + h - 8, 12, 12, on ? 1 : 0.35);
  }
  const flick = Math.sin(t * 3) > -0.92 ? 1 : 0.3;
  add(ctx, S.soft[PAL.magenta], x - 40, y - 50, w + 80, h + 100, 0.45 * flick);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = flick;
  ctx.font = `900 30px ${FONT.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ff4fd8';
  ctx.strokeText('★ ROBO-FAB ★', x + w / 2, y + h / 2 + 1);
  ctx.fillStyle = '#fff0fb';
  ctx.fillText('★ ROBO-FAB ★', x + w / 2, y + h / 2 + 1);
  ctx.globalAlpha = 1;
}

function bulbRow(ctx, S, t, x0, x1, y, step, phase, size) {
  ctx.strokeStyle = 'rgba(70,84,130,0.95)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = x0; x < x1; x += step) {
    ctx.moveTo(x, y - 8);
    ctx.quadraticCurveTo(x + step / 2, y + 6, x + step, y - 8);
  }
  ctx.stroke();
  let i = 0;
  for (let x = x0 + step / 2; x < x1; x += step, i++) {
    const c = i % LIGHT_COLS.length;
    const on = Math.sin(t * 2.4 + i * 1.3 + phase) > -0.3;
    ctx.fillStyle = LIGHT_HEX[c];
    ctx.beginPath();
    ctx.arc(x, y + 2, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    add(ctx, S.glow[LIGHT_COLS[c]], x - size, y + 2 - size, size * 2, size * 2, on ? 1 : 0.2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function lights(ctx, S, t) {
  // party bulbs strung along the overhead pipe and along the floor edge
  bulbRow(ctx, S, t, 6, DOCK.x0 - 6, 106, 56, 0, 20);
  bulbRow(ctx, S, t, 6, 990, 932, 70, 2, 16);
  // disco sweep across the floor
  ctx.globalCompositeOperation = 'lighter';
  const sx = 120 + (0.5 + 0.5 * Math.sin(t * 0.7)) * 760;
  add(ctx, S.soft[LIGHT_COLS[Math.floor(t * 0.5) % LIGHT_COLS.length]], sx - 140, 930, 280, 90, 0.35);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function arm(ctx, S, t) {
  // big industrial robot arm on the floor, reaching up the gap between crates and forges
  const bx = 286;
  const by = BASE;
  ctx.fillStyle = '#26345e';
  roundRectPath(ctx, bx - 34, by - 24, 68, 24, 8);
  ctx.fill();
  ctx.fillStyle = '#ffb020';
  ctx.fillRect(bx - 30, by - 8, 60, 5);
  const a1 = -Math.PI / 2 + Math.sin(t * 0.8) * 0.16;
  const a2 = -Math.PI / 2 + Math.sin(t * 0.8 + 1.2) * 0.22;
  const sx = bx;
  const sy = by - 26;
  const ex = sx + Math.cos(a1) * 70;
  const ey = sy + Math.sin(a1) * 70;
  const hx = ex + Math.cos(a2) * 62;
  const hy = ey + Math.sin(a2) * 62;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a2340';
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  ctx.strokeStyle = '#ffb020';
  ctx.lineWidth = 26;
  ctx.stroke();
  ctx.strokeStyle = '#fff1b0';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = '#c8d4f0';
  ctx.beginPath();
  ctx.arc(sx, sy, 11, 0, Math.PI * 2);
  ctx.moveTo(ex + 10, ey);
  ctx.arc(ex, ey, 10, 0, Math.PI * 2);
  ctx.fill();
  // gripper holding a glowing cube
  const g = 6 + Math.sin(t * 1.6) * 3;
  ctx.fillStyle = '#c8d4f0';
  ctx.fillRect(hx - g - 8, hy - 20, 6, 22);
  ctx.fillRect(hx + g + 2, hy - 20, 6, 22);
  ctx.fillStyle = '#22f0ff';
  ctx.fillRect(hx - 8, hy - 18, 16, 16);
  ctx.globalCompositeOperation = 'lighter';
  add(ctx, S.glow[PAL.cyan], hx - 22, hy - 32, 44, 44, 0.7 + 0.3 * Math.sin(t * 6));
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function puff(ctx, S, t, x, y, rise, n, alpha, big) {
  for (let j = 0; j < n; j++) {
    const life = (t * 0.55 + j / n + x * 0.0013) % 1;
    const sz = 14 + life * big;
    add(ctx, S.soft[PAL.white], x - sz + Math.sin(t + j * 2) * 8, y - life * rise - sz, sz * 2, sz * 2, alpha * (1 - life));
  }
  ctx.globalAlpha = 1;
}

function steam(ctx, S, t) {
  // tall boiler in the gap between the forges and the dock + two big floor vents
  const x = 966;
  const y0 = 150;
  const y1 = 520;
  ctx.fillStyle = '#4a5578';
  roundRectPath(ctx, x - 21, y0, 42, y1 - y0, 18);
  ctx.fill();
  ctx.strokeStyle = '#9aa8cc';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#2a3354';
  for (let y = y0 + 40; y < y1 - 20; y += 60) ctx.fillRect(x - 21, y, 42, 6);
  // pressure gauge
  const gy = y0 + 90;
  ctx.fillStyle = '#f2f6ff';
  ctx.beginPath();
  ctx.arc(x, gy, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff3b6b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, gy);
  const ga = -2.4 + (0.5 + 0.5 * Math.sin(t * 1.7)) * 1.8;
  ctx.lineTo(x + Math.cos(ga) * 12, gy + Math.sin(ga) * 12);
  ctx.stroke();
  // red status light
  ctx.globalCompositeOperation = 'lighter';
  add(ctx, S.glow[PAL.red], x - 12, y1 - 60, 24, 24, 0.5 + 0.5 * Math.sin(t * 4));
  puff(ctx, S, t, x, y0, 90, 5, 0.45, 26);
  ctx.globalCompositeOperation = 'source-over';
  for (const vx of [470, 790]) {
    ctx.fillStyle = '#1a2340';
    roundRectPath(ctx, vx - 34, BASE - 16, 68, 16, 5);
    ctx.fill();
    ctx.strokeStyle = '#8a9bc4';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    for (let k = -24; k <= 24; k += 8) {
      ctx.moveTo(vx + k, BASE - 13);
      ctx.lineTo(vx + k, BASE - 3);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    puff(ctx, S, t + vx, vx, BASE - 14, 70, 6, 0.4, 30);
    ctx.globalCompositeOperation = 'source-over';
  }
}

function belt2(ctx, S, t) {
  // second conveyor line along the whole floor strip
  const x0 = 330;
  const x1 = 932;
  const y = BASE - 12;
  ctx.fillStyle = '#0a1028';
  roundRectPath(ctx, x0, y - 9, x1 - x0, 18, 9);
  ctx.fill();
  ctx.strokeStyle = '#b45cff';
  ctx.lineWidth = 3;
  ctx.stroke();
  // moving chevrons
  ctx.strokeStyle = 'rgba(180,92,255,0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const off = (t * 60) % 30;
  for (let x = x0 + 10 + off; x < x1 - 10; x += 30) {
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x, y + 5);
  }
  ctx.stroke();
  // glowing crates riding the belt
  const off2 = (t * 60) % 110;
  const cols = [PAL.gold, PAL.cyan, PAL.magenta, PAL.green];
  const hex = ['#ffb020', '#22f0ff', '#ff4fd8', '#39ff88'];
  let i = 0;
  for (let x = x0 + off2; x < x1 - 30; x += 110, i++) {
    const c = (i + Math.floor((t * 60) / 110)) % 4;
    ctx.fillStyle = hex[c];
    roundRectPath(ctx, x, y - 34, 26, 24, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y - 24, 26, 3);
    ctx.globalCompositeOperation = 'lighter';
    add(ctx, S.glow[cols[c]], x - 10, y - 46, 46, 46, 0.45);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

function lift(ctx, S, t) {
  // hover-lift running up and down the gap between the crates and the forges
  const x = 286;
  const top = 130;
  const bottom = 760;
  ctx.fillStyle = '#3a4a78';
  ctx.fillRect(x - 30, top, 6, bottom - top + 40);
  ctx.fillRect(x + 24, top, 6, bottom - top + 40);
  ctx.globalCompositeOperation = 'lighter';
  for (let y = top + 10; y < bottom + 30; y += 40) {
    const on = Math.sin(t * 5 - y * 0.03) > 0.3;
    add(ctx, S.glow[PAL.cyan], x - 33, y - 3, 12, 12, on ? 0.9 : 0.2);
    add(ctx, S.glow[PAL.cyan], x + 21, y - 3, 12, 12, on ? 0.9 : 0.2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  const k = 0.5 + 0.5 * Math.sin(t * 0.6);
  const py = top + 40 + k * (bottom - top - 40);
  ctx.fillStyle = '#9aa8cc';
  roundRectPath(ctx, x - 30, py, 60, 10, 4);
  ctx.fill();
  ctx.fillStyle = '#ffb020';
  roundRectPath(ctx, x - 18, py - 30, 36, 30, 5);
  ctx.fill();
  ctx.fillStyle = '#7a4a00';
  ctx.fillRect(x - 18, py - 18, 36, 4);
  ctx.globalCompositeOperation = 'lighter';
  add(ctx, S.glow[PAL.cyan], x - 30, py + 4, 60, 30, 0.9);
  add(ctx, S.glow[PAL.amber], x - 26, py - 40, 52, 52, 0.4);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function reactor(ctx, S, t) {
  // tall plasma reactor at the dock's left edge, lighting up the whole dock floor
  const x = 1020;
  const y1 = BASE;
  const y0 = 690;
  const p = 0.65 + 0.35 * Math.sin(t * 4);
  ctx.globalCompositeOperation = 'lighter';
  add(ctx, S.soft[PAL.green], x - 200, y0 - 120, 400, y1 - y0 + 220, 0.35 * p);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#141c38';
  roundRectPath(ctx, x - 32, y0, 64, y1 - y0, 16);
  ctx.fill();
  ctx.strokeStyle = '#5d6b8f';
  ctx.lineWidth = 4;
  ctx.stroke();
  // glass core
  const cy0 = y0 + 40;
  const cy1 = y1 - 50;
  ctx.fillStyle = '#062a18';
  roundRectPath(ctx, x - 20, cy0, 40, cy1 - cy0, 14);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  add(ctx, S.glow[PAL.green], x - 26, cy0 - 10, 52, cy1 - cy0 + 20, p);
  // rising plasma blobs
  for (let j = 0; j < 5; j++) {
    const life = (t * 0.5 + j / 5) % 1;
    const by = cy1 - 10 - life * (cy1 - cy0 - 20);
    add(ctx, S.glow[j % 2 ? PAL.white : PAL.green], x - 10 + Math.sin(t * 3 + j) * 5, by - 10, 20, 20, 0.9 * Math.sin(life * Math.PI));
  }
  // lightning between the top electrodes
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(160,255,200,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const seed = Math.floor(t * 12);
  ctx.moveTo(x - 24, y0 - 6);
  for (let k = 1; k < 6; k++) ctx.lineTo(x - 24 + k * 8, y0 - 14 - (((seed * 7 + k * 13) % 11) - 2));
  ctx.lineTo(x + 24, y0 - 6);
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#9aa8cc';
  ctx.fillRect(x - 28, y0 - 12, 6, 14);
  ctx.fillRect(x + 22, y0 - 12, 6, 14);
  // hazard band
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(x - 30, y1 - 34, 60, 8);
  ctx.fillStyle = '#1a2340';
  for (let k = -24; k < 30; k += 12) ctx.fillRect(x + k, y1 - 34, 5, 8);
}

function trophy(ctx, cx, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 16 * s, y - 52 * s);
  ctx.lineTo(cx + 16 * s, y - 52 * s);
  ctx.quadraticCurveTo(cx + 14 * s, y - 26 * s, cx + 4 * s, y - 24 * s);
  ctx.lineTo(cx - 4 * s, y - 24 * s);
  ctx.quadraticCurveTo(cx - 14 * s, y - 26 * s, cx - 16 * s, y - 52 * s);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4 * s;
  ctx.beginPath();
  ctx.arc(cx - 16 * s, y - 42 * s, 7 * s, Math.PI * 0.5, Math.PI * 1.5);
  ctx.moveTo(cx + 16 * s, y - 49 * s);
  ctx.arc(cx + 16 * s, y - 42 * s, 7 * s, -Math.PI * 0.5, Math.PI * 0.5);
  ctx.stroke();
  ctx.fillRect(cx - 3 * s, y - 25 * s, 6 * s, 13 * s);
  ctx.fillRect(cx - 12 * s, y - 12 * s, 24 * s, 10 * s);
}

function trophies(ctx, S, t) {
  // trophy shelf on the dock floor, in front of the boss's feet
  const x0 = 1076;
  const x1 = 1296;
  const y = BASE - 6;
  ctx.fillStyle = '#3a2a10';
  roundRectPath(ctx, x0, y - 4, x1 - x0, 10, 4);
  ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(x0, y - 4, x1 - x0, 3);
  const list = [
    [1100, 0.8, '#c8d4f0'],
    [1143, 1.0, '#ffd34d'],
    [1186, 1.25, '#ffd34d'],
    [1229, 1.0, '#ffb020'],
    [1272, 0.8, '#c8d4f0'],
  ];
  for (const [cx, s, c] of list) trophy(ctx, cx, y - 4, Math.min(s, (y - 4 - TOP) / 56), c);
  ctx.globalCompositeOperation = 'lighter';
  add(ctx, S.soft[PAL.gold], x0 - 30, y - 110, x1 - x0 + 60, 130, 0.35);
  // glint sweeping across the cups
  const gx = x0 + ((t * 0.4) % 1.6) * (x1 - x0);
  add(ctx, S.glow[PAL.white], gx - 18, y - 70, 36, 36, 0.9);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function rocket(ctx, S, t) {
  // tall rocket on a launch pad in the gap between the forges and the dock; every 30 s it
  // blasts off up the gap (past the steam boiler) and lands again
  const x = 966;
  const pad = TOP;
  const cyc = t % 30;
  let lift = 0;
  if (cyc > 24) {
    const k = (cyc - 24) / 6; // 0..1
    lift = k < 0.5 ? Math.pow(k * 2, 2) * 900 : Math.pow((1 - k) * 2, 2) * 900;
  }
  const shake = cyc > 22 && cyc < 24 ? Math.sin(t * 60) * 1.5 : 0;
  // gantry
  ctx.strokeStyle = '#5d6b8f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 26, pad);
  ctx.lineTo(x + 26, pad - 320);
  for (let y = pad; y > pad - 320; y -= 28) {
    ctx.moveTo(x + 26, y);
    ctx.lineTo(x + 20, y - 14);
  }
  ctx.stroke();
  ctx.fillStyle = '#26345e';
  ctx.fillRect(x - 30, pad, 60, 8);
  const y = pad - lift;
  const rx = x + shake;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 40, 84, 80, pad + 120 - 84);
  ctx.clip();
  // flame
  const firing = cyc > 22;
  ctx.globalCompositeOperation = 'lighter';
  const fl = firing ? 1 : 0.35;
  add(ctx, S.glow[PAL.orange], rx - 16, y - 30, 32, 40 + (firing ? 50 + Math.sin(t * 30) * 12 : 6), fl);
  add(ctx, S.glow[PAL.gold], rx - 10, y - 26, 20, 30 + (firing ? 30 : 0), fl);
  if (firing) add(ctx, S.soft[PAL.white], x - 40, pad - 50, 80, 120, lift > 0 ? 0.6 : 0.4);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // body
  const h = 300;
  ctx.fillStyle = '#e8eefc';
  ctx.beginPath();
  ctx.moveTo(rx, y - h);
  ctx.quadraticCurveTo(rx + 22, y - h + 60, rx + 20, y - 30);
  ctx.lineTo(rx - 20, y - 30);
  ctx.quadraticCurveTo(rx - 22, y - h + 60, rx, y - h);
  ctx.fill();
  ctx.fillStyle = '#ff3b6b';
  ctx.beginPath();
  ctx.moveTo(rx, y - h);
  ctx.quadraticCurveTo(rx + 12, y - h + 25, rx + 15, y - h + 50);
  ctx.lineTo(rx - 15, y - h + 50);
  ctx.quadraticCurveTo(rx - 12, y - h + 25, rx, y - h);
  ctx.fill();
  ctx.fillRect(rx - 20, y - 110, 40, 10);
  ctx.beginPath();
  ctx.moveTo(rx - 20, y - 80);
  ctx.lineTo(rx - 34, y);
  ctx.lineTo(rx - 20, y - 30);
  ctx.moveTo(rx + 20, y - 80);
  ctx.lineTo(rx + 34, y);
  ctx.lineTo(rx + 20, y - 30);
  ctx.fill();
  ctx.fillStyle = '#1a2340';
  ctx.fillRect(rx - 12, y - 30, 24, 8);
  // porthole
  ctx.fillStyle = '#22f0ff';
  ctx.beginPath();
  ctx.arc(rx, y - 170, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a9bc4';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  // countdown lamp
  ctx.globalCompositeOperation = 'lighter';
  const lamp = cyc > 18 && cyc < 24 ? (Math.sin(t * 12) > 0 ? 1 : 0.2) : 0.25;
  add(ctx, S.glow[cyc > 22 ? PAL.green : PAL.red], x + 16, pad - 336, 20, 20, lamp);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function statue(ctx, S, t) {
  // golden robot statue on a plinth under the crates, with god rays
  const x = 136;
  const y = BASE;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.32 + Math.sin(t * 0.6 + i) * 0.05;
    ctx.save();
    ctx.translate(x, y - 50);
    ctx.rotate(a + Math.PI / 2);
    ctx.globalAlpha = 0.1 + 0.06 * Math.sin(t * 1.5 + i);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.lineTo(40, -520);
    ctx.lineTo(-40, -520);
    ctx.fill();
    ctx.restore();
  }
  add(ctx, S.soft[PAL.gold], x - 150, y - 170, 300, 220, 0.5 + 0.15 * Math.sin(t * 2.5));
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // plinth
  ctx.fillStyle = '#3a2a5e';
  roundRectPath(ctx, x - 62, y - 18, 124, 18, 4);
  ctx.fill();
  ctx.fillStyle = '#ffd34d';
  ctx.fillRect(x - 62, y - 18, 124, 3);
  // robot (feet at y-18, head top at TOP)
  const gold = '#ffd34d';
  const deep = '#c99500';
  const by = y - 18;
  ctx.fillStyle = deep;
  ctx.fillRect(x - 20, by - 14, 14, 14);
  ctx.fillRect(x + 6, by - 14, 14, 14);
  ctx.fillStyle = gold;
  roundRectPath(ctx, x - 26, by - 46, 52, 34, 9);
  ctx.fill();
  roundRectPath(ctx, x - 20, by - 74, 40, 28, 8);
  ctx.fill();
  // raised arm (waving)
  ctx.save();
  ctx.translate(x + 26, by - 40);
  ctx.rotate(-1.1 + Math.sin(t * 2) * 0.2);
  ctx.fillRect(0, -5, 30, 10);
  ctx.restore();
  ctx.fillRect(x - 40, by - 40, 14, 10);
  ctx.fillStyle = '#7a5200';
  ctx.fillRect(x - 11, by - 66, 7, 7);
  ctx.fillRect(x + 4, by - 66, 7, 7);
  ctx.fillRect(x - 8, by - 54, 16, 3);
  ctx.fillStyle = '#fff3c2';
  ctx.fillRect(x - 22, by - 44, 6, 26);
  // crown sparkle
  ctx.globalCompositeOperation = 'lighter';
  for (let j = 0; j < 6; j++) {
    const life = (t * 0.4 + j / 6) % 1;
    const sx = x + Math.sin(j * 2.3 + t) * 60;
    add(ctx, S.glow[PAL.gold], sx - 7, by - 20 - life * 70 - 7, 14, 14, Math.sin(life * Math.PI));
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Same order as BUILDS in src/game/economy.js (drawn in a z-order that keeps thin things back).
const DRAW = { sign, lights, arm, steam, belt2, lift, reactor, trophies, rocket, statue };
export const BUILD_DRAW_IDS = Object.freeze(Object.keys(DRAW));
const Z = ['statue', 'lights', 'lift', 'belt2', 'steam', 'arm', 'reactor', 'trophies', 'rocket', 'sign'];

/**
 * Draws every owned build item. `ids` = the owned build ids (economy BUILDS order).
 * `intro` (optional) = { hide: ids not to draw yet, id, k } — `id` is drawn mid build-in
 * animation (k 0..1: drops in and pops to full size around its anchor).
 */
export function drawBuilds(ctx, r, t, sprites, ids, intro) {
  if (!ids || !ids.length) return;
  r.resetLocal();
  for (const id of Z) {
    if (!ids.includes(id)) continue;
    if (intro && intro.hide && intro.hide.includes(id)) continue;
    try {
      ctx.save();
      if (intro && intro.id === id) {
        const k = Math.max(0, Math.min(1, Number(intro.k) || 0));
        const a = BUILD_ANCHORS[id];
        const s = Math.max(0.01, easeOutBack(k));
        ctx.translate(a.x, a.y - (1 - k) * (1 - k) * 160);
        ctx.scale(s, s);
        ctx.translate(-a.x, -a.y);
      }
      DRAW[id](ctx, sprites, t);
    } finally {
      ctx.restore();
    }
  }
}
