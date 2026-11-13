// Small DOM helpers shared by all UI modules. No innerHTML anywhere.
export const SVGNS = 'http://www.w3.org/2000/svg';

export function el(tag, cls, text, attrs) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = String(text);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

export function svg(tag, attrs, children) {
  const n = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  if (children) for (const c of children) n.appendChild(c);
  return n;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Call a synth method safely (synth may be a stub or missing methods). */
export function safe(synth, name, ...args) {
  try {
    const f = synth && synth[name];
    if (typeof f === 'function') f.apply(synth, args);
  } catch (_) { /* audio must never break the UI */ }
}

export function reducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) {
    return false;
  }
}

/** Fires on pointerdown (instant) with a `.down` pressed class. Returns a disposer. */
export function onPress(node, fn) {
  const up = () => node.classList.remove('down');
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (node.classList.contains('disabled')) return;
    node.classList.add('down');
    fn(e);
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('pointerleave', up);
  return () => {
    node.removeEventListener('pointerdown', down);
    node.removeEventListener('pointerup', up);
    node.removeEventListener('pointercancel', up);
    node.removeEventListener('pointerleave', up);
  };
}

/** Scroll-friendly tap: pressed visual on down, action on up if the finger did not travel. */
export function onTap(node, fn) {
  let id = null, sx = 0, sy = 0;
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (node.classList.contains('disabled')) return;
    id = e.pointerId; sx = e.clientX; sy = e.clientY;
    node.classList.add('down');
  });
  node.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    if (Math.abs(e.clientX - sx) > 12 || Math.abs(e.clientY - sy) > 12) {
      id = null; node.classList.remove('down');
    }
  });
  node.addEventListener('pointerup', (e) => {
    const ok = e.pointerId === id;
    id = null; node.classList.remove('down');
    if (ok) fn(e);
  });
  const cancel = () => { id = null; node.classList.remove('down'); };
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
}

export function button(cls, label, iconNode) {
  const b = el('button', 'rf-btn ' + (cls || ''));
  b.type = 'button';
  b.tabIndex = -1;
  if (iconNode) b.appendChild(iconNode);
  if (label !== undefined && label !== null && label !== '') b.appendChild(el('span', 'rf-btn-label', label));
  return b;
}
