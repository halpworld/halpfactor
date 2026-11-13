// Toasts + level-up banner.
import { el, safe, reducedMotion } from './dom.js';
import { icon } from './icons.js';

export class Toasts {
  constructor(root) {
    this.el = el('div', 'rf-toasts');
    root.appendChild(this.el);
  }
  show(text, { kind = 'info', ms = 1800 } = {}) {
    const k = kind === 'good' || kind === 'warn' ? kind : 'info';
    const t = el('div', 'rf-toast ' + k);
    t.appendChild(icon(k === 'good' ? 'check' : k === 'warn' ? 'flash' : 'gear', 'rf-toast-ico'));
    t.appendChild(el('span', 'rf-toast-text', text));
    this.el.appendChild(t);
    while (this.el.children.length > 3) this.el.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 300);
    }, Math.max(600, ms));
  }
}

const CONFETTI = ['#22f0ff', '#ff3df2', '#ffd34d', '#39ff88', '#8a5cff', '#ff3b4e'];

export class LevelUp {
  constructor(root, synth) {
    this.root = root; this.synth = synth; this.cur = null; this.timer = 0;
  }
  show(level, newTables) {
    this.hide(true);
    safe(this.synth, 'levelUp');
    const wrap = el('div', 'rf-levelup');
    if (!reducedMotion()) {
      const fx = el('div', 'rf-confetti');
      for (let i = 0; i < 44; i++) {
        const c = el('i', 'rf-conf');
        c.style.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
        c.style.setProperty('--dx', ((Math.random() - 0.5) * 160).toFixed(0) + 'px');
        c.style.setProperty('--rot', Math.round(360 + Math.random() * 720) + 'deg');
        c.style.setProperty('--d', (Math.random() * 0.7).toFixed(2) + 's');
        c.style.setProperty('--t', (1.8 + Math.random() * 1.4).toFixed(2) + 's');
        c.style.background = CONFETTI[i % CONFETTI.length];
        fx.appendChild(c);
      }
      for (let i = 0; i < 16; i++) {
        const s = el('i', 'rf-spark');
        const ang = (i / 16) * Math.PI * 2;
        s.style.setProperty('--sx', Math.round(Math.cos(ang) * (180 + Math.random() * 120)) + 'px');
        s.style.setProperty('--sy', Math.round(Math.sin(ang) * (100 + Math.random() * 80)) + 'px');
        fx.appendChild(s);
      }
      wrap.appendChild(fx);
    }
    const card = el('div', 'rf-levelup-card');
    card.appendChild(el('div', 'rf-levelup-kicker', 'LEVEL UP!'));
    const num = el('div', 'rf-levelup-num');
    num.appendChild(icon('star', 'rf-star'));
    num.appendChild(el('span', null, 'LEVEL ' + level));
    num.appendChild(icon('star', 'rf-star'));
    card.appendChild(num);
    if (Array.isArray(newTables) && newTables.length) {
      card.appendChild(el('div', 'rf-levelup-sub', newTables.length > 1 ? 'New tables unlocked' : 'New table unlocked'));
      const chips = el('div', 'rf-levelup-chips');
      for (const t of newTables) chips.appendChild(el('span', 'rf-chip', '×' + t));
      card.appendChild(chips);
    }
    wrap.appendChild(card);
    this.root.appendChild(wrap);
    this.cur = wrap;
    this.timer = setTimeout(() => this.hide(), 3400);
  }
  hide(instant) {
    clearTimeout(this.timer);
    const w = this.cur;
    this.cur = null;
    if (!w) return;
    if (instant) { w.remove(); return; }
    w.classList.add('out');
    setTimeout(() => w.remove(), 400);
  }
}
