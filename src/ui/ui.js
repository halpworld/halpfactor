// Robo-Factor UI entry. See docs/ARCHITECTURE.md "Module: UI".
import { el, safe } from './dom.js';
import { Hud } from './hud.js';
import { openPrompt } from './prompts.js';
import { Toasts, LevelUp } from './toast.js';
import { Tutorial } from './tutorial.js';
import { Shop } from './shop.js';
import { DailyChest } from './daily.js';
import { ForemanLog } from './foremanLog.js';

export class UI {
  constructor(host, { synth, bus } = {}) {
    this.synth = synth || {};
    this.bus = bus || { emit() {}, on() { return () => {}; } };
    this.host = host;
    host.classList.add('rf-host');
    this.root = el('div', 'rf-ui');
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    host.appendChild(this.root);

    this.hud = new Hud(this.root, { synth: this.synth, bus: this.bus });
    this.tutorial = new Tutorial(this.root);
    this.toasts = new Toasts(this.root);
    this.levelUp = new LevelUp(this.root, this.synth);
    this.shop = new Shop(this.root, { synth: this.synth });
    this.daily = new DailyChest(this.root, { synth: this.synth, hatch: this.shop.hatch });
    this.log = new ForemanLog(this.root, { synth: this.synth });
    this.prompt = null;
  }

  setHud(h) { this.hud.set(h); }

  _open(kind, opts) {
    if (this.prompt) this.prompt.forceClose();
    const ctx = { synth: this.synth, bus: this.bus, hudHeight: () => this.hud.height, isCovered: () => this.shop.isOpen || this.log.isOpen || this.daily.isOpen || this.shop.hatch.isOpen };
    const p = openPrompt(this.root, ctx, kind, opts || { a: 1, b: 1 });
    this.prompt = p;
    safe(this.synth, 'uiOpen');
    p.promise.then(() => {
      if (this.prompt === p) this.prompt = null;
      safe(this.synth, 'uiClose');
    });
    return p.promise;
  }

  promptCalibration({ a, b, anchor = null, getAnchor = null, autoSolve = false } = {}) {
    return this._open('calibration', { a, b, anchor, getAnchor, autoSolve });
  }

  promptSurge({ a, b, timeLimitMs = 4000, anchor = null, getAnchor = null } = {}) {
    return this._open('surge', { a, b, anchor, getAnchor, timeLimitMs });
  }

  showToast(text, opts) { this.toasts.show(text, opts); }
  showLevelUp(level, newTables) { this.levelUp.show(level, newTables || []); }
  showTutorial(o) { this.tutorial.show(o || {}); }
  hideTutorial() { this.tutorial.hide(); }
  // Drawers never open over a live prompt (its clock would run underneath): the request is ignored.
  openShop(view, onAction) { if (this.prompt) return false; this.shop.open(view, onAction); return true; }
  refreshShop(view) { this.shop.refresh(view); }
  // Daily chest popup. Never over a live prompt.
  showDailyReward(data, onClaim) { if (this.prompt) return false; this.daily.show(data, onClaim); return true; }
  closeShop() { this.shop.close(); }
  openForemanLog(data, handlers) { if (this.prompt) return false; this.log.open(data || {}, handlers || {}); return true; }
  isPromptOpen() { return !!this.prompt; }
  // Drawer/shop/log/daily/hatch open (not counting a prompt).
  isCovered() { return !!(this.shop.isOpen || this.log.isOpen || this.daily.isOpen || this.shop.hatch.isOpen); }
  isBlocking() { return !!this.prompt || this.shop.isOpen || this.log.isOpen || this.daily.isOpen || this.shop.hatch.isOpen; }
}
