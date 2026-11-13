// Tycoon shop (replacement for shop.js). Same export name: Shop.
// View model + action contract: docs/SHOP_DESIGN.md sections 9 and 11. The UI never computes prices.
import { el, svg, button, onPress, onTap, safe, clear } from './dom.js';
import { icon } from './icons.js';
import { icon2 } from './icons2.js';
import { formatBolts, formatBoost } from '../core/format.js';
import { HatchOverlay } from './hatch.js';
import { petCanvas, loadPets, rarityInfo, RARITY } from './petart.js';

const TABS = [
  { id: 'upgrades', label: 'Upgrades', icon: () => icon2('up') },
  { id: 'build', label: 'Build', icon: () => icon2('build') },
  { id: 'pets', label: 'Pets', icon: () => icon2('paw') },
  { id: 'style', label: 'Style', icon: () => icon2('brush') },
  { id: 'drones', label: 'Drones', icon: () => icon('drone') },
  { id: 'rebirth', label: 'Rebirth', icon: () => icon2('rebirth') },
];

const UP_ICON = { forge: 'forge', belt: 'belt', magnet: 'magnet', battery: 'battery', combo: 'combo' };
const REASONS = {
  full: 'Your pet box is full!',
  inventoryFull: 'Your pet box is full!',
  poor: 'Not enough bolts yet!',
  funds: 'Not enough bolts yet!',
  locked: 'That one is still locked!',
  equipped: 'Unequip it first!',
  slots: 'No free pet slots!',
  max: 'Already maxed out!',
};
const GUARD_MS = 450;

const fmtMult = (m) => '×' + (Math.round((Number(m) || 1) * 10) / 10);
const pct = (c) => { c = Number(c) || 0; return (c <= 1 ? Math.round(c * 100) : Math.round(c)) + '%'; };

export class Shop {
  constructor(root, { synth } = {}) {
    this.root = root;
    this.synth = synth || {};
    this.isOpen = false;
    this.view = null;
    this.onAction = null;
    this.tab = 'upgrades';
    this.sel = null;        // selected pet uid
    this.sellArm = null;    // uid armed for sell confirm
    this.scroll = {};       // per-tab scrollTop
    this._guards = new Map();
    this.hatch = new HatchOverlay(root, { synth: this.synth });

    this.scrim = el('div', 'sx-scrim');
    this.drawer = el('aside', 'sx-shop', null, { role: 'dialog', 'aria-label': 'Shop' });
    const head = el('div', 'sx-head');
    head.appendChild(icon('shop', 'sx-head-ico'));
    head.appendChild(el('span', 'sx-title', 'SHOP'));
    this.multEl = el('span', 'sx-mult');
    head.appendChild(this.multEl);
    this.balance = el('span', 'sx-balance');
    head.appendChild(this.balance);
    const close = button('rf-close', null, icon('close'));
    close.setAttribute('aria-label', 'Close shop');
    onPress(close, () => this.close());
    head.appendChild(close);

    this.tabsEl = el('nav', 'sx-tabs');
    this.tabBtns = {};
    for (const t of TABS) {
      const b = button('sx-tab', t.label, t.icon());
      b.dataset.tab = t.id;
      b.appendChild(el('i', 'sx-dot'));
      onPress(b, () => { safe(this.synth, 'click'); this.setTab(t.id); });
      this.tabBtns[t.id] = b;
      this.tabsEl.appendChild(b);
    }
    this.body = el('div', 'sx-body');
    this.msg = el('div', 'sx-msg');
    this.confirm = el('div', 'sx-confirm');
    this.drawer.append(head, this.tabsEl, this.body, this.msg, this.confirm);
    this.scrim.appendChild(this.drawer);
    this.scrim.addEventListener('pointerdown', (e) => { if (e.target === this.scrim) this.close(); });
    root.appendChild(this.scrim);
    loadPets();
  }

  // ---------- public API ----------
  open(view, onAction) {
    this.onAction = onAction;
    this.view = view || this.view;
    if (view && view.tab && TABS.some((t) => t.id === view.tab)) this.tab = view.tab;
    this.render(true);
    if (!this.isOpen) {
      this.isOpen = true;
      this.scrim.classList.add('open');
      safe(this.synth, 'uiOpen');
    }
  }

  refresh(view) {
    if (view) this.view = view;
    if (this.isOpen) this.render(false);
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.scrim.classList.remove('open');
    this.hideConfirm();
    safe(this.synth, 'uiClose');
  }

  setTab(id) {
    if (this.tab === id) return;
    this.scroll[this.tab] = this.body.scrollTop;
    this.tab = id;
    this.render(true);
  }

  // ---------- plumbing ----------
  _guard(id) { this._guards.set(id, performance.now() + GUARD_MS); }
  _guarded(id) { const t = this._guards.get(id); return !!t && performance.now() < t; }

  say(text, kind = 'warn') {
    this.msg.textContent = text;
    this.msg.className = 'sx-msg show ' + kind;
    clearTimeout(this._msgT);
    this._msgT = setTimeout(() => { this.msg.className = 'sx-msg'; }, 2200);
  }

  /** Send an action. Returns the result (or null when guarded). */
  _do(action, guardId, node) {
    if (guardId && this._guarded(guardId)) return null;
    safe(this.synth, 'click');
    if (guardId) this._guard(guardId);
    let r;
    try { r = this.onAction ? this.onAction(action) : { ok: true }; } catch (_) { r = { ok: false }; }
    if (!r) r = { ok: true };
    if (!r.ok) {
      safe(this.synth, 'wrong');
      if (node) { node.classList.remove('nope'); void node.offsetWidth; node.classList.add('nope'); }
      const rs = r.reason;
      this.say(REASONS[rs] || (typeof rs === 'string' && rs.indexOf(' ') > 0 ? rs : "Can't do that yet!"));
    }
    return r;
  }

  _nope(node) {
    safe(this.synth, 'wrong');
    node.classList.remove('nope'); void node.offsetWidth; node.classList.add('nope');
  }

  costChip(cost, cls) {
    const c = el('span', 'sx-cost ' + (cls || ''));
    c.appendChild(icon('bolt'));
    c.appendChild(el('span', null, formatBolts(cost)));
    return c;
  }

  /** Buy-style button: green/gold with cost when affordable, "Need N more" when not. */
  buyBtn(label, cost, affordable, onGo, extra) {
    const need = Math.max(0, Math.ceil(cost - (this.view ? this.view.bolts : 0)));
    const b = button('sx-buy' + (affordable ? '' : ' poor') + (extra ? ' ' + extra : ''));
    b.setAttribute('aria-disabled', affordable ? 'false' : 'true');
    if (affordable) {
      b.appendChild(el('span', 'sx-buy-l', label));
      b.appendChild(this.costChip(cost));
    } else {
      b.appendChild(el('span', 'sx-buy-l', 'Need ' + formatBolts(need) + ' more'));
    }
    onTap(b, () => { if (!affordable) { this._nope(b); return; } onGo(b); });
    return b;
  }

  badge(text, cls) {
    const b = el('span', 'sx-badge ' + (cls || ''));
    if (cls === 'on') b.appendChild(icon('check'));
    b.appendChild(el('span', null, text));
    return b;
  }

  // ---------- render ----------
  render(resetScroll) {
    const v = this.view;
    if (!v) return;
    const keep = resetScroll ? (this.scroll[this.tab] || 0) : this.body.scrollTop;
    clear(this.balance);
    this.balance.appendChild(icon('bolt', 'sx-bolt-ico'));
    this.balance.appendChild(el('span', null, formatBolts(v.bolts)));
    this.multEl.textContent = v.mult > 1 ? formatBoost(v.mult - 1) + ' bolts' : '';
    this.multEl.style.display = v.mult > 1 ? '' : 'none';
    const dots = this.dots(v);
    for (const t of TABS) {
      this.tabBtns[t.id].classList.toggle('active', t.id === this.tab);
      this.tabBtns[t.id].classList.toggle('has', !!dots[t.id]);
    }
    clear(this.body);
    this.body.classList.remove('r-upgrades', 'r-build', 'r-pets', 'r-style', 'r-drones', 'r-rebirth');
    this.body.classList.add('r-' + this.tab);
    const fn = { upgrades: this.tUpgrades, build: this.tBuild, pets: this.tPets, style: this.tStyle, drones: this.tDrones, rebirth: this.tRebirth }[this.tab];
    fn.call(this, v);
    this.body.scrollTop = keep;
  }

  dots(v) {
    const d = {};
    d.upgrades = (v.upgrades || []).some((u) => u.cost != null && u.level < u.max && u.affordable);
    d.build = !!(v.build && (v.build.items || []).some((i) => i.state === 'next' && i.affordable));
    const p = v.pets || {};
    d.pets = (p.eggs || []).some((e) => e.unlocked && e.affordable) || (p.goldenReady || []).length > 0;
    d.style = (v.style || []).some((s) => !s.owned && s.affordable);
    d.drones = (v.drones || []).some((x) => !x.locked && !x.owned && v.bolts >= x.cost);
    d.rebirth = !!(v.rebirth && v.rebirth.can);
    return d;
  }

  sect(text, right) {
    const s = el('div', 'sx-sect');
    s.appendChild(el('span', null, text));
    if (right) s.appendChild(el('span', 'sx-sect-r', right));
    return s;
  }

  // ---------- Upgrades ----------
  tUpgrades(v) {
    for (const u of v.upgrades || []) {
      const maxed = u.cost == null || u.level >= u.max;
      const c = el('div', 'sx-card up' + (maxed ? ' maxed' : ''));
      const ic = el('div', 'sx-up-ico');
      ic.appendChild(icon2(UP_ICON[u.id] || 'up'));
      c.appendChild(ic);
      const info = el('div', 'sx-info');
      const nm = el('div', 'sx-name');
      nm.appendChild(el('span', null, u.name));
      nm.appendChild(el('span', 'sx-lv', maxed ? 'MAX' : 'Lv ' + u.level + '/' + u.max));
      info.appendChild(nm);
      info.appendChild(el('div', 'sx-desc', u.desc));
      const pips = el('div', 'sx-pips');
      for (let i = 0; i < u.max; i++) pips.appendChild(el('i', i < u.level ? 'on' : ''));
      info.appendChild(pips);
      const fx = el('div', 'sx-fx');
      fx.appendChild(el('span', 'now', u.effectText || ''));
      if (!maxed && u.nextEffectText) {
        fx.appendChild(el('span', 'arr', '➜'));
        fx.appendChild(el('span', 'next', u.nextEffectText));
      }
      info.appendChild(fx);
      c.appendChild(info);
      const act = el('div', 'sx-act');
      if (maxed) act.appendChild(this.badge('MAXED', 'max'));
      else act.appendChild(this.buyBtn('UPGRADE', u.cost, !!u.affordable, (b) => this._do({ type: 'upgrade', id: u.id }, 'up:' + u.id, b)));
      c.appendChild(act);
      this.body.appendChild(c);
    }
  }

  // ---------- Build ----------
  tBuild(v) {
    const b = v.build || { items: [], done: 0, total: 0 };
    const prog = el('div', 'sx-progress');
    prog.appendChild(el('div', 'sx-progress-t', 'FACTORY  ' + b.done + ' / ' + b.total));
    const bar = el('div', 'sx-bar');
    const fill = el('i');
    fill.style.transform = 'scaleX(' + (b.total ? b.done / b.total : 0) + ')';
    bar.appendChild(fill);
    prog.appendChild(bar);
    this.body.appendChild(prog);
    (b.items || []).forEach((it, i) => {
      const c = el('div', 'sx-card build ' + it.state);
      const n = el('div', 'sx-build-n');
      if (it.state === 'owned') n.appendChild(icon('check')); else n.appendChild(el('span', null, i + 1));
      c.appendChild(n);
      const info = el('div', 'sx-info');
      info.appendChild(el('div', 'sx-name', it.name));
      const d = el('div', 'sx-desc');
      d.appendChild(icon('bolt', 'sx-mini'));
      d.appendChild(el('span', null, '+' + formatBolts(it.flat) + ' bolts every order'));
      info.appendChild(d);
      c.appendChild(info);
      const act = el('div', 'sx-act');
      if (it.state === 'owned') act.appendChild(this.badge('BUILT', 'on'));
      else if (it.state === 'next') act.appendChild(this.buyBtn('BUILD', it.cost, !!it.affordable, (btn) => this._do({ type: 'build', id: it.id }, 'build:' + it.id, btn)));
      else { const l = el('div', 'sx-lock'); l.appendChild(icon('lock')); l.appendChild(el('span', null, 'Build the one above first')); act.appendChild(l); }
      c.appendChild(act);
      this.body.appendChild(c);
    });
  }

  // ---------- Pets ----------
  tPets(v) {
    const p = v.pets || { eggs: [], inventory: [], goldenReady: [], index: [], slots: 3, equippedCount: 0, invCount: 0, invMax: 60 };
    // Eggs
    this.body.appendChild(this.sect('EGGS', 'Odds shown on every egg'));
    const eggs = el('div', 'sx-eggs');
    for (const e of p.eggs || []) eggs.appendChild(this.eggCard(e, p));
    this.body.appendChild(eggs);

    // Golden craft
    if ((p.goldenReady || []).length) {
      this.body.appendChild(this.sect('GOLDEN CRAFT', '5 of the same = 1 golden (×3 boost)'));
      for (const g of p.goldenReady) {
        const inv = (p.inventory || []).find((x) => x.id === g.petId) || {};
        const c = el('div', 'sx-card golden-craft');
        const pc = el('div', 'sx-pet-wrap golden');
        pc.appendChild(petCanvas(70, { id: g.petId, rarity: inv.rarity, golden: true }));
        c.appendChild(pc);
        const info = el('div', 'sx-info');
        info.appendChild(el('div', 'sx-name', 'Golden ' + g.name));
        info.appendChild(el('div', 'sx-desc', 'You have ' + g.have + ' — trade 5 for 1 shiny golden pet!'));
        c.appendChild(info);
        const act = el('div', 'sx-act');
        const b = button('sx-buy gold', 'CRAFT', icon('star'));
        onTap(b, () => this._do({ type: 'golden', petId: g.petId }, 'golden:' + g.petId, b));
        act.appendChild(b);
        c.appendChild(act);
        this.body.appendChild(c);
      }
    }

    // Inventory
    this.body.appendChild(this.sect('MY PETS  ' + p.invCount + '/' + p.invMax, 'Equipped ' + p.equippedCount + '/' + p.slots));
    const bar = el('div', 'sx-invbar');
    const best = button('sx-best', 'EQUIP BEST', icon2('up'));
    onTap(best, () => this._do({ type: 'equipBest' }, 'equipBest', best));
    bar.appendChild(best);
    this.body.appendChild(bar);
    const inv = (p.inventory || []).slice().sort((a, b) => (b.equipped - a.equipped) || (rarityInfo(b.rarity).rank - rarityInfo(a.rarity).rank) || (b.boost - a.boost));
    if (this.sel != null && !inv.some((x) => x.uid === this.sel)) { this.sel = null; this.sellArm = null; }
    if (this.sel != null) this.body.appendChild(this.petDetail(inv.find((x) => x.uid === this.sel)));
    if (!inv.length) this.body.appendChild(el('div', 'sx-empty', 'No pets yet — hatch an egg!'));
    const grid = el('div', 'sx-inv');
    for (const pet of inv) grid.appendChild(this.petTile(pet));
    this.body.appendChild(grid);

    // Index
    const found = (p.index || []).filter((x) => x.found).length;
    this.body.appendChild(this.sect('PET INDEX', found + ' / ' + (p.index || []).length + ' found'));
    const idx = el('div', 'sx-index');
    for (const x of p.index || []) {
      const info = rarityInfo(x.rarity);
      const t = el('div', 'sx-idx r-' + x.rarity + (x.found ? ' found' : ''));
      t.style.setProperty('--rc', info.color);
      t.appendChild(petCanvas(52, { id: x.id, rarity: x.rarity, silhouette: !x.found }));
      if (!x.found) t.appendChild(el('span', 'sx-q', '?'));
      t.appendChild(el('div', 'sx-idx-n', x.found ? x.name : '???'));
      idx.appendChild(t);
    }
    this.body.appendChild(idx);
  }

  eggCard(e, p) {
    const full = p.invCount >= p.invMax;
    const c = el('div', 'sx-card egg' + (e.unlocked ? '' : ' locked'));
    const top = el('div', 'sx-egg-top');
    const eg = el('div', 'sx-egg egg-' + e.id);
    eg.appendChild(el('i', 'sx-egg-spot a')); eg.appendChild(el('i', 'sx-egg-spot b')); eg.appendChild(el('i', 'sx-egg-spot c'));
    top.appendChild(eg);
    const nm = el('div', 'sx-egg-nm');
    nm.appendChild(el('div', 'sx-name', e.name));
    if (e.unlocked) nm.appendChild(this.costChip(e.cost, e.affordable ? '' : 'short'));
    top.appendChild(nm);
    c.appendChild(top);
    const odds = el('div', 'sx-odds');
    for (const o of e.odds || []) {
      const info = rarityInfo(o.rarity);
      const r = el('div', 'sx-odd');
      r.style.setProperty('--rc', info.color);
      r.appendChild(el('i', 'sx-odd-dot'));
      r.appendChild(el('span', 'sx-odd-n', e.unlocked ? o.name : '???'));
      r.appendChild(el('span', 'sx-odd-p', pct(o.chance)));
      r.appendChild(el('span', 'sx-odd-b', formatBoost(o.boost)));
      odds.appendChild(r);
    }
    c.appendChild(odds);
    if (!e.unlocked) {
      const l = el('div', 'sx-lock');
      l.appendChild(icon('lock'));
      l.appendChild(el('span', null, e.unlockText || 'Locked'));
      c.appendChild(l);
    } else if (full) {
      const b = button('sx-buy poor', 'Pet box full!');
      onTap(b, () => { this._nope(b); this.say('Sell or golden-craft some pets first!'); });
      c.appendChild(b);
    } else {
      c.appendChild(this.buyBtn('HATCH', e.cost, !!e.affordable, (b) => this.doHatch(e, b)));
    }
    return c;
  }

  doHatch(e, node) {
    const r = this._do({ type: 'hatch', egg: e.id }, 'hatch', node);
    if (r && r.ok && r.pet) this.hatch.play(r.pet, { egg: e.id });
  }

  petTile(pet) {
    const info = rarityInfo(pet.rarity);
    const t = el('div', 'sx-tile r-' + pet.rarity + (pet.golden ? ' golden' : '') + (pet.equipped ? ' equipped' : '') + (this.sel === pet.uid ? ' sel' : ''));
    t.style.setProperty('--rc', pet.golden ? '#ffd34d' : info.color);
    t.appendChild(petCanvas(56, { id: pet.id, rarity: pet.rarity, golden: pet.golden }));
    t.appendChild(el('div', 'sx-tile-b', formatBoost(pet.boost)));
    if (pet.equipped) { const q = el('span', 'sx-eq'); q.appendChild(icon('check')); t.appendChild(q); }
    onTap(t, () => { safe(this.synth, 'click'); this.sel = this.sel === pet.uid ? null : pet.uid; this.sellArm = null; this.render(false); });
    return t;
  }

  petDetail(pet) {
    const info = rarityInfo(pet.rarity);
    const c = el('div', 'sx-detail r-' + pet.rarity + (pet.golden ? ' golden' : ''));
    c.style.setProperty('--rc', pet.golden ? '#ffd34d' : info.color);
    const pw = el('div', 'sx-pet-wrap');
    pw.appendChild(petCanvas(110, { id: pet.id, rarity: pet.rarity, golden: pet.golden, animate: true }));
    c.appendChild(pw);
    const inf = el('div', 'sx-info');
    inf.appendChild(el('div', 'sx-rar', (pet.golden ? 'GOLDEN ' : '') + info.name));
    inf.appendChild(el('div', 'sx-name', pet.name));
    inf.appendChild(el('div', 'sx-boost', formatBoost(pet.boost) + ' bolts'));
    c.appendChild(inf);
    const act = el('div', 'sx-act col');
    const eq = button('sx-equip' + (pet.equipped ? ' on' : ''), pet.equipped ? 'UNEQUIP' : 'EQUIP');
    onTap(eq, () => this._do({ type: pet.equipped ? 'unequipPet' : 'equipPet', uid: pet.uid }, 'pet:' + pet.uid, eq));
    act.appendChild(eq);
    const armed = this.sellArm === pet.uid;
    const sell = button('sx-sell' + (pet.equipped ? ' poor' : '') + (armed ? ' armed' : ''));
    if (pet.equipped) sell.appendChild(el('span', 'sx-buy-l', 'Unequip to sell'));
    else {
      sell.appendChild(el('span', 'sx-buy-l', armed ? 'SURE? SELL' : 'SELL'));
      sell.appendChild(this.costChip(pet.sellValue));
    }
    onTap(sell, () => {
      if (pet.equipped) { this._nope(sell); return; }
      if (!armed) { safe(this.synth, 'click'); this.sellArm = pet.uid; this.render(false); clearTimeout(this._armT); this._armT = setTimeout(() => { this.sellArm = null; if (this.isOpen) this.render(false); }, 3000); return; }
      const r = this._do({ type: 'sellPet', uid: pet.uid }, 'pet:' + pet.uid, sell);
      if (r && r.ok) { this.sel = null; this.sellArm = null; }
    });
    act.appendChild(sell);
    c.appendChild(act);
    return c;
  }

  // ---------- Style ----------
  tStyle(v) {
    const groups = [['belt', 'BELTS'], ['trail', 'TRAILS'], ['theme', 'FACTORY THEMES']];
    for (const [kind, title] of groups) {
      const items = (v.style || []).filter((s) => s.kind === kind);
      if (!items.length) continue;
      this.body.appendChild(this.sect(title));
      const g = el('div', 'sx-styles');
      for (const s of items) {
        const c = el('div', 'sx-card style' + (s.equipped ? ' equipped' : ''));
        c.appendChild(this.stylePreview(s));
        c.appendChild(el('div', 'sx-name', s.name));
        const act = el('div', 'sx-act wide');
        if (s.equipped) act.appendChild(this.badge('EQUIPPED', 'on'));
        else if (s.owned) {
          const b = button('sx-equip', 'EQUIP');
          onTap(b, () => this._do({ type: 'style', key: s.key, action: 'equip' }, 'style:' + s.key, b));
          act.appendChild(b);
        } else act.appendChild(this.buyBtn('BUY', s.cost, !!s.affordable, (b) => this._do({ type: 'style', key: s.key, action: 'buy' }, 'style:' + s.key, b)));
        c.appendChild(act);
        g.appendChild(c);
      }
      this.body.appendChild(g);
    }
  }

  stylePreview(s) {
    const p = el('div', 'sx-pv pv-' + s.kind + ' pv-' + s.kind + '-' + s.id);
    if (s.kind === 'belt') {
      p.append(el('i', 'pv-belt-track'), el('i', 'pv-belt-stripe'), el('i', 'pv-belt-chev'));
    } else if (s.kind === 'trail') {
      p.append(el('i', 'pv-trail'), el('i', 'pv-orb'));
      for (let i = 0; i < 3; i++) p.appendChild(el('i', 'pv-spark s' + i));
    } else {
      p.append(el('i', 'pv-th-sun'), el('i', 'pv-th-hill'), el('i', 'pv-th-gear'));
    }
    return p;
  }

  // ---------- Drones (existing behaviour, incl. 450 ms guard) ----------
  tDrones(v) {
    const items = v.drones || [];
    if (!items.length) this.body.appendChild(el('div', 'sx-empty', 'No drones yet.'));
    for (const it of items) this.body.appendChild(this.droneCard(it, v));
  }

  droneCard(it, v) {
    const c = el('div', 'sx-card drone' + (it.locked ? ' locked' : '') + (it.owned ? ' owned' : '') + (it.equipped ? ' equipped' : ''));
    const pv = el('div', 'sx-pv pv-drone' + (it.locked ? ' dim' : ''));
    pv.appendChild(icon('drone', 'pv-drone-ico'));
    const m = /(\d+)/.exec(String(it.id || ''));
    if (m) pv.appendChild(el('span', 'pv-drone-tag', '×' + m[1]));
    c.appendChild(pv);
    const info = el('div', 'sx-info');
    info.appendChild(el('div', 'sx-name', it.name));
    info.appendChild(el('div', 'sx-desc', it.desc));
    if (it.locked) {
      const r = el('div', 'sx-lock'); r.appendChild(icon('lock')); r.appendChild(el('span', null, it.lockReason || 'Locked')); info.appendChild(r);
    }
    c.appendChild(info);
    const act = el('div', 'sx-act');
    const send = (action, b) => this._do({ type: 'drone', id: it.id, action }, 'drone:' + it.id, b);
    if (it.locked) act.appendChild(this.badge('LOCKED', 'locked'));
    else if (!it.owned) act.appendChild(this.buyBtn('BUY', it.cost, v.bolts >= it.cost, (b) => send('buy', b)));
    else {
      const eq = !!it.equipped;
      if (eq) act.appendChild(this.badge(it.kind === 'drone' ? 'ACTIVE' : 'EQUIPPED', 'on'));
      const b = button(eq ? 'sx-equip on' : 'sx-equip', eq ? 'UNEQUIP' : 'EQUIP');
      onTap(b, () => send(eq ? 'unequip' : 'equip', b));
      act.appendChild(b);
    }
    c.appendChild(act);
    return c;
  }

  // ---------- Rebirth ----------
  tRebirth(v) {
    const r = v.rebirth || {};
    const hero = el('div', 'sx-rb-hero' + (r.can ? ' ready' : ''));
    const star = el('div', 'sx-rb-star');
    star.appendChild(icon2('rebirth'));
    hero.appendChild(star);
    hero.appendChild(el('div', 'sx-rb-count', 'Rebirths: ' + (r.rebirths || 0)));
    const gain = el('div', 'sx-rb-gain');
    const rows = [];
    if (typeof r.mult === 'number' && typeof r.nextMult === 'number') rows.push(['Rebirth bonus', fmtMult(r.mult) + ' ➜ ' + fmtMult(r.nextMult)]);
    if (typeof r.slots === 'number' && typeof r.nextSlots === 'number') rows.push(['Pet slots', r.slots + ' ➜ ' + r.nextSlots]);
    for (const [k, val] of rows) {
      const row = el('div', 'sx-rb-row');
      row.append(el('span', 'k', k), el('span', 'v', val));
      gain.appendChild(row);
    }
    hero.appendChild(gain);
    const prog = el('div', 'sx-progress');
    prog.appendChild(el('div', 'sx-progress-t', 'FACTORY BUILT  ' + r.buildsDone + ' / ' + r.buildsTotal));
    const bar = el('div', 'sx-bar');
    const fill = el('i');
    fill.style.transform = 'scaleX(' + (r.buildsTotal ? r.buildsDone / r.buildsTotal : 0) + ')';
    bar.appendChild(fill);
    prog.appendChild(bar);
    hero.appendChild(prog);
    const b = button('sx-rebirth' + (r.can ? '' : ' poor'), r.can ? 'REBIRTH!' : 'Build everything first', icon2('rebirth'));
    onTap(b, () => { if (!r.can) { this._nope(b); this.say('Build all ' + r.buildsTotal + ' factory items to rebirth!'); return; } safe(this.synth, 'click'); this.showConfirm(r); });
    hero.appendChild(b);
    this.body.appendChild(hero);
    const lists = el('div', 'sx-rb-lists');
    lists.appendChild(this.rbList('YOU KEEP', r.keeps, 'keep'));
    lists.appendChild(this.rbList('RESETS', r.resets, 'reset'));
    this.body.appendChild(lists);
  }

  rbList(title, arr, cls) {
    const c = el('div', 'sx-rb-list ' + cls);
    c.appendChild(el('div', 'sx-rb-lt', title));
    for (const t of arr || []) {
      const li = el('div', 'sx-rb-li');
      li.appendChild(icon(cls === 'keep' ? 'check' : 'close'));
      li.appendChild(el('span', null, t));
      c.appendChild(li);
    }
    return c;
  }

  showConfirm(r) {
    const c = this.confirm;
    clear(c);
    const card = el('div', 'sx-confirm-card');
    card.appendChild(el('div', 'sx-confirm-t', 'REBIRTH?'));
    card.appendChild(el('div', 'sx-confirm-s', 'Start fresh, but become much stronger!'));
    const cols = el('div', 'sx-rb-lists');
    cols.appendChild(this.rbList('YOU KEEP', r.keeps, 'keep'));
    cols.appendChild(this.rbList('RESETS', r.resets, 'reset'));
    card.appendChild(cols);
    card.appendChild(el('div', 'sx-confirm-gain', 'Rebirth bonus ' + fmtMult(r.nextMult) + ' forever' + (r.nextSlots > r.slots ? ' + 1 pet slot!' : '!')));
    const row = el('div', 'sx-confirm-row');
    const yes = button('sx-rebirth', 'YES, REBIRTH!', icon2('rebirth'));
    const no = button('sx-equip', 'Not yet');
    onPress(no, () => { safe(this.synth, 'click'); this.hideConfirm(); });
    onPress(yes, () => {
      if (this._guarded('rebirth')) return;
      const res = this._do({ type: 'rebirth' }, 'rebirth', yes);
      if (res && res.ok) { this.hideConfirm(); safe(this.synth, 'levelUp'); this.say('REBORN! Bolts boosted forever!', 'good'); }
    });
    row.append(yes, no);
    card.appendChild(row);
    c.appendChild(card);
    c.classList.add('open');
  }

  hideConfirm() {
    this.confirm.classList.remove('open');
    clear(this.confirm);
  }
}
void svg; void RARITY;
