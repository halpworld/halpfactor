// Daily chest popup.
import { el, button, onPress, safe, clear, reducedMotion } from './dom.js';
import { icon } from './icons.js';
import { icon2 } from './icons2.js';
import { formatBolts } from '../core/format.js';

export class DailyChest {
  constructor(root, { synth, hatch } = {}) {
    this.root = root;
    this.synth = synth || {};
    this.hatch = hatch || null;
    this.cur = null;
  }

  get isOpen() { return !!this.cur; }

  /**
   * data: { day, streak, rewards:[{day, bolts|egg}], claimable }
   * onClaim() -> { ok, bolts?, pet?, egg? }
   */
  show(data, onClaim) {
    this.close(true);
    const day = data.day || 1;
    const claimable = !!data.claimable;
    const scrim = el('div', 'sx-daily-scrim');
    const card = el('section', 'sx-daily', null, { role: 'dialog', 'aria-label': 'Daily chest' });
    const head = el('div', 'sx-daily-head');
    const chest = el('div', 'sx-chest' + (claimable ? ' glow' : ''));
    chest.appendChild(icon2('chest'));
    head.appendChild(chest);
    const ht = el('div', 'sx-daily-ht');
    ht.appendChild(el('div', 'sx-daily-title', 'DAILY CHEST'));
    ht.appendChild(el('div', 'sx-daily-sub', claimable ? 'Day ' + day + ' reward is ready!' : 'Come back tomorrow for the next one!'));
    head.appendChild(ht);
    const close = button('rf-close', null, icon('close'));
    close.setAttribute('aria-label', 'Close');
    onPress(close, () => { safe(this.synth, 'click'); this.close(); });
    head.appendChild(close);
    card.appendChild(head);

    const row = el('div', 'sx-days');
    for (const r of data.rewards || []) {
      const claimed = claimable ? r.day < day : r.day <= day;
      const today = claimable && r.day === day;
      const d = el('div', 'sx-day' + (claimed ? ' claimed' : '') + (today ? ' today' : '') + (r.egg ? ' egg' : ''));
      d.appendChild(el('div', 'sx-day-n', 'DAY ' + r.day));
      const body = el('div', 'sx-day-body');
      if (r.egg) {
        body.appendChild(el('div', 'sx-egg mini egg-' + (typeof r.egg === 'string' ? r.egg : 'basic')));
        body.appendChild(el('div', 'sx-day-amt', 'FREE EGG'));
      } else {
        body.appendChild(icon('bolt', 'sx-day-bolt'));
        body.appendChild(el('div', 'sx-day-amt', formatBolts(r.bolts)));
      }
      d.appendChild(body);
      if (claimed) { const c = el('div', 'sx-day-check'); c.appendChild(icon('check')); d.appendChild(c); }
      row.appendChild(d);
    }
    card.appendChild(row);

    const foot = el('div', 'sx-daily-foot');
    card.appendChild(foot);
    if (claimable) {
      const claim = button('sx-claim', 'CLAIM!', icon('bolt'));
      onPress(claim, () => {
        if (this._busy) return;
        this._busy = true;
        safe(this.synth, 'click');
        let res = null;
        try { res = onClaim ? onClaim() : { ok: true }; } catch (_) { res = { ok: false }; }
        if (!res) res = { ok: true };
        if (!res.ok) { this._busy = false; claim.classList.add('nope'); setTimeout(() => claim.classList.remove('nope'), 400); return; }
        this._claimed(card, foot, res);
      });
      foot.appendChild(claim);
    } else {
      foot.appendChild(el('div', 'sx-daily-wait', 'See you tomorrow, Foreman!'));
    }
    scrim.appendChild(card);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) { safe(this.synth, 'click'); this.close(); } });
    this.root.appendChild(scrim);
    this.cur = scrim;
    this._busy = false;
    safe(this.synth, 'uiOpen');
    requestAnimationFrame(() => scrim.classList.add('open'));
  }

  _claimed(card, foot, res) {
    clear(foot);
    card.classList.add('claimed');
    if (res.pet && this.hatch) {
      foot.appendChild(el('div', 'sx-daily-wait', 'Your egg is hatching!'));
      setTimeout(() => {
        this.close(true);
        this.hatch.play(res.pet, { egg: res.egg || 'basic' });
      }, reducedMotion() ? 100 : 500);
      return;
    }
    safe(this.synth, 'coin');
    const win = el('div', 'sx-daily-win');
    win.appendChild(icon('bolt', 'sx-win-bolt'));
    win.appendChild(el('span', null, '+' + formatBolts(res.bolts || 0)));
    foot.appendChild(win);
    for (let i = 1; i <= 3; i++) setTimeout(() => safe(this.synth, 'coin'), i * 160);
    const ok = button('sx-claim', 'AWESOME!');
    onPress(ok, () => { safe(this.synth, 'click'); this.close(); });
    foot.appendChild(ok);
  }

  close(silent) {
    const s = this.cur;
    if (!s) return;
    this.cur = null;
    s.classList.remove('open');
    setTimeout(() => s.remove(), 260);
    if (!silent) safe(this.synth, 'uiClose');
  }
}
