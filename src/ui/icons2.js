// Extra inline SVG icons for the tycoon shop (built with createElementNS, no innerHTML).
// Phase B may merge these into icons.js; kept separate so phase A touches no existing file.
import { svg } from './dom.js';

const S = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const P = (d, extra) => svg('path', Object.assign({ d }, extra || {}));

export function icon2(name, cls) {
  const s = svg('svg', { viewBox: '0 0 24 24', class: 'rf-icon ' + (cls || ''), 'aria-hidden': 'true', focusable: 'false' });
  switch (name) {
    case 'up': // upgrade arrow
      s.appendChild(P('M12 20V5M5 11l7-7 7 7', Object.assign({}, S, { 'stroke-width': 3 })));
      break;
    case 'build': // blocks
      s.appendChild(svg('rect', { x: 3, y: 12, width: 8, height: 8, rx: 1.5, fill: 'currentColor' }));
      s.appendChild(svg('rect', { x: 13, y: 12, width: 8, height: 8, rx: 1.5, fill: 'currentColor' }));
      s.appendChild(svg('rect', { x: 8, y: 3, width: 8, height: 8, rx: 1.5, fill: 'currentColor', opacity: 0.7 }));
      break;
    case 'egg':
      s.appendChild(P('M12 2.5C8 2.5 4.8 9 4.8 14a7.2 7.2 0 0 0 14.4 0c0-5-3.2-11.5-7.2-11.5z', { fill: 'currentColor' }));
      s.appendChild(P('M8.5 14.5l2-2 2 2 2-2 1.5 1.5', Object.assign({}, S, { stroke: '#060a18', 'stroke-width': 1.8 })));
      break;
    case 'paw':
      s.appendChild(svg('ellipse', { cx: 12, cy: 16, rx: 5, ry: 4, fill: 'currentColor' }));
      for (const [x, y] of [[5, 10], [9, 6], [15, 6], [19, 10]]) s.appendChild(svg('ellipse', { cx: x, cy: y, rx: 2, ry: 2.6, fill: 'currentColor' }));
      break;
    case 'brush': // style palette
      s.appendChild(P('M12 3a9 9 0 1 0 0 18c1.6 0 2-1.2 1.4-2.2-.7-1.2.1-2.6 1.6-2.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z', Object.assign({}, S, { fill: 'rgba(255,255,255,.12)' })));
      for (const [x, y, c] of [[7.5, 11, '#ff3df2'], [10, 7, '#ffd34d'], [15, 7.5, '#39ff88']]) s.appendChild(svg('circle', { cx: x, cy: y, r: 1.7, fill: c }));
      break;
    case 'rebirth':
      s.appendChild(P('M19 12a7 7 0 1 1-2.2-5.1', S));
      s.appendChild(P('M19.5 3.5v4.5H15', S));
      s.appendChild(svg('polygon', { points: '12,8.5 13,11 15.5,11.2 13.6,12.8 14.2,15.3 12,14 9.8,15.3 10.4,12.8 8.5,11.2 11,11', fill: 'currentColor' }));
      break;
    case 'magnet':
      s.appendChild(P('M5 4v8a7 7 0 0 0 14 0V4', Object.assign({}, S, { 'stroke-width': 4.2 })));
      s.appendChild(svg('rect', { x: 2.8, y: 3, width: 4.4, height: 4, fill: '#ff3b4e' }));
      s.appendChild(svg('rect', { x: 16.8, y: 3, width: 4.4, height: 4, fill: '#a9b6d6' }));
      break;
    case 'battery':
      s.appendChild(svg('rect', { x: 3, y: 7, width: 16, height: 10, rx: 2.2, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2 }));
      s.appendChild(svg('rect', { x: 19.5, y: 10, width: 2.2, height: 4, rx: 1, fill: 'currentColor' }));
      s.appendChild(svg('polygon', { points: '11.5,8 8,12.4 10.8,12.4 9.8,16 14.6,11 11.8,11', fill: '#22f0ff' }));
      break;
    case 'combo':
      s.appendChild(P('M10 14l4-4M8.5 9.5l-2 2a3.2 3.2 0 0 0 4.5 4.5l2-2M15.5 14.5l2-2A3.2 3.2 0 0 0 13 8l-2 2', S));
      break;
    case 'forge': // anvil-ish
      s.appendChild(P('M3 8h14c0 3-2 4-5 4v3h4v3H7v-3h4v-3C7 12 5 11 3 8z', { fill: 'currentColor' }));
      s.appendChild(P('M17 8h4', S));
      break;
    case 'belt':
      s.appendChild(svg('rect', { x: 2.5, y: 8, width: 19, height: 8, rx: 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2 }));
      s.appendChild(P('M7 12h2M11 12h2M15 12h2', S));
      break;
    case 'chest':
      s.appendChild(P('M3.5 11V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v3z', { fill: 'currentColor', opacity: 0.85 }));
      s.appendChild(svg('rect', { x: 3.5, y: 11, width: 17, height: 9, rx: 1.5, fill: 'currentColor' }));
      s.appendChild(svg('rect', { x: 10.2, y: 9.5, width: 3.6, height: 5, rx: 1, fill: '#ffd34d', stroke: '#8a5e08', 'stroke-width': 1 }));
      break;
    case 'sell':
      s.appendChild(P('M4 12h16M14 6l6 6-6 6', S));
      break;
    default:
      s.appendChild(svg('circle', { cx: 12, cy: 12, r: 8, fill: 'currentColor' }));
  }
  return s;
}
