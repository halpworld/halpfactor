// Stub UI: plain DOM buttons instead of the real keypad. Exposes pending
// prompts on `ui.pending` so the harness (or a test script) can answer them.
export function makeUI(host, bus, log) {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:14px system-ui;color:#e8f4ff';
  host.appendChild(root);
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:8px;top:8px;background:rgba(0,0,0,.6);padding:6px 10px;border-radius:8px;pointer-events:auto';
  root.appendChild(hud);
  const btn = (label, fn, parent) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:2px;padding:8px 10px;font:14px system-ui;pointer-events:auto';
    b.onclick = fn;
    parent.appendChild(b);
    return b;
  };
  const textDiv = (text) => {
    const d = document.createElement('div');
    d.textContent = text;
    return d;
  };
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;display:none;background:rgba(10,20,50,.92);border:2px solid #22f0ff;border-radius:12px;padding:10px;pointer-events:auto;transform:translate(-50%,-110%)';
  root.appendChild(box);
  const toast = document.createElement('div');
  toast.style.cssText = 'position:absolute;left:50%;top:100px;transform:translateX(-50%);background:#300;border:1px solid #f55;padding:8px 14px;border-radius:8px;display:none';
  root.appendChild(toast);
  const tut = document.createElement('div');
  tut.style.cssText = 'position:absolute;border:3px dashed #ffd34d;border-radius:12px;display:none;pointer-events:none';
  const tutText = document.createElement('div');
  tutText.style.cssText = 'position:absolute;left:50%;bottom:20px;transform:translateX(-50%);background:#222a;padding:8px 14px;border-radius:8px;display:none';
  root.appendChild(tut);
  root.appendChild(tutText);
  let blocking = false;
  const ui = {
    pending: null,
    hud: null,
    shop: null,
    setHud(h) {
      ui.hud = h;
      hud.replaceChildren();
      hud.append(`bolts ${h.bolts} | lvl ${h.level} | orders ${h.ordersCompleted} | ${h.overclock ? 'OVERCLOCK ' + (h.overclockRemainingMs / 1000).toFixed(1) + 's' : ''} `);
      btn('Shop', () => bus.emit('ui:openShop'), hud);
      btn('Log', () => bus.emit('ui:foremanRequest'), hud);
      btn(h.sfxOn ? 'SFX on' : 'SFX off', () => bus.emit('ui:toggleSfx'), hud);
      btn(h.ambientOn ? 'Music on' : 'Music off', () => bus.emit('ui:toggleAmbient'), hud);
    },
    _prompt(kind, o, answers) {
      blocking = true;
      const t0 = performance.now();
      box.style.display = 'block';
      box.style.left = (o.anchor ? o.anchor.x : 400) + 'px';
      box.style.top = (o.anchor ? o.anchor.y : 300) + 'px';
      box.replaceChildren(textDiv(`${kind}: ${o.a} × ${o.b} = ?`));
      return new Promise((resolve) => {
        let wrong = false;
        let firstMs = 0;
        const done = (r) => {
          blocking = false;
          box.style.display = 'none';
          ui.pending = null;
          log && log(`${kind} -> ${JSON.stringify(r)}`);
          resolve(r);
        };
        const answer = (v) => {
          const ms = performance.now() - t0;
          if (firstMs === 0) firstMs = ms;
          if (v === o.a * o.b) {
            done(kind === 'surge' ? { firstTryCorrect: !wrong, inTime: ms <= o.timeLimitMs, responseTimeMs: ms } : { cancelled: false, answered: true, firstTryCorrect: !wrong, responseTimeMs: firstMs });
          } else {
            wrong = true;
            bus.emit(kind === 'surge' ? 'ui:surgeWrong' : 'ui:calibrationWrong', { a: o.a, b: o.b });
          }
        };
        const opts = [o.a * o.b, o.a * o.b + o.a, Math.max(0, o.a * o.b - o.b)].sort(() => Math.random() - 0.5);
        for (const v of opts) btn(String(v), () => answer(v), box);
        if (kind === 'calibration') btn('Cancel', () => done({ cancelled: true, answered: wrong, firstTryCorrect: false, responseTimeMs: wrong ? firstMs : 0 }), box);
        let timer = 0;
        if (kind === 'surge') timer = setTimeout(() => { if (ui.pending) done({ firstTryCorrect: false, inTime: false, responseTimeMs: o.timeLimitMs }); }, o.timeLimitMs + 2000);
        if (o.autoSolve) setTimeout(() => done({ cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 0 }), 900);
        ui.pending = { kind, o, answer, cancel: () => done({ cancelled: true, answered: wrong, firstTryCorrect: false, responseTimeMs: wrong ? firstMs : 0 }), timer };
      });
    },
    promptCalibration(o) { return ui._prompt('calibration', o); },
    promptSurge(o) { return ui._prompt('surge', o); },
    showToast(text) {
      log && log('toast: ' + text);
      toast.textContent = text;
      toast.style.display = 'block';
      clearTimeout(ui._tt);
      ui._tt = setTimeout(() => (toast.style.display = 'none'), 2500);
    },
    showLevelUp(level, tables) { ui.showToast(`LEVEL ${level}! new tables: ${tables.join(',')}`); },
    showTutorial({ text, target, step, total }) {
      ui.tutorial = { text, target, step, total };
      tutText.style.display = 'block';
      tutText.textContent = `(${step}/${total}) ${text}`;
      if (target) {
        Object.assign(tut.style, { display: 'block', left: target.x + 'px', top: target.y + 'px', width: target.w + 'px', height: target.h + 'px' });
      } else tut.style.display = 'none';
    },
    hideTutorial() { ui.tutorial = null; tut.style.display = 'none'; tutText.style.display = 'none'; },
    openShop(items, bolts, onAction) {
      blocking = true;
      ui.shop = { items, bolts, onAction };
      box.style.display = 'block';
      box.style.left = '50%';
      box.style.top = '60%';
      ui._renderShop();
    },
    _renderShop() {
      const { items, bolts, onAction } = ui.shop;
      box.replaceChildren(textDiv(`SHOP — ${bolts} bolts`));
      for (const it of items) {
        const row = document.createElement('div');
        row.textContent = `${it.name} (${it.cost}) ${it.owned ? 'owned' : ''} ${it.locked ? '[locked]' : ''} `;
        if (!it.owned) btn('buy', () => onAction(it.id, 'buy'), row);
        else if (it.kind === 'cosmetic') btn(it.equipped ? 'unequip' : 'equip', () => onAction(it.id, it.equipped ? 'unequip' : 'equip'), row);
        box.appendChild(row);
      }
      btn('Close', () => ui.closeShop(), box);
    },
    refreshShop(items, bolts) { if (ui.shop) { ui.shop.items = items; ui.shop.bolts = bolts; ui._renderShop(); } },
    closeShop() { ui.shop = null; blocking = false; box.style.display = 'none'; },
    openForemanLog(data, handlers) {
      log && log('foreman: ' + JSON.stringify(data.tableMastery.map((m) => +m.toFixed(2))) + ' settings ' + JSON.stringify(data.settings));
      ui.foreman = { data, handlers };
    },
    isBlocking() { return blocking; },
    isCovered() { return false; },
    isPromptOpen() { return !!ui.pending; },
  };
  return ui;
}
