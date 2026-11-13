// Inline SVG icons built with createElementNS (no innerHTML).
import { svg } from './dom.js';

const P = (d, extra) => svg('path', Object.assign({ d }, extra || {}));

export function icon(name, cls) {
  const s = svg('svg', { viewBox: '0 0 24 24', class: 'rf-icon ' + (cls || ''), 'aria-hidden': 'true', focusable: 'false' });
  const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  switch (name) {
    case 'bolt': // gold hex-nut "bolt" currency
      s.appendChild(svg('polygon', { points: '12,1.8 20.5,6.9 20.5,17.1 12,22.2 3.5,17.1 3.5,6.9', fill: '#ffd34d', stroke: '#c98a12', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
      s.appendChild(svg('polygon', { points: '12,4.6 18.2,8.2 12,11 5.8,8.2', fill: '#fff3b0', opacity: 0.75 }));
      s.appendChild(svg('circle', { cx: 12, cy: 12, r: 3.6, fill: '#3a2a05', stroke: '#c98a12', 'stroke-width': 1.2 }));
      break;
    case 'gear': {
      const g = svg('g', { fill: 'currentColor' });
      for (let i = 0; i < 8; i++) g.appendChild(svg('rect', { x: 10.2, y: 1.5, width: 3.6, height: 5, rx: 1, transform: `rotate(${i * 45} 12 12)` }));
      g.appendChild(svg('circle', { cx: 12, cy: 12, r: 7.2 }));
      g.appendChild(svg('circle', { cx: 12, cy: 12, r: 3, fill: '#060a18' }));
      s.appendChild(g);
      break;
    }
    case 'speaker':
    case 'speakerOff':
      s.appendChild(svg('polygon', { points: '3,9 7,9 12,5 12,19 7,15 3,15', fill: 'currentColor' }));
      if (name === 'speaker') {
        s.appendChild(P('M15.5 9 Q17.5 12 15.5 15', stroke));
        s.appendChild(P('M18.5 6.5 Q22.5 12 18.5 17.5', stroke));
      } else {
        s.appendChild(P('M16 9l6 6M22 9l-6 6', stroke));
      }
      break;
    case 'note':
    case 'noteOff':
      s.appendChild(P('M9 17.5V5.5l10-2v12', stroke));
      s.appendChild(svg('circle', { cx: 6.8, cy: 17.8, r: 2.6, fill: 'currentColor' }));
      s.appendChild(svg('circle', { cx: 16.8, cy: 15.8, r: 2.6, fill: 'currentColor' }));
      if (name === 'noteOff') s.appendChild(P('M3 3l18 18', Object.assign({}, stroke, { stroke: '#ff3b4e' })));
      break;
    case 'shop':
      s.appendChild(P('M4.5 8.5h15l-1.4 11.5H5.9z', Object.assign({}, stroke, { fill: 'rgba(34,240,255,.18)' })));
      s.appendChild(P('M8.5 8.5V7a3.5 3.5 0 0 1 7 0v1.5', stroke));
      break;
    case 'close':
      s.appendChild(P('M5 5l14 14M19 5L5 19', Object.assign({}, stroke, { 'stroke-width': 3 })));
      break;
    case 'back':
      s.appendChild(P('M9 5h11.5v14H9L2.8 12z', Object.assign({}, stroke, { fill: 'rgba(255,255,255,.08)' })));
      s.appendChild(P('M12.5 9.2l5 5.6M17.5 9.2l-5 5.6', stroke));
      break;
    case 'lock':
      s.appendChild(svg('rect', { x: 5, y: 10.5, width: 14, height: 10, rx: 2.2, fill: 'currentColor' }));
      s.appendChild(P('M8 10.5V8a4 4 0 0 1 8 0v2.5', stroke));
      break;
    case 'check':
      s.appendChild(P('M4.5 12.8l4.6 4.6L19.5 6.5', Object.assign({}, stroke, { 'stroke-width': 3.2 })));
      break;
    case 'flash':
      s.appendChild(svg('polygon', { points: '13.5,1.8 4.5,13.6 10.2,13.6 8.8,22.2 19.5,9.6 13.2,9.6', fill: 'currentColor' }));
      break;
    case 'drone': {
      s.appendChild(svg('ellipse', { cx: 12, cy: 13, rx: 5.2, ry: 3.4, fill: 'currentColor' }));
      s.appendChild(svg('circle', { cx: 12, cy: 13, r: 1.5, fill: '#22f0ff' }));
      s.appendChild(P('M7.5 11L3.5 8M16.5 11l4-3', stroke));
      s.appendChild(svg('ellipse', { cx: 3.3, cy: 7, rx: 3, ry: 1, fill: 'currentColor', class: 'rf-rotor' }));
      s.appendChild(svg('ellipse', { cx: 20.7, cy: 7, rx: 3, ry: 1, fill: 'currentColor', class: 'rf-rotor' }));
      break;
    }
    case 'arrow': // pointer arrow, points DOWN
      s.appendChild(svg('polygon', { points: '12,22 2.5,9.5 8.8,9.5 8.8,2 15.2,2 15.2,9.5 21.5,9.5', fill: 'currentColor' }));
      break;
    case 'star':
      s.appendChild(svg('polygon', { points: '12,2.5 14.8,9 21.5,9.5 16.4,13.9 18,20.8 12,17.2 6,20.8 7.6,13.9 2.5,9.5 9.2,9', fill: 'currentColor' }));
      break;
    default:
      s.appendChild(svg('circle', { cx: 12, cy: 12, r: 8, fill: 'currentColor' }));
  }
  return s;
}
