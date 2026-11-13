// World layout (logical px, WORLD 1366×1024). Single source of positions.

export const HUD_H = 84;
export const FLOOR = Object.freeze({ y0: 930, y1: 1010 });

// Dispensers: 2 columns × 6 rows, values row-major 1..12.
export const DISPENSER = Object.freeze({ x0: 24, x1: 250, y0: 100, y1: 920, cols: 2, rows: 6 });
// Forges: 4 columns × 3 rows, ×1..×12 row-major.
export const FORGE = Object.freeze({ x0: 320, x1: 940, y0: 108, y1: 920, cols: 4, rows: 3 });
// Dock / boss.
export const DOCK = Object.freeze({ x0: 990, x1: 1366, bossX: 1180, bossBaseY: 905, hatchY: 745 });

export function dispenserSlot(value) {
  const i = value - 1;
  const col = i % DISPENSER.cols;
  const row = Math.floor(i / DISPENSER.cols);
  const cw = (DISPENSER.x1 - DISPENSER.x0) / DISPENSER.cols;
  const rh = (DISPENSER.y1 - DISPENSER.y0) / DISPENSER.rows;
  const cx = DISPENSER.x0 + cw * (col + 0.5);
  const cy = DISPENSER.y0 + rh * (row + 0.5);
  // Hit rect = whole cell (≈113×137 world px ≥ 64 CSS px even at 0.62 scale).
  return { cx, cy, col, row, hit: { x: cx - cw / 2, y: cy - rh / 2, w: cw, h: rh } };
}

export function forgeSlot(mult) {
  const i = mult - 1;
  const col = i % FORGE.cols;
  const row = Math.floor(i / FORGE.cols);
  const cw = (FORGE.x1 - FORGE.x0) / FORGE.cols;
  const rh = (FORGE.y1 - FORGE.y0) / FORGE.rows;
  const cx = FORGE.x0 + cw * (col + 0.5);
  const cy = FORGE.y0 + rh * (row + 0.5);
  return { cx, cy, col, row, hit: { x: cx - cw / 2 + 4, y: cy - rh / 2 + 4, w: cw - 8, h: rh - 8 } };
}
