// Foreman's Log: parent dashboard modal.
import { el, button, onPress, onTap, safe, clear } from './dom.js';
import { icon } from './icons.js';
import { MASTERED_MS, MASTERED_SCORE, DEFAULT_TABLES } from '../math/mastery.js';

const TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function getStats(facts, a, b) {
  if (!facts) return null;
  const s = facts[a + 'x' + b] || facts[b + 'x' + a];
  return s && s.attempts > 0 ? s : null;
}
function isMastered(s) {
  return !!s && s.masteryScore >= MASTERED_SCORE && s.avgResponseTimeMs < MASTERED_MS;
}
function cellColor(s) {
  if (!s) return null;
  if (isMastered(s)) return '#39ff88';
  const t = Math.max(0, Math.min(1, s.masteryScore || 0));
  // dark red -> amber -> (almost) green
  let hue, light;
  if (t < 0.6) { hue = 352 + (40 + 8) * (t / 0.6); light = 22 + 22 * (t / 0.6); }
  else { hue = 40 + 80 * ((t - 0.6) / 0.4); light = 44 - 6 * ((t - 0.6) / 0.4); }
  return `hsl(${hue % 360} 85% ${light}%)`;
}
function ago(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  const d = Math.round(s / 86400);
  return d + (d === 1 ? ' day ago' : ' days ago');
}

export class ForemanLog {
  constructor(root, { synth }) {
    this.synth = synth;
    this.isOpen = false;
    this.root = root;
  }

  open({ facts, tableMastery, settings, autoTables }, { onSettingsChange, onReset } = {}) {
    if (this.isOpen) this.close(true);
    this.facts = facts || {};
    this.tm = tableMastery || [];
    this.settings = Object.assign({ autoCurriculum: true, enabledTables: DEFAULT_TABLES.slice() }, settings || {});
    // Tables the auto curriculum has unlocked right now: switching auto off starts from these.
    this.autoTables = Array.isArray(autoTables) && autoTables.length ? autoTables.slice() : null;
    this.settings.enabledTables = (this.settings.enabledTables || []).slice();
    this.onSettingsChange = onSettingsChange;
    this.onReset = onReset;
    this.sel = null;
    this.build();
    this.isOpen = true;
    safe(this.synth, 'uiOpen');
    requestAnimationFrame(() => this.scrim.classList.add('open'));
  }

  close(silent) {
    if (!this.isOpen) return;
    this.isOpen = false;
    const s = this.scrim;
    s.classList.remove('open');
    setTimeout(() => s.remove(), 260);
    if (!silent) safe(this.synth, 'uiClose');
  }

  build() {
    this.scrim = el('div', 'rf-log-scrim');
    const panel = el('section', 'rf-log', null, { role: 'dialog', 'aria-label': "Foreman's Log" });
    const head = el('div', 'rf-log-head');
    head.appendChild(icon('gear', 'rf-log-ico'));
    head.appendChild(el('span', 'rf-log-title', "FOREMAN'S LOG"));
    head.appendChild(el('span', 'rf-log-sub', 'Parent dashboard'));
    const close = button('rf-close', null, icon('close'));
    close.setAttribute('aria-label', 'Close');
    onPress(close, () => this.close());
    head.appendChild(close);
    panel.appendChild(head);

    const body = el('div', 'rf-log-body');
    // Left: heatmap
    const left = el('div', 'rf-log-left');
    this.grid = el('div', 'rf-heat');
    left.appendChild(this.grid);
    left.appendChild(this.legend());
    // Right: detail + stage
    const right = el('div', 'rf-log-right');
    this.detail = el('div', 'rf-detail');
    right.appendChild(this.detail);
    this.stage = el('div', 'rf-stage');
    right.appendChild(this.stage);
    this.resetBox = el('div', 'rf-reset');
    right.appendChild(this.resetBox);
    body.append(left, right);
    panel.appendChild(body);
    this.scrim.appendChild(panel);
    this.root.appendChild(this.scrim);
    this.scrim.addEventListener('pointerdown', (e) => { if (e.target === this.scrim) this.close(); });

    this.renderHeat();
    this.renderDetail();
    this.renderStage();
    this.renderReset(0);
  }

  legend() {
    const l = el('div', 'rf-legend');
    const bar = el('div', 'rf-legend-bar');
    l.appendChild(bar);
    const labels = el('div', 'rf-legend-lbl');
    labels.append(el('span', null, 'Needs practice'), el('span', null, 'Getting there'), el('span', null, 'Mastered (fast)'));
    l.appendChild(labels);
    const unseen = el('div', 'rf-legend-unseen');
    unseen.append(el('i', 'rf-swatch'), el('span', null, 'Not seen yet'));
    l.appendChild(unseen);
    return l;
  }

  renderHeat() {
    clear(this.grid);
    this.cells = {};
    this.grid.appendChild(el('div', 'rf-hh corner', '×'));
    for (const b of TABLES) this.grid.appendChild(el('div', 'rf-hh', b));
    for (const a of TABLES) {
      this.grid.appendChild(el('div', 'rf-hh', a));
      for (const b of TABLES) {
        const s = getStats(this.facts, a, b);
        const c = el('div', 'rf-cell' + (s ? '' : ' unseen') + (isMastered(s) ? ' mastered' : ''), a * b);
        const col = cellColor(s);
        if (col) c.style.background = col;
        onTap(c, () => { safe(this.synth, 'click'); this.select(a, b); });
        this.cells[a + 'x' + b] = c;
        this.grid.appendChild(c);
      }
    }
    if (this.sel) this.select(this.sel.a, this.sel.b, true);
  }

  select(a, b, quiet) {
    if (this.sel && this.cells[this.sel.a + 'x' + this.sel.b]) this.cells[this.sel.a + 'x' + this.sel.b].classList.remove('sel');
    this.sel = { a, b };
    this.cells[a + 'x' + b].classList.add('sel');
    if (!quiet) this.renderDetail();
  }

  renderDetail() {
    const d = this.detail;
    clear(d);
    if (!this.sel) {
      d.appendChild(el('div', 'rf-detail-hint', 'Tap a square to see how that fact is going.'));
      return;
    }
    const { a, b } = this.sel;
    d.appendChild(el('div', 'rf-detail-fact', `${a} × ${b} = ${a * b}`));
    const s = getStats(this.facts, a, b);
    if (!s) { d.appendChild(el('div', 'rf-detail-none', 'Not practiced yet')); return; }
    const acc = s.attempts ? Math.round((100 * s.correct) / s.attempts) : 0;
    const row = (k, v) => { const r = el('div', 'rf-stat'); r.append(el('span', 'k', k), el('span', 'v', v)); d.appendChild(r); };
    row('Attempts', s.attempts);
    row('Accuracy', acc + '%');
    row('Average time', (s.avgResponseTimeMs / 1000).toFixed(1) + ' s');
    row('Last seen', ago(s.lastSeen));
    if (isMastered(s)) d.appendChild(el('div', 'rf-detail-ok', 'Mastered!'));
  }

  emitSettings() {
    this.onSettingsChange && this.onSettingsChange(Object.assign({}, this.settings, { enabledTables: this.settings.enabledTables.slice() }));
  }

  renderStage() {
    const st = this.stage;
    clear(st);
    const auto = !!this.settings.autoCurriculum;
    st.appendChild(el('div', 'rf-sect', 'Stage selector'));
    const sw = button('rf-switch' + (auto ? ' on' : ''), 'Auto curriculum');
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(auto));
    sw.appendChild(el('i', 'rf-knob'));
    onTap(sw, () => {
      safe(this.synth, 'click');
      this.settings.autoCurriculum = !this.settings.autoCurriculum;
      if (!this.settings.autoCurriculum && this.autoTables) this.settings.enabledTables = this.autoTables.slice();
      this.emitSettings();
      this.renderStage();
    });
    st.appendChild(sw);
    st.appendChild(el('div', 'rf-sect-note', auto ? 'Tables unlock as the game levels up.' : 'Choose which tables appear in orders.'));
    const grid = el('div', 'rf-tiles' + (auto ? ' off' : ''));
    for (const t of TABLES) {
      const on = this.settings.enabledTables.includes(t);
      const m = Math.max(0, Math.min(1, Number(this.tm[t]) || 0));
      const tile = button('rf-tile' + (on ? ' on' : '') + (auto ? ' disabled' : ''), null);
      tile.setAttribute('aria-pressed', String(on));
      tile.appendChild(el('span', 'rf-tile-n', '×' + t));
      tile.appendChild(el('span', 'rf-tile-pct', Math.round(m * 100) + '%'));
      const bar = el('span', 'rf-tile-bar');
      const fill = el('i');
      fill.style.transform = `scaleX(${m})`;
      if (m >= 0.95) fill.classList.add('full');
      bar.appendChild(fill);
      tile.appendChild(bar);
      onTap(tile, () => {
        if (this.settings.autoCurriculum) return;
        const cur = this.settings.enabledTables;
        if (cur.includes(t)) {
          if (cur.length <= 1) {
            tile.classList.remove('nope'); void tile.offsetWidth; tile.classList.add('nope');
            this.note && (this.note.textContent = 'Keep at least one table on!');
            return;
          }
          this.settings.enabledTables = cur.filter((x) => x !== t);
        } else {
          this.settings.enabledTables = cur.concat([t]).sort((x, y) => x - y);
        }
        safe(this.synth, 'click');
        this.emitSettings();
        this.renderStage();
      });
      grid.appendChild(tile);
    }
    st.appendChild(grid);
    this.note = el('div', 'rf-sect-note warn', '');
    st.appendChild(this.note);
  }

  renderReset(step) {
    const r = this.resetBox;
    clear(r);
    clearTimeout(this.resetTimer);
    if (step === 0) {
      const b = button('rf-reset-btn', 'Reset progress');
      onTap(b, () => { safe(this.synth, 'click'); this.renderReset(1); });
      r.appendChild(b);
    } else if (step === 1) {
      r.appendChild(el('div', 'rf-reset-warn', 'This erases all practice history. Are you sure?'));
      const row = el('div', 'rf-reset-row');
      const yes = button('rf-reset-yes', 'Yes, erase it');
      const no = button('rf-reset-no', 'Keep it');
      onTap(yes, () => {
        safe(this.synth, 'click');
        this.onReset && this.onReset();
        this.facts = {};
        this.tm = [];
        this.renderHeat();
        this.renderDetail();
        this.renderStage();
        this.renderReset(2);
      });
      onTap(no, () => { safe(this.synth, 'click'); this.renderReset(0); });
      row.append(yes, no);
      r.appendChild(row);
      this.resetTimer = setTimeout(() => this.isOpen && this.renderReset(0), 8000);
    } else {
      r.appendChild(el('div', 'rf-reset-done', 'Progress reset.'));
    }
  }
}
