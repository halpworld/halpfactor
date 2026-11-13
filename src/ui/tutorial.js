// Tutorial overlay: dim + spotlight + bubble + bouncing arrow. Never blocks pointer events.
import { el, clamp } from './dom.js';
import { icon } from './icons.js';

export class Tutorial {
  constructor(root) {
    this.root = root;
    this.wrap = null;
    this.target = null;
    this.onResize = () => this.target !== undefined && this.layout();
  }
  show({ text, target, step, total }) {
    if (!this.wrap) {
      this.wrap = el('div', 'rf-tut');
      this.dim = el('div', 'rf-tut-dim');
      this.spot = el('div', 'rf-tut-spot');
      this.arrow = el('div', 'rf-tut-arrow');
      this.arrow.appendChild(icon('arrow'));
      this.bubble = el('div', 'rf-tut-bubble');
      this.text = el('div', 'rf-tut-text');
      this.dots = el('div', 'rf-tut-dots');
      this.bubble.appendChild(this.text);
      this.bubble.appendChild(this.dots);
      this.wrap.append(this.dim, this.spot, this.arrow, this.bubble);
      this.root.appendChild(this.wrap);
      window.addEventListener('resize', this.onResize);
    }
    this.wrap.classList.remove('out');
    this.text.textContent = String(text || '');
    while (this.dots.firstChild) this.dots.removeChild(this.dots.firstChild);
    const n = Math.max(0, total | 0);
    for (let i = 1; i <= n; i++) this.dots.appendChild(el('i', 'rf-dot' + (i === step ? ' on' : i < step ? ' past' : '')));
    this.target = target && isFinite(target.x) && isFinite(target.y) ? target : null;
    if (this.wrap.dataset.settled) delete this.wrap.dataset.settled;
    this.layout();
  }
  layout() {
    if (!this.wrap) return;
    const vw = window.innerWidth, vh = window.innerHeight, m = 14;
    const t = this.target;
    const bw = this.bubble.offsetWidth, bh = this.bubble.offsetHeight;
    const bub = (x, y) => {
      this.bubble.style.transform = `translate(${Math.round(clamp(x, m, vw - bw - m))}px, ${Math.round(clamp(y, m, vh - bh - m))}px)`;
    };
    // While a prompt panel is open (step 4), float above it and avoid covering it.
    const pr = this.root.querySelector('.rf-scrim:not(.leaving) .rf-prompt');
    this.wrap.classList.toggle('over-prompt', !!pr);
    this._watchPrompt(pr);
    if (pr) {
      const r = pr.getBoundingClientRect();
      this.spot.style.opacity = '0';
      this.arrow.style.opacity = '0';
      this.dim.classList.remove('full');
      const top = Math.min(vh, this.root.querySelector('.rf-hud') ? this.root.querySelector('.rf-hud').getBoundingClientRect().bottom : 0);
      const regions = [
        { k: 'above', free: r.top - top - m, fits: r.top - top - m >= bh, x: r.left + r.width / 2 - bw / 2, y: top + (r.top - top - bh) / 2 },
        { k: 'below', free: vh - r.bottom - m, fits: vh - r.bottom - m >= bh, x: r.left + r.width / 2 - bw / 2, y: r.bottom + (vh - r.bottom - bh) / 2 },
        { k: 'right', free: vw - r.right - m, fits: vw - r.right - m >= bw, x: r.right + (vw - r.right - bw) / 2, y: r.top + r.height / 2 - bh / 2 },
        { k: 'left', free: r.left - m, fits: r.left - m >= bw, x: (r.left - bw) / 2, y: r.top + r.height / 2 - bh / 2 },
      ];
      const best = regions.find((g) => g.fits && (g.k === 'above' || g.k === 'below')) || regions.find((g) => g.fits) || regions.sort((p, q) => q.free - p.free)[0];
      bub(best.x, best.y);
      if (!this._relayoutQueued) {
        // The prompt settles its own position on the next frame; follow it.
        this._relayoutQueued = true;
        requestAnimationFrame(() => { this._relayoutQueued = false; if (this.wrap && !this.wrap.dataset.settled) { this.wrap.dataset.settled = '1'; this.layout(); } });
      }
      return;
    }
    if (this.wrap.dataset.settled) delete this.wrap.dataset.settled;
    if (!t) {
      this.spot.style.opacity = '0';
      this.arrow.style.opacity = '0';
      this.dim.classList.add('full');
      bub((vw - bw) / 2, vh * 0.18);
      return;
    }
    this.dim.classList.remove('full');
    const pad = 10;
    const x = t.x - pad, y = t.y - pad, w = (t.w || 0) + pad * 2, h = (t.h || 0) + pad * 2;
    this.spot.style.opacity = '1';
    this.spot.style.width = w + 'px';
    this.spot.style.height = h + 'px';
    this.spot.style.transform = `translate(${x}px, ${y}px)`;
    // Bubble goes on the side with the most free room.
    const room = { below: vh - (y + h), above: y, right: vw - (x + w), left: x };
    let side = 'below';
    for (const k of ['above', 'right', 'left']) if (room[k] > room[side]) side = k;
    if (room.below >= bh + 90) side = 'below'; // prefer below when it fits
    const cx = x + w / 2, cy = y + h / 2;
    const gap = 70;
    // Arrow icon points DOWN by default; place it between target and bubble, pointing at the target.
    let ax, ay, rot, bx, by;
    if (side === 'below') { bub(cx - bw / 2, y + h + gap); ax = cx - 22; ay = y + h + 4; rot = 180; bx = 0; by = -12; }
    else if (side === 'above') { bub(cx - bw / 2, y - gap - bh); ax = cx - 22; ay = y - 52; rot = 0; bx = 0; by = 12; }
    else if (side === 'right') { bub(x + w + gap, cy - bh / 2); ax = x + w + 4; ay = cy - 22; rot = 90; bx = -12; by = 0; }
    else { bub(x - gap - bw, cy - bh / 2); ax = x - 52; ay = cy - 22; rot = -90; bx = 12; by = 0; }
    this.arrow.style.opacity = '1';
    this.arrow.style.setProperty('--ax', Math.round(ax) + 'px');
    this.arrow.style.setProperty('--ay', Math.round(ay) + 'px');
    this.arrow.style.setProperty('--arot', rot + 'deg');
    this.arrow.style.setProperty('--bx', bx + 'px');
    this.arrow.style.setProperty('--by', by + 'px');
  }
  /** Re-layout when the prompt panel changes size (e.g. the hint panel opens after a wrong answer). */
  _watchPrompt(pr) {
    if (this._watched === pr) return;
    if (this._ro) this._ro.disconnect();
    if (this._watched) this._watched.removeEventListener('transitionend', this._onPromptMove);
    clearTimeout(this._settleTimer);
    this._watched = pr || null;
    if (!pr) return;
    if (!this._onPromptMove) {
      // Size changes can come with a transform transition, so measure again once it settles.
      this._onPromptMove = () => {
        if (!this.wrap) return;
        this.layout();
        clearTimeout(this._settleTimer);
        this._settleTimer = setTimeout(() => this.wrap && this.layout(), 450);
      };
    }
    pr.addEventListener('transitionend', this._onPromptMove);
    if (typeof ResizeObserver === 'undefined') return;
    if (!this._ro) this._ro = new ResizeObserver(this._onPromptMove);
    this._ro.observe(pr);
  }
  hide() {
    if (!this.wrap) return;
    this._watchPrompt(null);
    const w = this.wrap;
    this.wrap = null;
    window.removeEventListener('resize', this.onResize);
    w.classList.add('out');
    setTimeout(() => w.remove(), 300);
  }
}
