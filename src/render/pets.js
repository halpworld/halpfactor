// Procedural cute robot pets (15), neon style. Works on any 2D context (world canvas or small
// UI portrait canvases): no sprite cache, no shadowBlur-heavy effects, only paths + gradients.
//
// drawPet(ctx, petId, x, y, size, t, golden) draws the pet centred at (x, y), `size` px tall,
// idling with time `t` (seconds). Unknown ids draw a "?" capsule.

const TAU = Math.PI * 2;

/** Main colour per pet (UI accents). */
export const PET_COLORS = Object.freeze({
  boltBug: '#7ee0ff',
  gearPup: '#ffb020',
  sparkMouse: '#ffe14d',
  turboTurtle: '#39ff88',
  cyberCat: '#22f0ff',
  neonSlime: '#7dff3a',
  magnetMonkey: '#ff6b4a',
  laserFox: '#ff7a1a',
  roboOwl: '#b18cff',
  plasmaDragon: '#ff3df2',
  starBlob: '#ffd8f6',
  cometBunny: '#9fd4ff',
  orbitOcto: '#8a5cff',
  nebulaNarwhal: '#4dd7ff',
  galaxyPhoenix: '#ff4d7a',
});

const ACCENT = {
  boltBug: '#2a6bff',
  gearPup: '#6b3d00',
  sparkMouse: '#ff8a00',
  turboTurtle: '#0b7a45',
  cyberCat: '#ff3df2',
  neonSlime: '#00a86b',
  magnetMonkey: '#4d7cff',
  laserFox: '#ffffff',
  roboOwl: '#ffd34d',
  plasmaDragon: '#ffb020',
  starBlob: '#ff3df2',
  cometBunny: '#ffd34d',
  orbitOcto: '#22f0ff',
  nebulaNarwhal: '#ff3df2',
  galaxyPhoenix: '#ffd34d',
};

const GOLD = '#ffd34d';
const GOLD_DEEP = '#c98a12';
const EYE = '#e8fbff';
const DARK = '#0a1024';

function shade(hex, k) {
  // k > 0 lightens towards white, k < 0 darkens towards black.
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (k >= 0) {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

function tri(ctx, x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
}

/** Body fill: vertical gradient from light to dark of the main colour. */
function bodyFill(ctx, main, top, bottom) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, shade(main, 0.45));
  g.addColorStop(0.55, main);
  g.addColorStop(1, shade(main, -0.45));
  return g;
}

function outline(ctx, w = 3) {
  ctx.lineWidth = w;
  ctx.strokeStyle = 'rgba(5,8,20,0.85)';
  ctx.stroke();
}

/** Visor face with two glowing eyes; blinks every few seconds. */
function face(ctx, cx, cy, w, h, t, accent, opts = {}) {
  ctx.beginPath();
  const r = h / 2;
  ctx.moveTo(cx - w / 2 + r, cy - h / 2);
  ctx.arcTo(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, r);
  ctx.arcTo(cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2, r);
  ctx.arcTo(cx - w / 2, cy + h / 2, cx - w / 2, cy - h / 2, r);
  ctx.arcTo(cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, r);
  ctx.closePath();
  ctx.fillStyle = DARK;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = accent;
  ctx.stroke();
  const blink = (t * 0.37 + (opts.phase || 0)) % 3.2 < 0.12;
  const ex = w * (opts.eyeGap || 0.22);
  const er = h * (opts.eyeSize || 0.28);
  ctx.fillStyle = opts.eyeColor || EYE;
  for (const s of [-1, 1]) {
    if (blink) {
      ctx.fillRect(cx + s * ex - er, cy - 1, er * 2, 2.5);
    } else {
      ell(ctx, cx + s * ex, cy, er * 0.8, er);
      ctx.fill();
    }
  }
  if (!blink) {
    ctx.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {
      ell(ctx, cx + s * ex + er * 0.3, cy - er * 0.4, er * 0.28, er * 0.28);
      ctx.fill();
    }
  }
  // smile
  ctx.beginPath();
  ctx.arc(cx, cy + h * 0.12, h * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = opts.eyeColor || EYE;
  ctx.stroke();
  // cheeks
  ctx.fillStyle = 'rgba(255,110,190,0.55)';
  for (const s of [-1, 1]) {
    ell(ctx, cx + s * w * 0.4, cy + h * 0.2, h * 0.1, h * 0.07);
    ctx.fill();
  }
}

function antenna(ctx, x, y, len, ang, t, color) {
  const tipX = x + Math.cos(ang) * len;
  const tipY = y + Math.sin(ang) * len;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tipX, tipY);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#5d6b8f';
  ctx.stroke();
  ctx.fillStyle = color;
  ell(ctx, tipX, tipY, 4 + Math.sin(t * 5) * 0.8, 4 + Math.sin(t * 5) * 0.8);
  ctx.fill();
}

function legs(ctx, xs, y, h, color) {
  ctx.fillStyle = color;
  for (const x of xs) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x - 4, y, 8, h, 3) : ctx.rect(x - 4, y, 8, h);
    ctx.fill();
  }
}

function sparkle(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

// Each drawer works in a 100-unit tall box centred on (0, 0) (y from -50 to +50).
const DRAW = {
  boltBug(ctx, c, a, t) {
    antenna(ctx, -8, -22, 20, -2.0, t, a);
    antenna(ctx, 8, -22, 20, -1.15, t, a);
    legs(ctx, [-20, -7, 7, 20], 18, 12, '#5d6b8f');
    ell(ctx, 0, 5, 32, 26);
    ctx.fillStyle = bodyFill(ctx, c, -21, 31);
    ctx.fill();
    outline(ctx);
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 30);
    ctx.lineWidth = 2;
    ctx.strokeStyle = a;
    ctx.stroke();
    face(ctx, 0, -2, 38, 18, t, a);
  },
  gearPup(ctx, c, a, t) {
    const wag = Math.sin(t * 8) * 0.5;
    ctx.save();
    ctx.translate(26, 10);
    ctx.rotate(-0.8 + wag);
    ctx.fillStyle = c;
    ell(ctx, 0, -10, 5, 12);
    ctx.fill();
    ctx.restore();
    legs(ctx, [-16, -5, 6, 17], 20, 12, shade(c, -0.4));
    ell(ctx, 0, 8, 28, 22);
    ctx.fillStyle = bodyFill(ctx, c, -14, 30);
    ctx.fill();
    outline(ctx);
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 22, -22);
      ctx.rotate(s * (0.4 + Math.sin(t * 2) * 0.08));
      ell(ctx, 0, 8, 8, 16);
      ctx.fillStyle = a;
      ctx.fill();
      ctx.restore();
    }
    ell(ctx, 0, -16, 24, 20);
    ctx.fillStyle = bodyFill(ctx, c, -36, 4);
    ctx.fill();
    outline(ctx);
    // gear badge
    ctx.fillStyle = a;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU + t;
      ctx.fillRect(Math.cos(ang) * 8 - 2, 14 + Math.sin(ang) * 8 - 2, 4, 4);
    }
    ell(ctx, 0, 14, 6, 6);
    ctx.fill();
    face(ctx, 0, -16, 34, 16, t, a, { phase: 0.7 });
    ctx.fillStyle = DARK;
    ell(ctx, 0, -4, 4, 3);
    ctx.fill();
  },
  sparkMouse(ctx, c, a, t) {
    ctx.beginPath();
    ctx.moveTo(24, 16);
    ctx.bezierCurveTo(44, 20, 40, -4 + Math.sin(t * 3) * 5, 48, -10);
    ctx.lineWidth = 3;
    ctx.strokeStyle = a;
    ctx.stroke();
    sparkle(ctx, 48, -10, 6 + Math.sin(t * 9) * 2, '#ffffff');
    for (const s of [-1, 1]) {
      ell(ctx, s * 20, -26, 14, 14);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, 2.5);
      ell(ctx, s * 20, -26, 8, 8);
      ctx.fillStyle = '#ff9bd2';
      ctx.fill();
    }
    ell(ctx, 0, 6, 28, 28);
    ctx.fillStyle = bodyFill(ctx, c, -22, 34);
    ctx.fill();
    outline(ctx);
    face(ctx, 0, 0, 34, 17, t, a, { phase: 1.3 });
  },
  turboTurtle(ctx, c, a, t) {
    const step = Math.sin(t * 4) * 2;
    legs(ctx, [-24, -10, 10, 24], 16 + step * 0.3, 12, shade(c, -0.3));
    ell(ctx, 32, 2 + step * 0.5, 14, 12);
    ctx.fillStyle = bodyFill(ctx, c, -10, 14);
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = EYE;
    ell(ctx, 36, -1, 3, 3.5);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 14, 34, 34, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = bodyFill(ctx, shade(c, -0.25), -20, 14);
    ctx.fill();
    outline(ctx);
    ctx.strokeStyle = a;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-6, -12);
    ctx.lineTo(6, -12);
    ctx.lineTo(14, 0);
    ctx.lineTo(6, 12);
    ctx.lineTo(-6, 12);
    ctx.closePath();
    ctx.stroke();
    // rocket booster
    ctx.fillStyle = '#5d6b8f';
    ctx.fillRect(-42, -6, 10, 12);
    ctx.fillStyle = '#ffb020';
    tri(ctx, -42, -5, -42, 5, -50 - Math.abs(Math.sin(t * 20)) * 6, 0);
    ctx.fill();
    face(ctx, 0, -4, 26, 12, t, a, { phase: 2.1, eyeSize: 0.32 });
  },
  cyberCat(ctx, c, a, t) {
    ctx.beginPath();
    ctx.moveTo(22, 20);
    ctx.quadraticCurveTo(44, 10, 40 + Math.sin(t * 2.5) * 6, -16);
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2f3b6c';
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = c;
    ctx.stroke();
    ctx.lineCap = 'butt';
    legs(ctx, [-14, -4, 6, 16], 22, 10, '#2f3b6c');
    ell(ctx, 2, 12, 24, 16);
    ctx.fillStyle = '#26305a';
    ctx.fill();
    outline(ctx);
    for (const s of [-1, 1]) {
      tri(ctx, s * 24, -26, s * 8, -32, s * 22, -50);
      ctx.fillStyle = '#2f3b6c';
      ctx.fill();
      outline(ctx, 2);
      tri(ctx, s * 20, -30, s * 12, -33, s * 20, -43);
      ctx.fillStyle = a;
      ctx.fill();
    }
    ell(ctx, 0, -16, 28, 20);
    ctx.fillStyle = '#2f3b6c';
    ctx.fill();
    outline(ctx);
    face(ctx, 0, -16, 38, 18, t, c, { eyeColor: '#39ff88', phase: 0.4 });
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 26, -10);
      ctx.lineTo(s * 40, -12);
      ctx.moveTo(s * 26, -6);
      ctx.lineTo(s * 40, -4);
      ctx.stroke();
    }
  },
  neonSlime(ctx, c, a, t) {
    const sq = Math.sin(t * 3.2) * 3;
    ctx.beginPath();
    ctx.moveTo(-36 - sq, 32);
    ctx.bezierCurveTo(-40 - sq, -10, -20, -40 + sq, 0, -40 + sq);
    ctx.bezierCurveTo(20, -40 + sq, 40 + sq, -10, 36 + sq, 32);
    ctx.quadraticCurveTo(0, 38, -36 - sq, 32);
    ctx.closePath();
    const g = ctx.createRadialGradient(-10, -20, 4, 0, 0, 44);
    g.addColorStop(0, shade(c, 0.6));
    g.addColorStop(1, shade(c, -0.3));
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
    outline(ctx);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ell(ctx, -16, -22, 6, 4, -0.5);
    ctx.fill();
    // floating bolt inside
    ctx.fillStyle = a;
    ell(ctx, 14, 20 + Math.sin(t * 2) * 3, 5, 5);
    ctx.fill();
    face(ctx, 0, 2, 36, 16, t, a, { phase: 1.8 });
  },
  magnetMonkey(ctx, c, a, t) {
    ctx.beginPath();
    ctx.arc(30, 14, 12, Math.PI * 0.5, Math.PI * 1.9 + Math.sin(t * 2) * 0.3);
    ctx.lineWidth = 4;
    ctx.strokeStyle = shade(c, -0.3);
    ctx.stroke();
    legs(ctx, [-12, 12], 24, 10, shade(c, -0.4));
    ell(ctx, 0, 14, 22, 18);
    ctx.fillStyle = bodyFill(ctx, c, -4, 32);
    ctx.fill();
    outline(ctx);
    for (const s of [-1, 1]) {
      ell(ctx, s * 30, -16, 10, 10);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, 2);
      ell(ctx, s * 30, -16, 5, 5);
      ctx.fillStyle = '#ffd0b0';
      ctx.fill();
    }
    ell(ctx, 0, -16, 26, 22);
    ctx.fillStyle = bodyFill(ctx, c, -38, 6);
    ctx.fill();
    outline(ctx);
    // magnet on head
    ctx.save();
    ctx.translate(0, -40);
    ctx.rotate(Math.sin(t * 3) * 0.15);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ff3b4e';
    ctx.beginPath();
    ctx.arc(0, 0, 9, Math.PI, TAU);
    ctx.stroke();
    ctx.fillStyle = '#e8f4ff';
    ctx.fillRect(-12, -1, 6, 6);
    ctx.fillRect(6, -1, 6, 6);
    ctx.restore();
    ell(ctx, 0, -10, 18, 13);
    ctx.fillStyle = '#ffd0b0';
    ctx.fill();
    face(ctx, 0, -20, 32, 14, t, a, { phase: 2.6 });
  },
  laserFox(ctx, c, a, t) {
    ctx.save();
    ctx.translate(22, 16);
    ctx.rotate(-0.6 + Math.sin(t * 3) * 0.25);
    ell(ctx, 10, 0, 18, 9);
    ctx.fillStyle = c;
    ctx.fill();
    outline(ctx, 2);
    ell(ctx, 22, 0, 7, 6);
    ctx.fillStyle = a;
    ctx.fill();
    ctx.restore();
    legs(ctx, [-14, -4, 6, 14], 22, 10, shade(c, -0.45));
    ell(ctx, 0, 12, 22, 16);
    ctx.fillStyle = bodyFill(ctx, c, -4, 28);
    ctx.fill();
    outline(ctx);
    for (const s of [-1, 1]) {
      tri(ctx, s * 26, -18, s * 8, -32, s * 26, -50);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, 2);
    }
    ctx.beginPath();
    ctx.moveTo(-30, -20);
    ctx.quadraticCurveTo(0, -48, 30, -20);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fillStyle = bodyFill(ctx, c, -40, 4);
    ctx.fill();
    outline(ctx);
    ctx.fillStyle = a;
    tri(ctx, -16, -8, 16, -8, 0, 4);
    ctx.fill();
    face(ctx, 0, -20, 34, 13, t, '#22f0ff', { eyeColor: '#ff3b4e', phase: 0.9 });
    // laser visor beam flicker
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 7);
    ctx.fillStyle = '#ff3b4e';
    ctx.fillRect(-17, -21, 34, 2);
    ctx.globalAlpha = 1;
  },
  roboOwl(ctx, c, a, t) {
    const flap = Math.sin(t * 2.4) * 0.2;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 26, 0);
      ctx.rotate(s * (0.3 + flap));
      ell(ctx, 0, 10, 9, 22);
      ctx.fillStyle = shade(c, -0.3);
      ctx.fill();
      outline(ctx, 2);
      ctx.restore();
    }
    ell(ctx, 0, 6, 28, 38);
    ctx.fillStyle = bodyFill(ctx, c, -32, 44);
    ctx.fill();
    outline(ctx);
    for (const s of [-1, 1]) {
      tri(ctx, s * 12, -28, s * 26, -30, s * 26, -46);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, 2);
    }
    // big goggle eyes
    for (const s of [-1, 1]) {
      ell(ctx, s * 12, -12, 12, 12);
      ctx.fillStyle = DARK;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = a;
      ctx.stroke();
      const look = Math.sin(t * 0.8) * 3;
      ell(ctx, s * 12 + look, -12, 5, 5);
      ctx.fillStyle = a;
      ctx.fill();
      ell(ctx, s * 12 + look + 2, -14, 1.8, 1.8);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    tri(ctx, -5, -2, 5, -2, 0, 6);
    ctx.fillStyle = '#ffb020';
    ctx.fill();
    ctx.strokeStyle = shade(c, 0.5);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 14 + i * 8, 10 - i, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    }
    legs(ctx, [-8, 8], 40, 8, '#ffb020');
  },
  plasmaDragon(ctx, c, a, t) {
    const flap = Math.sin(t * 5) * 0.35;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 14, -2);
      ctx.rotate(s * (-0.3 + flap));
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s * 40, -24);
      ctx.lineTo(s * 34, -6);
      ctx.lineTo(s * 40, 6);
      ctx.lineTo(s * 24, 4);
      ctx.closePath();
      ctx.fillStyle = shade(c, -0.25);
      ctx.fill();
      outline(ctx, 2);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(16, 24);
    ctx.quadraticCurveTo(40, 34, 44, 18);
    ctx.lineWidth = 6;
    ctx.strokeStyle = c;
    ctx.stroke();
    tri(ctx, 40, 14, 50, 14, 46, 24);
    ctx.fillStyle = a;
    ctx.fill();
    legs(ctx, [-10, 10], 26, 10, shade(c, -0.4));
    ell(ctx, 0, 12, 22, 20);
    ctx.fillStyle = bodyFill(ctx, c, -8, 32);
    ctx.fill();
    outline(ctx);
    ell(ctx, 0, 16, 12, 12);
    ctx.fillStyle = shade(a, 0.3);
    ctx.fill();
    for (const s of [-1, 1]) {
      tri(ctx, s * 8, -32, s * 18, -48, s * 18, -30);
      ctx.fillStyle = a;
      ctx.fill();
    }
    ell(ctx, 0, -20, 22, 18);
    ctx.fillStyle = bodyFill(ctx, c, -38, -2);
    ctx.fill();
    outline(ctx);
    face(ctx, 0, -20, 32, 14, t, a, { phase: 0.2 });
    // plasma puff
    const p = (t * 1.3) % 1;
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = '#ff9bf7';
    ell(ctx, -26 - p * 14, -14 - p * 6, 3 + p * 5, 3 + p * 5);
    ctx.fill();
    ctx.globalAlpha = 1;
  },
  starBlob(ctx, c, a, t) {
    const spin = Math.sin(t * 1.2) * 0.12;
    ctx.save();
    ctx.rotate(spin);
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 46 : 26;
      const ang = -Math.PI / 2 + (i / 10) * TAU;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r + 4;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.fillStyle = bodyFill(ctx, c, -42, 46);
    ctx.fill();
    outline(ctx, 4);
    ctx.lineJoin = 'miter';
    ctx.restore();
    face(ctx, 0, 4, 32, 15, t, a, { phase: 1.1 });
    sparkle(ctx, 30, -30, 4 + Math.sin(t * 6) * 2, '#ffffff');
    sparkle(ctx, -32, 22, 3 + Math.cos(t * 5) * 1.5, '#ffffff');
  },
  cometBunny(ctx, c, a, t) {
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 12, -26);
      ctx.rotate(s * (0.15 + Math.sin(t * 2 + s) * 0.1));
      ell(ctx, 0, -12, 7, 20);
      ctx.fillStyle = c;
      ctx.fill();
      outline(ctx, 2);
      ell(ctx, 0, -12, 3, 14);
      ctx.fillStyle = '#ff9bd2';
      ctx.fill();
      ctx.restore();
    }
    // comet tail
    const g = ctx.createLinearGradient(20, 0, 50, 0);
    g.addColorStop(0, a);
    g.addColorStop(1, 'rgba(255,211,77,0)');
    ctx.fillStyle = g;
    tri(ctx, 20, 6, 52, -4 + Math.sin(t * 6) * 3, 20, 26);
    ctx.fill();
    legs(ctx, [-12, 12], 28, 8, shade(c, -0.3));
    ell(ctx, 0, 8, 26, 26);
    ctx.fillStyle = bodyFill(ctx, c, -18, 34);
    ctx.fill();
    outline(ctx);
    face(ctx, 0, 0, 34, 15, t, a, { phase: 2.2 });
  },
  orbitOcto(ctx, c, a, t) {
    for (let i = 0; i < 6; i++) {
      const x = -25 + i * 10;
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.quadraticCurveTo(x + Math.sin(t * 3 + i) * 10, 28, x + Math.sin(t * 3 + i + 1) * 6, 44);
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.strokeStyle = shade(c, -0.2);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ell(ctx, 0, -8, 32, 28);
    ctx.fillStyle = bodyFill(ctx, c, -36, 20);
    ctx.fill();
    outline(ctx);
    // orbiting moon
    const ang = t * 1.8;
    const mx = Math.cos(ang) * 44;
    const my = -14 + Math.sin(ang) * 12;
    ctx.beginPath();
    ctx.ellipse(0, -14, 44, 12, 0, 0, TAU);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(34,240,255,0.5)';
    ctx.stroke();
    ell(ctx, mx, my, 5, 5);
    ctx.fillStyle = a;
    ctx.fill();
    face(ctx, 0, -6, 38, 17, t, a, { phase: 0.5 });
  },
  nebulaNarwhal(ctx, c, a, t) {
    ctx.beginPath();
    ctx.moveTo(-28, 4);
    ctx.lineTo(-48, -6 + Math.sin(t * 3) * 6);
    ctx.lineTo(-46, 10 + Math.sin(t * 3) * 6);
    ctx.closePath();
    ctx.fillStyle = shade(c, -0.3);
    ctx.fill();
    outline(ctx, 2);
    ell(ctx, 4, 6, 36, 26);
    const g = ctx.createLinearGradient(-30, -20, 40, 30);
    g.addColorStop(0, shade(c, 0.4));
    g.addColorStop(0.6, c);
    g.addColorStop(1, '#8a5cff');
    ctx.fillStyle = g;
    ctx.fill();
    outline(ctx);
    // horn
    ctx.beginPath();
    ctx.moveTo(26, -12);
    ctx.lineTo(48, -44);
    ctx.lineTo(34, -8);
    ctx.closePath();
    ctx.fillStyle = a;
    ctx.fill();
    outline(ctx, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 4; i++) {
      ell(ctx, -10 + i * 9, 18 + (i % 2) * 4, 1.6, 1.6);
      ctx.fill();
    }
    face(ctx, 10, 0, 32, 15, t, a, { phase: 1.6 });
  },
  galaxyPhoenix(ctx, c, a, t) {
    const flap = Math.sin(t * 4) * 0.4;
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(s * 14, 0);
      ctx.rotate(s * (-0.2 + flap));
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(s * (24 + k * 8), -26 + k * 12, s * (40 + k * 2), -18 + k * 14);
        ctx.quadraticCurveTo(s * (20 + k * 4), 4 + k * 4, 0, 6);
        ctx.closePath();
        ctx.fillStyle = k === 0 ? a : k === 1 ? '#ff7a1a' : c;
        ctx.fill();
      }
      ctx.restore();
    }
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 6, 24);
      ctx.quadraticCurveTo(i * 14, 38, i * 10 + Math.sin(t * 4 + i) * 4, 50);
      ctx.lineWidth = 4;
      ctx.strokeStyle = i === 0 ? a : c;
      ctx.stroke();
    }
    ell(ctx, 0, 6, 20, 24);
    ctx.fillStyle = bodyFill(ctx, c, -18, 30);
    ctx.fill();
    outline(ctx);
    for (let i = -1; i <= 1; i++) {
      tri(ctx, i * 6 - 3, -24, i * 6 + 3, -24, i * 10, -44 + Math.abs(i) * 6);
      ctx.fillStyle = a;
      ctx.fill();
    }
    ell(ctx, 0, -18, 18, 16);
    ctx.fillStyle = bodyFill(ctx, c, -34, -2);
    ctx.fill();
    outline(ctx);
    face(ctx, 0, -18, 28, 12, t, a, { phase: 2.9 });
    tri(ctx, -3, -10, 3, -10, 0, -4);
    ctx.fillStyle = '#ffb020';
    ctx.fill();
  },
};

function drawUnknown(ctx) {
  ell(ctx, 0, 0, 30, 40);
  ctx.fillStyle = '#26305a';
  ctx.fill();
  outline(ctx);
  ctx.fillStyle = '#7f90b8';
  ctx.font = '900 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, 2);
}

/**
 * Draws pet `petId` centred at (x, y), `size` px tall, idle-animated by `t` seconds.
 * Golden pets are gold-tinted with a halo and twinkles.
 */
export function drawPet(ctx, petId, x, y, size, t = 0, golden = false) {
  if (!ctx || !(size > 0)) return;
  const draw = Object.prototype.hasOwnProperty.call(DRAW, petId) ? DRAW[petId] : null;
  const k = size / 100;
  const bob = Math.sin(t * 2.2 + (petId ? petId.length : 0)) * 3;
  ctx.save();
  ctx.translate(x, y + bob * k);
  ctx.scale(k, k);
  // soft ground shadow / halo
  const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 62);
  const hc = golden ? '255,211,77' : '34,240,255';
  halo.addColorStop(0, `rgba(${hc},${golden ? 0.45 : 0.18})`);
  halo.addColorStop(1, `rgba(${hc},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(-62, -62, 124, 124);
  if (!draw) {
    drawUnknown(ctx);
    ctx.restore();
    return;
  }
  const main = golden ? GOLD : PET_COLORS[petId];
  const accent = golden ? GOLD_DEEP : ACCENT[petId];
  draw(ctx, main, accent, t);
  if (golden) {
    for (let i = 0; i < 3; i++) {
      const ph = t * 1.5 + i * 2.1;
      const s = Math.max(0, Math.sin(ph)) * 7;
      if (s > 0.5) sparkle(ctx, Math.cos(i * 2.3) * 38, -30 + i * 22, s, '#fff6c2');
    }
  }
  ctx.restore();
}

/** Ids drawPet knows (for tests / galleries). */
export const PET_IDS = Object.freeze(Object.keys(DRAW));
