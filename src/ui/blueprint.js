// Array Blueprint: an a-row by b-column grid of glowing blocks that fills row by row with
// running skip-count labels (b, 2b, 3b ...) and the final total.
import { el, clamp, safe, reducedMotion } from './dom.js';

export function createBlueprint(a, b, { maxW = 560, maxH = 460, synth } = {}) {
  const root = el('div', 'rf-bp');
  const total = a * b;
  const titleH = 34, totalH = 54;
  const labelFont0 = 11;
  const labelW = Math.max(44, String(total).length * 14 + 14);
  const cell = Math.floor(clamp(Math.min((maxW - labelW - 8) / b, (maxH - titleH - totalH) / a), 14, 52));
  const labelFont = Math.round(clamp(cell * 0.6, labelFont0, 24));
  const gap = cell > 26 ? 4 : 2;
  const reduced = reducedMotion();
  const rowMs = reduced ? 0 : Math.round(clamp(2800 / a, 110, 420));

  root.style.setProperty('--cell', cell + 'px');
  root.style.setProperty('--gap', gap + 'px');
  root.style.setProperty('--lblw', labelW + 'px');
  root.style.setProperty('--lblf', labelFont + 'px');
  root.style.setProperty('--bd', (b > 0 ? Math.round(rowMs / b) : 0) + 'ms');

  root.appendChild(el('div', 'rf-bp-title', `${a} rows of ${b}`));
  const grid = el('div', 'rf-bp-grid');
  const rows = [];
  for (let i = 1; i <= a; i++) {
    const row = el('div', 'rf-bp-row');
    row.style.setProperty('--r', i - 1);
    const blocks = el('div', 'rf-bp-blocks');
    for (let j = 0; j < b; j++) {
      const blk = el('span', 'rf-bp-blk');
      blk.style.setProperty('--i', j);
      blocks.appendChild(blk);
    }
    row.appendChild(blocks);
    row.appendChild(el('span', 'rf-bp-lbl' + (i === a ? ' last' : ''), i * b));
    grid.appendChild(row);
    rows.push(row);
  }
  root.appendChild(grid);
  const tot = el('div', 'rf-bp-total');
  tot.appendChild(el('span', 'rf-bp-eq', `${a} × ${b} =`));
  tot.appendChild(el('span', 'rf-bp-sum', total));
  root.appendChild(tot);

  const timers = [];
  return {
    el: root,
    play() {
      const start = reduced ? 0 : 250;
      rows.forEach((r, i) => {
        timers.push(setTimeout(() => {
          r.classList.add('on');
          safe(synth, 'keyTap', Math.min(9, i));
        }, start + i * rowMs));
      });
      timers.push(setTimeout(() => root.classList.add('done'), start + a * rowMs + (reduced ? 0 : 150)));
    },
    destroy() { timers.forEach(clearTimeout); timers.length = 0; },
  };
}
