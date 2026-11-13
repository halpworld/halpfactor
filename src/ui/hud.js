// HUD strip.
import { el, svg, button, onPress, safe, clamp, reducedMotion } from './dom.js';
import { icon } from './icons.js';
import { icon2 } from './icons2.js';
import { formatBolts } from '../core/format.js';

const RING_C = 2 * Math.PI * 19;
const HOLD_MS = 2000;
const OC_MAX_DEFAULT = 12000;

export class Hud {
  constructor(root, { synth, bus }) {
    this.synth = synth; this.bus = bus;
    this.boltShown = 0; this.boltTarget = null; this.tweenRaf = 0;
    this.last = {};
    this.ocMax = OC_MAX_DEFAULT;
    this.el = el('header', 'rf-hud');

    // Logo (secret parent entrance)
    const logo = el('div', 'rf-logo');
    const ring = svg('svg', { viewBox: '0 0 44 44', class: 'rf-hold-ring' });
    ring.appendChild(svg('circle', { cx: 22, cy: 22, r: 19, class: 'rf-hold-bg' }));
    this.ringArc = svg('circle', { cx: 22, cy: 22, r: 19, class: 'rf-hold-arc', 'stroke-dasharray': RING_C, 'stroke-dashoffset': RING_C, transform: 'rotate(-90 22 22)' });
    ring.appendChild(this.ringArc);
    logo.appendChild(ring);
    this.ring = ring;
    logo.appendChild(icon('gear', 'rf-logo-gear'));
    const txt = el('span', 'rf-logo-text');
    'ROBO-FACTOR'.split('').forEach((ch, i) => txt.appendChild(el('i', i === 3 ? 'fl1' : i === 8 ? 'fl2' : '', ch)));
    logo.appendChild(txt);
    this.logo = logo;
    this.bindHold(logo);
    this.el.appendChild(logo);

    // Bolt counter
    const bolts = el('div', 'rf-bolts');
    this.boltIcon = icon('bolt', 'rf-bolt-ico');
    bolts.appendChild(this.boltIcon);
    this.boltText = el('span', 'rf-bolt-num', '0');
    bolts.appendChild(this.boltText);
    this.boltsEl = bolts;
    this.el.appendChild(bolts);

    // Level badge
    const lv = el('div', 'rf-level');
    lv.appendChild(el('span', 'rf-level-lbl', 'LV'));
    this.levelNum = el('span', 'rf-level-num', '1');
    lv.appendChild(this.levelNum);
    this.pips = el('span', 'rf-pips');
    for (let i = 0; i < 5; i++) this.pips.appendChild(el('i'));
    lv.appendChild(this.pips);
    this.stars = el('div', 'rf-stars');
    this.stars.appendChild(icon('star'));
    this.starNum = el('span', 'rf-stars-n', '0');
    this.stars.appendChild(this.starNum);
    this.stars.style.display = 'none';
    lv.appendChild(this.stars);
    this.el.appendChild(lv);

    // Goal bar: the next thing to save up for (tap opens the shop on that tab)
    const goal = button('rf-goal');
    goal.style.display = 'none';
    this.goalLbl = el('span', 'rf-goal-lbl');
    const gtrack = el('span', 'rf-goal-track');
    this.goalFill = el('i', 'rf-goal-fill');
    gtrack.appendChild(this.goalFill);
    goal.append(this.goalLbl, gtrack);
    this.goalEl = goal;
    this.goalTab = null;
    onPress(goal, () => { safe(synth, 'click'); bus.emit('ui:openShop', this.goalTab ? { tab: this.goalTab } : undefined); });
    this.el.appendChild(goal);

    // Overclock bar
    const oc = el('div', 'rf-oc');
    const lab = el('div', 'rf-oc-lbl');
    lab.appendChild(icon('flash'));
    lab.appendChild(el('span', null, 'OVERCLOCK ×2'));
    oc.appendChild(lab);
    const track = el('div', 'rf-oc-track');
    this.ocFill = el('i', 'rf-oc-fill');
    track.appendChild(this.ocFill);
    oc.appendChild(track);
    this.oc = oc;
    this.el.appendChild(oc);

    // Right buttons
    const right = el('div', 'rf-hud-right');
    this.chestBtn = button('rf-hud-btn rf-icon-btn rf-chest-btn', null, icon2('chest'));
    this.chestBtn.setAttribute('aria-label', 'Daily chest');
    onPress(this.chestBtn, () => { safe(synth, 'click'); bus.emit('ui:openDaily'); });
    const shop = button('rf-hud-btn rf-shop-btn', 'SHOP', icon('shop'));
    onPress(shop, () => { safe(synth, 'click'); bus.emit('ui:openShop'); });
    this.sfxBtn = button('rf-hud-btn rf-icon-btn', null, icon('speaker'));
    this.sfxBtn.setAttribute('aria-label', 'Sound effects');
    this.sfxBtn.setAttribute('aria-pressed', 'true');
    onPress(this.sfxBtn, () => { safe(synth, 'click'); bus.emit('ui:toggleSfx'); });
    this.ambBtn = button('rf-hud-btn rf-icon-btn', null, icon('note'));
    this.ambBtn.setAttribute('aria-label', 'Music');
    this.ambBtn.setAttribute('aria-pressed', 'true');
    onPress(this.ambBtn, () => { safe(synth, 'click'); bus.emit('ui:toggleAmbient'); });
    right.append(this.chestBtn, shop, this.sfxBtn, this.ambBtn);
    this.el.appendChild(right);
    root.appendChild(this.el);

    this.unsub = bus.on('game:bolts', (p) => this.flyBolts(p));
  }

  get height() { return this.el.offsetHeight || 64; }

  bindHold(logo) {
    let raf = 0, t0 = 0, held = false;
    const stop = () => {
      held = false;
      cancelAnimationFrame(raf);
      this.ring.classList.remove('on');
      this.ringArc.setAttribute('stroke-dashoffset', String(RING_C));
    };
    const tick = () => {
      if (!held) return;
      const p = clamp((performance.now() - t0) / HOLD_MS, 0, 1);
      this.ringArc.setAttribute('stroke-dashoffset', String(RING_C * (1 - p)));
      if (p > 0.15) this.ring.classList.add('on');
      if (p >= 1) { stop(); this.bus.emit('ui:foremanRequest'); return; }
      raf = requestAnimationFrame(tick);
    };
    logo.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      held = true; t0 = performance.now();
      raf = requestAnimationFrame(tick);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) logo.addEventListener(ev, stop);
    logo.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  set(h) {
    if (!h) return;
    const L = this.last;
    if (typeof h.boltsText === 'string') this.boltsText = h.boltsText;
    if (typeof h.bolts === 'number' && h.bolts !== L.bolts) { L.bolts = h.bolts; this.setBolts(h.bolts); }
    else if (typeof h.boltsText === 'string' && h.boltsText !== L.bt && !this.tweenRunning) { this.boltText.textContent = h.boltsText; }
    if (typeof h.boltsText === 'string') L.bt = h.boltsText;
    if (typeof h.rebirths === 'number' && h.rebirths !== L.rebirths) {
      L.rebirths = h.rebirths;
      this.stars.style.display = h.rebirths > 0 ? '' : 'none';
      this.starNum.textContent = String(h.rebirths);
    }
    if ('goal' in h) this.setGoal(h.goal);
    if (typeof h.dailyReady === 'boolean' && h.dailyReady !== L.dailyReady) {
      L.dailyReady = h.dailyReady;
      this.chestBtn.classList.toggle('ready', h.dailyReady);
    }
    if (typeof h.level === 'number' && h.level !== L.level) { L.level = h.level; this.levelNum.textContent = String(h.level); }
    if (typeof h.ordersCompleted === 'number' && h.ordersCompleted !== L.orders) {
      L.orders = h.ordersCompleted;
      const filled = h.ordersCompleted % 5;
      Array.prototype.forEach.call(this.pips.children, (p, i) => p.classList.toggle('on', i < filled));
    }
    if (typeof h.overclock === 'boolean') {
      if (h.overclock !== L.overclock) {
        L.overclock = h.overclock;
        this.oc.classList.toggle('on', h.overclock);
        this.el.classList.toggle('overclocked', h.overclock);
        if (!h.overclock) this.ocMax = OC_MAX_DEFAULT;
      }
      if (h.overclock && typeof h.overclockRemainingMs === 'number') {
        const r = Math.max(0, h.overclockRemainingMs);
        if (r > this.ocMax) this.ocMax = r;
        const f = Math.round(clamp(r / this.ocMax, 0, 1) * 200) / 200;
        if (f !== L.ocf) { L.ocf = f; this.ocFill.style.transform = `scaleX(${f})`; }
      }
    }
    // Toggles are re-applied every call so the DOM follows the game's truth.
    if (typeof h.sfxOn === 'boolean') this.setToggle(this.sfxBtn, h.sfxOn, 'speaker', 'speakerOff');
    if (typeof h.ambientOn === 'boolean') this.setToggle(this.ambBtn, h.ambientOn, 'note', 'noteOff');
  }

  setGoal(g) {
    const L = this.last;
    const key = g ? [g.label, g.tab, g.cost, Math.round((g.progress || 0) * 100)].join('|') : '';
    if (key === L.goal) return;
    L.goal = key;
    if (!g) { this.goalEl.style.display = 'none'; this.goalTab = null; return; }
    const p = Math.max(0, Math.min(1, Number(g.progress) || 0));
    this.goalTab = g.tab || null;
    this.goalEl.style.display = '';
    this.goalEl.classList.toggle('ready', p >= 1);
    this.goalLbl.textContent = p >= 1 ? 'READY! ' + g.label : g.label + '  ' + formatBolts(Math.round(p * g.cost)) + ' / ' + formatBolts(g.cost);
    this.goalFill.style.transform = 'scaleX(' + p + ')';
  }

  setToggle(btn, on, onIcon, offIcon) {
    if (btn._on === on) return;
    btn._on = on;
    btn.classList.toggle('muted', !on);
    btn.setAttribute('aria-pressed', String(on));
    const old = btn.querySelector('svg');
    const fresh = icon(on ? onIcon : offIcon);
    if (old) btn.replaceChild(fresh, old); else btn.prepend(fresh);
  }

  setBolts(n) {
    const first = this.boltTarget === null;
    this.boltTarget = n;
    cancelAnimationFrame(this.tweenRaf);
    if (first || reducedMotion() || n < this.boltShown) {
      this.boltShown = n;
      this.tweenRunning = false;
      this.boltText.textContent = this.boltsText || formatBolts(Math.round(n));
      return;
    }
    const from = this.boltShown, to = n, t0 = performance.now();
    const dur = clamp(300 + (to - from) * 8, 400, 1100);
    this.bump();
    this.tweenRunning = true;
    const step = (now) => {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      this.boltShown = from + (to - from) * e;
      this.boltText.textContent = p < 1 ? formatBolts(Math.round(this.boltShown)) : (this.boltsText || formatBolts(Math.round(to)));
      if (p < 1) this.tweenRaf = requestAnimationFrame(step); else this.tweenRunning = false;
    };
    this.tweenRaf = requestAnimationFrame(step);
  }

  bump() {
    const b = this.boltsEl;
    b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }

  flyBolts(p) {
    if (!p || !isFinite(p.x) || !isFinite(p.y) || !(p.delta > 0) || reducedMotion()) return;
    const r = this.boltIcon.getBoundingClientRect();
    const tx = r.left + r.width / 2 - 14, ty = r.top + r.height / 2 - 14;
    const n = clamp(Math.ceil(p.delta / 5), 1, 8);
    for (let i = 0; i < n; i++) {
      const f = el('span', 'rf-fly');
      f.appendChild(icon('bolt'));
      const jx = (Math.random() - 0.5) * 50, jy = (Math.random() - 0.5) * 40;
      f.style.transform = `translate(${p.x - 14 + jx}px, ${p.y - 14 + jy}px) scale(1)`;
      this.el.parentNode.appendChild(f);
      setTimeout(() => {
        f.style.transition = 'transform 650ms cubic-bezier(.5,-0.2,.6,1), opacity 650ms ease-in';
        f.style.transform = `translate(${tx}px, ${ty}px) scale(.55)`;
        f.style.opacity = '0.9';
      }, 30 + i * 70);
      setTimeout(() => { f.remove(); if (i === n - 1) this.bump(); }, 760 + i * 70);
    }
  }

  destroy() {
    cancelAnimationFrame(this.tweenRaf);
    this.unsub && this.unsub();
    this.el.remove();
  }
}
