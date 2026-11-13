// Robo-Factor: Overclocked — game loop, world simulation and game flow.
// All dependencies are injected so the dev harness can pass stubs.

import { COLORS } from '../core/theme.js';
import { Renderer } from '../render/renderer.js';
import { SpriteCache, PAL } from '../render/sprites.js';
import { Particles } from '../render/particles.js';
import { Background } from '../render/background.js';
import { ItemSprites, PART_TYPES } from '../render/items.js';
import { clamp, hitRect } from '../render/util.js';
import { Belt, BELT_STYLE } from './belt.js';
import { Dispenser, Forge, FORGE_STATUS } from './machines.js';
import { Boss } from './boss.js';
import { Floaters } from './floaters.js';
import { CyberCat, Drone } from './critters.js';
import { Input } from './input.js';
import { DOCK } from './layout.js';
import { calibrationRecord, surgeRecord, surgeGate, cancelBreaksStreak, deliveryOutcome } from './rules.js';
import { DEFAULT_TABLES } from '../math/mastery.js';
import { formatBolts } from '../core/format.js';
import { drawPet } from '../render/pets.js';
import { drawBuilds, BUILD_ANCHORS } from '../render/builds.js';
import { themeAccent } from '../render/themes.js';
import {
  BUILDS, GOLDEN_COPIES, orderPayout, earnBolts, beltSpeedMult, overclockBonusSec, magnetChance, magnetReward,
  buyUpgrade, buyBuild, hatchEgg, equipPet, unequipPet, equipBest, sellPet, makeGolden, buyStyle, equipStyle,
  applyRebirth, dailyStatus, claimDaily, clampDailyClock, localDateStr, nextGoal, shopView,
} from './economy.js';

const STEP = 1 / 120;
const MAX_STEPS = 24; // per frame (0.2 s of sim) – beyond that we drop time
const OVERCLOCK_S = 12;
const CRITICAL_MS = 3000;
const PRACTICE_TAG = '50%'; // practice orders pay ×1.5 (economy.orderPayout)
const BAG_LIFE = 4; // golden bolt bag stays tappable this long (s)
const BAG_POP = 0.55; // pop-out flight time (s)
const BAG_SPOT = Object.freeze({ x: 1070, y: 650 }); // dock, clear of every forge/crate hit rect
const BUILD_FX_S = 1.4; // gap between queued build-in animations
const BUILD_DROP_S = 0.7; // drop-in + pop duration
const PET_Y = 958; // equipped pets hover over the floor strip
const DRAG_THRESHOLD = 14; // world px before a press counts as a drag
const TUTORIAL_TOTAL = 5;
const TUTORIAL_ORDER = Object.freeze({ a: 2, b: 5, target: 10, isPractice: false });

// Shop failure reasons from economy.js -> the UI's REASONS keys (or kid-friendly text).
const REASON_TEXT = {
  bolts: 'poor',
  notOwned: "You don't have that yet!",
  owned: 'You already have that!',
  order: 'Build the earlier things first!',
  notEnough: `Collect ${GOLDEN_COPIES} of the same pet first!`,
  claimed: 'Already claimed today!',
  badDate: 'Try again in a moment!',
  unknown: "Can't do that yet!",
};
export function shopReason(reason) {
  if (typeof reason !== 'string') return "Can't do that yet!";
  return Object.prototype.hasOwnProperty.call(REASON_TEXT, reason) ? REASON_TEXT[reason] : reason;
}

export const DRONE_COST = 120;

function fallbackFact(level, settings) {
  const tables = settings && Array.isArray(settings.enabledTables) && settings.enabledTables.length
    ? settings.enabledTables : DEFAULT_TABLES;
  const a = tables[(Math.random() * tables.length) | 0];
  const b = 1 + ((Math.random() * 12) | 0);
  return Math.random() < 0.5 ? { a, b, isPractice: false } : { a: b, b: a, isPractice: false };
}

function validFact(f) {
  return f && Number.isInteger(f.a) && Number.isInteger(f.b) && f.a >= 1 && f.a <= 12 && f.b >= 1 && f.b <= 12;
}

export class Game {
  /**
   * @param {object} deps
   * @param {HTMLCanvasElement} deps.canvas
   * @param {object} deps.ui      UI facade (contract: src/ui/ui.js)
   * @param {object} deps.synth   Synth (contract: src/audio.js)
   * @param {object|Promise} deps.engine MathEngine or a Promise of one
   * @param {object} deps.save    save object from loadSave()
   * @param {object} deps.bus     shared Emitter
   * @param {Function} [deps.writeSave]  (save) => void ; persists the save
   * @param {Function} [deps.unlockedTables] (level, settings) => number[] ; for level-up banners
   */
  constructor({ canvas, ui, synth, engine, save, bus, writeSave, unlockedTables }) {
    this.canvas = canvas;
    this.ui = ui;
    this.synth = synth;
    this.engine = null;
    this.engineReady = Promise.resolve(engine).then((e) => (this.engine = e));
    this.save = save;
    if (this.save && typeof this.save === 'object') this.save.streak = 0; // the combo never survives a reload
    this.bus = bus;
    this.writeSave = writeSave || (() => {});
    this.unlockedTables = unlockedTables || null;

    this.renderer = new Renderer(canvas);
    this.sprites = new SpriteCache();
    this.items = new ItemSprites();
    this.particles = new Particles(this.sprites);
    this.bg = new Background(this.sprites);
    this.floaters = new Floaters();
    this.dispensers = [null];
    this.forges = [null];
    for (let i = 1; i <= 12; i++) {
      this.dispensers.push(new Dispenser(i));
      this.forges.push(new Forge(i));
    }
    this.cat = new CyberCat({ onMeow: () => this.synth.meow() });
    this.particles.onFloorSpark = (x) => this.cat.notice(x);
    this.drones = [];
    this.bags = []; // golden bolt bags { x0, y0, x, y, t, reward }
    this.buildQueue = []; // bought builds waiting for their build-in animation (shop still open)
    this.buildFx = null; // { id, t } build-in animation in progress
    this.dailyAuto = false; // the daily chest popped up by itself this session
    this.dailyPending = false; // wanted to pop up but a prompt was open: retry at 'await'

    // Cargo pool (zero allocation during deliveries).
    this.cargo = [];
    for (let i = 0; i < 16; i++) this.cargo.push({ active: false, stage: 0, s: 0, wait: 0, rot: 0, spin: 0 });
    this.cargoTotal = 0;
    this.cargoSpawned = 0;
    this.cargoDelivered = 0;
    this.spawnT = 0;
    this.cargoFrozen = false;
    this._pt = { x: 0, y: 0, a: 0 };

    // Flow state
    this.time = 0;
    this.phase = 'boot';
    this.order = null;
    this.orderSeq = 0;
    this.boss = null;
    this.bossCounter = (Math.random() * 1000) | 0;
    this.partIndex = 0;
    this.beltIn = null;
    this.beltOut = null;
    this.oldBelts = [];
    this.activeForge = null;
    this.activeDisp = null;
    this.mismatches = 0;
    this.calib = null; // { firstTryCorrect, responseTimeMs, auto }
    this.overclock = 0;
    this.surgeIn = 2 + ((Math.random() * 2) | 0);
    this.surgeThisOrder = false;
    this.surgeDone = false;
    this.surgeVariant = null;
    this.timers = [];
    this.waiters = [];
    this.hudT = 0;

    // Selection / drag
    this.selDisp = null;
    this.selForge = null;
    this.drag = { id: null, from: null, x: 0, y: 0, sx: 0, sy: 0, moved: false };
    this.hoverForge = null;
    this.hoverDisp = null;

    // Tutorial
    this.tutorial = !save.tutorialDone;
    this.tutStep = 0;
    this.tutView = null;

    // Loop
    this.paused = false;
    this.acc = 0;
    this.last = 0;
    this.raf = 0;
    this.errCount = 0;
    this._frame = this._frame.bind(this);

    this._applySettings();
    this._syncCat();
    this._bindEvents();
    this.input = new Input(canvas, this.renderer, {
      down: (x, y, id) => this._onDown(x, y, id),
      move: (x, y, id) => this._onMove(x, y, id),
      up: (x, y, id) => this._onUp(x, y, id),
      cancel: (x, y, id) => this._onCancel(id),
    });
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._frame);
    this._hud();
    this.engineReady
      .catch((err) => console.error('[game] engine failed to start', err))
      .then(() => {
        this._maybeDaily();
        this._nextOrder();
      });
  }

  worldToScreen(x, y) {
    return this.renderer.worldToScreen(x, y);
  }

  screenToWorld(x, y) {
    return this.renderer.screenToWorld(x, y);
  }

  // ---------------------------------------------------------------------------
  // Events & lifecycle
  // ---------------------------------------------------------------------------

  _bindEvents() {
    const bus = this.bus;
    bus.on('ui:openShop', (p) => this._openShop(p));
    bus.on('ui:openDaily', () => this._openDaily());
    bus.on('ui:foremanRequest', () => this._openForeman());
    bus.on('ui:toggleSfx', () => {
      this.save.settings.sfx = !this.save.settings.sfx;
      this._applySettings();
      this._persist();
      this._hud();
    });
    bus.on('ui:toggleAmbient', () => {
      this.save.settings.ambient = !this.save.settings.ambient;
      this._applySettings();
      this._persist();
      this._hud();
    });
    bus.on('ui:surgeWrong', () => {
      const p = this._surgeSource();
      this.particles.smoke(p.x, p.y, 10);
      this.renderer.addShake(0.25);
      this.synth.smoke();
    });
    bus.on('ui:calibrationWrong', () => {
      const f = this.activeForge;
      if (!f) return;
      f.sputter = 0.5;
      this.particles.steam(f.cx, f.baseY - 150, 4, 1.6);
    });

    const onResize = () => {
      if (this.renderer.resize()) this._refreshTutorial();
      this._syncPortraitClass();
    };
    this._syncPortraitClass();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 120));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.paused = true;
        try {
          this.synth.suspend();
        } catch (e) {
          console.error(e);
        }
      } else {
        this.paused = false;
        this.last = performance.now();
        this.acc = 0;
        try {
          this.synth.unlock();
        } catch (e) {
          console.error(e);
        }
      }
    });

    // Audio unlock on (every) pointerdown — idempotent in Synth, and iOS may
    // re-suspend the context after interruptions.
    window.addEventListener('pointerdown', () => {
      try {
        this.synth.unlock();
      } catch (e) {
        console.error(e);
      }
    }, { capture: true, passive: true });
  }

  _applySettings() {
    const s = this.save.settings;
    try {
      this.synth.setSfx(!!s.sfx);
      this.synth.setAmbient(!!s.ambient);
    } catch (e) {
      console.error(e);
    }
  }

  _persist() {
    try {
      this.writeSave(this.save);
    } catch (e) {
      console.error('[game] save failed', e);
    }
  }

  _hud() {
    try {
      let dailyReady = false;
      try {
        dailyReady = !this.tutorial && dailyStatus(this.save, localDateStr()).claimable;
      } catch (e) {
        dailyReady = false;
      }
      this.ui.setHud({
        bolts: this.save.bolts,
        boltsText: formatBolts(this.save.bolts),
        goal: this.tutorial ? null : nextGoal(this.save),
        rebirths: this.save.rebirths || 0,
        dailyReady,
        level: this.save.level,
        ordersCompleted: this.save.ordersCompleted,
        overclock: this.overclock > 0,
        overclockRemainingMs: Math.max(0, Math.round(this.overclock * 1000)),
        sfxOn: !!this.save.settings.sfx,
        ambientOn: !!this.save.settings.ambient,
      });
    } catch (e) {
      console.error('[game] setHud failed', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Sim-time scheduling
  // ---------------------------------------------------------------------------

  wait(sec) {
    return new Promise((res) => this.timers.push({ t: sec, fn: res }));
  }

  after(sec, fn) {
    this.timers.push({ t: sec, fn });
  }

  waitFor(pred) {
    if (pred()) return Promise.resolve();
    return new Promise((res) => this.waiters.push({ pred, res }));
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  _frame(now) {
    this.raf = requestAnimationFrame(this._frame);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!(dt >= 0)) dt = 0;
    if (dt > 0.25) dt = 0.25; // clamp after stalls
    try {
      if (!this.paused && !this.renderer.portrait) {
        this.acc += dt;
        let steps = 0;
        while (this.acc >= STEP && steps < MAX_STEPS) {
          this.update(STEP);
          this.acc -= STEP;
          steps++;
        }
        if (steps >= MAX_STEPS) this.acc = 0;
      }
      this.render(dt);
    } catch (err) {
      this.errCount++;
      if (this.errCount < 20 || this.errCount % 600 === 0) console.error('[game] frame error', err);
    }
  }

  update(dt) {
    this.time += dt;
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) {
        this.timers.splice(i, 1);
        try {
          t.fn();
        } catch (e) {
          console.error('[game] timer failed', e);
        }
      }
    }
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i];
      let ok = false;
      try {
        ok = w.pred();
      } catch (e) {
        ok = true;
      }
      if (ok) {
        this.waiters.splice(i, 1);
        w.res();
      }
    }

    // Overclock
    if (this.overclock > 0) {
      this.overclock -= dt;
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.1;
        this._hud();
      }
      if (this.overclock <= 0) this._endOverclock();
      else if (this.beltOut && this.beltOut.isLive && Math.random() < dt * 14) {
        const p = this.beltOut.pointAt(Math.random() * this.beltOut.length, this._pt);
        this.particles.sparks(p.x, p.y, 1, PAL.cyan, 200);
      }
    }
    const speedMul = (this.overclock > 0 ? 3 : 1) * beltSpeedMult(this.save);

    this.renderer.update(dt);
    for (let i = 1; i <= 12; i++) {
      this.dispensers[i].update(dt);
      this.forges[i].update(dt, this.particles, speedMul);
    }
    if (this.beltIn) {
      this.beltIn.speedMul = speedMul;
      this.beltIn.update(dt);
    }
    if (this.beltOut) {
      this.beltOut.speedMul = speedMul;
      this.beltOut.update(dt);
    }
    for (let i = this.oldBelts.length - 1; i >= 0; i--) {
      const b = this.oldBelts[i];
      b.update(dt);
      if (b.state === 'fizzling' && Math.random() < dt * 30) {
        const p = b.pointAt(Math.random() * b.length * b.head, this._pt);
        this.particles.sparks(p.x, p.y, 1, PAL.red, 160);
      }
      if (b.state === 'dead') this.oldBelts.splice(i, 1);
    }
    if (this.boss) {
      this.boss.update(dt);
      if (this.boss.state === 'gone') this.boss = null;
    }
    this._updateCargo(dt, speedMul);
    for (let i = this.drones.length - 1; i >= 0; i--) {
      this.drones[i].update(dt);
      if (this.drones[i].done) this.drones.splice(i, 1);
    }
    this.cat.update(dt);
    this._updateBags(dt);
    this._updateBuildFx(dt);
    this.particles.update(dt);
    this.floaters.update(dt);
  }

  render(realDt) {
    const r = this.renderer;
    const ctx = r.ctx;
    if (r.portrait) {
      r.drawRotateOverlay(performance.now() / 1000);
      return;
    }
    const t = this.time;
    const st = this.save.styles || {};
    this.bg.ensure(r, st.theme);
    r.beginFrame();
    this.bg.draw(ctx, r, t, this.overclock > 0 ? COLORS.cyan : themeAccent(st.theme) || COLORS.purple);
    drawBuilds(ctx, r, t, this.sprites, this._buildIds(), this._buildIntro());
    for (let i = 1; i <= 12; i++) this.forges[i].draw(ctx, r, t, this.sprites);
    for (let i = 1; i <= 12; i++) this.dispensers[i].draw(ctx, r, t, this.sprites);
    if (this.boss) this.boss.draw(ctx, r, t);

    const style = this.overclock > 0 ? BELT_STYLE.OVERCLOCK : st.trail === 'rainbow' ? BELT_STYLE.RAINBOW : BELT_STYLE.DEFAULT;
    const skin = st.belt;
    for (let i = 0; i < this.oldBelts.length; i++) this.oldBelts[i].draw(ctx, r, t, style, skin);
    if (this.beltIn) this.beltIn.draw(ctx, r, t, style, skin);
    if (this.beltOut) this.beltOut.draw(ctx, r, t, style, skin);
    this._drawCargo(ctx, r, t);
    this._drawDragPreview(ctx, r, t);
    for (let i = 0; i < this.drones.length; i++) this.drones[i].draw(ctx, r, t);
    this.cat.draw(ctx, r, t, this.sprites);
    this._drawPets(ctx, r, t);
    this.particles.draw(ctx, r);
    if (this.boss) this.boss.drawOverlay(ctx, r, t);
    this._drawBags(ctx, r, t);
    this.floaters.draw(ctx, r);
    r.endFrame();
  }

  // ---------------------------------------------------------------------------
  // Orders
  // ---------------------------------------------------------------------------

  async _nextOrder() {
    const token = ++this.orderSeq;
    this.phase = 'arriving';
    this.mismatches = 0;
    this.wrongThisOrder = false; // a wrong answer was submitted (even if then cancelled)
    this.surgeDone = false;
    this.surgeVariant = null;
    this.calib = null;
    for (let i = 1; i <= 12; i++) this.dispensers[i].hint = 0;
    let order;
    if (this.tutorial) {
      order = { ...TUTORIAL_ORDER };
    } else {
      try {
        order = await this.engine.nextOrder(this.save.level, this.save.settings);
      } catch (err) {
        console.error('[game] nextOrder failed; using fallback', err);
      }
      if (!validFact(order)) order = fallbackFact(this.save.level, this.save.settings);
      order = { a: order.a, b: order.b, target: order.a * order.b, isPractice: !!order.isPractice };
    }
    if (token !== this.orderSeq) return;
    this.order = order;
    // Surge cadence: one surge every 2–3 orders, never in the tutorial.
    this.surgeThisOrder = false;
    if (!this.tutorial) {
      this.surgeIn--;
      if (this.surgeIn <= 0) {
        this.surgeThisOrder = true;
        this.surgeIn = 2 + ((Math.random() * 2) | 0);
      }
    }
    this.partIndex = (Math.random() * PART_TYPES.length) | 0;
    const seed = this.bossCounter++;
    this.boss = new Boss({
      seed,
      target: order.target,
      partIndex: this.partIndex,
      practice: order.isPractice,
      bonus: PRACTICE_TAG,
      sprites: this.sprites,
      items: this.items,
    });
    try {
      this.synth.bossArrive();
    } catch (e) {
      console.error(e);
    }
    const boss = this.boss;
    await this.waitFor(() => boss.arrived || boss !== this.boss);
    if (token !== this.orderSeq) return;
    this.renderer.addShake(0.15);
    this.particles.steam(boss.x - 100, DOCK.bossBaseY - 10, 5, 0.6);
    this.particles.steam(boss.x + 100, DOCK.bossBaseY - 10, 5, 0.6);
    this.phase = 'await';
    if (this.tutorial) this._tutorialStep(1);
    else if (this.dailyPending) this._maybeDaily();
  }

  _validDispensersFor(target) {
    const out = [];
    for (let d = 1; d <= 12; d++) if (target % d === 0 && target / d <= 12) out.push(d);
    return out;
  }

  async _wire(disp, forge) {
    if (this.phase !== 'await' || !this.order) return;
    const token = this.orderSeq;
    this.phase = 'calibrating';
    this._clearSelection();
    const A = disp.value;
    const B = forge.mult;
    this.activeDisp = disp;
    this.activeForge = forge;
    this.beltIn = new Belt(disp.port, ...this._ctrlIn(disp.port, forge.inPort), forge.inPort);
    disp.bump(0.25);
    forge.status = FORGE_STATUS.AMBER;
    forge.cycle(0.5);
    this.particles.sparks(forge.inPort.x, forge.inPort.y, 10, PAL.cyan, 260);
    this.synth.hiss();

    const de = this.save.dronesEquipped || {};
    const droneTable = this.save.drones && (this.save.drones[A] && de[A] ? A : this.save.drones[B] && de[B] ? B : 0);
    let drone = null;
    try {
      const wp = forge.windowPos;
      if (droneTable) {
        drone = new Drone(forge.cx, wp.y - 140, this.sprites);
        this.drones.push(drone);
        await drone.arrived;
        if (token !== this.orderSeq) return;
      }
      const getAnchor = () => this.renderer.worldToScreen(forge.cx, forge.cy - 60);
      const prom = this.ui.promptCalibration({ a: A, b: B, anchor: getAnchor(), getAnchor, autoSolve: !!drone });
      if (this.tutorial && this.tutStep === 3) this._tutorialStep(4);
      const res = (await prom) || { cancelled: true };
      if (token !== this.orderSeq) return;
      if (drone) {
        drone.goHome();
        this.particles.sparks(forge.cx, wp.y - 120, 10, PAL.green, 220);
      }
      const rec = calibrationRecord(res, { auto: !!drone });
      if (rec.record) this._record(A, B, rec.correct, rec.ms);
      if (cancelBreaksStreak(res)) {
        this.save.streak = 0;
        this.wrongThisOrder = true;
      }
      if (res.cancelled) {
        this.beltIn.retract();
        this.oldBelts.push(this.beltIn);
        this.beltIn = null;
        forge.status = FORGE_STATUS.IDLE;
        this.activeForge = null;
        this.activeDisp = null;
        this.phase = 'await';
        if (this.tutorial) this._tutorialStep(2);
        return;
      }
      this.calib = { firstTryCorrect: !!res.firstTryCorrect, responseTimeMs: res.responseTimeMs || 0, auto: !!drone };
      if (A * B === this.order.target) this._startDelivery(disp, forge);
      else this._mismatch(disp, forge, A, B);
    } catch (err) {
      console.error('[game] wiring flow failed', err);
      if (token === this.orderSeq) this._abortWire();
    }
  }

  _abortWire() {
    if (this.beltIn) {
      this.beltIn.retract();
      this.oldBelts.push(this.beltIn);
      this.beltIn = null;
    }
    if (this.activeForge) this.activeForge.status = FORGE_STATUS.IDLE;
    this.activeForge = null;
    this.activeDisp = null;
    this.phase = 'await';
  }

  _record(a, b, correct, ms) {
    try {
      this.engine && this.engine.record(a, b, correct, ms);
    } catch (e) {
      console.error('[game] record failed', e);
    }
  }

  _mismatch(disp, forge, A, B) {
    this.phase = 'mismatch';
    forge.status = FORGE_STATUS.RED;
    forge.sputter = 1.1;
    forge.cycle(1.2);
    const wp = forge.windowPos;
    this.particles.smoke(wp.x, wp.y - 40, 8);
    this.particles.sparks(wp.x, wp.y, 14, PAL.red, 320);
    this.cat.notice(forge.cx);
    this.renderer.addShake(0.3);
    this.synth.smoke();
    this.ui.showToast(`${A} × ${B} makes ${A * B} — the boss needs ${this.order.target}!`, { kind: 'warn', ms: 3200 });
    this.boss && (this.boss.wiggle = 0.4);
    this.beltIn.fizzle();
    this.oldBelts.push(this.beltIn);
    this.beltIn = null;
    this.mismatches++;
    this.save.streak = 0;
    if (this.mismatches >= 2) {
      const valid = this._validDispensersFor(this.order.target);
      let pick = valid.includes(this.order.a) ? this.order.a : valid.includes(this.order.b) ? this.order.b : valid[0];
      if (pick) this.dispensers[pick].hint = 1e9; // keep pulsing until this order is done
    }
    const token = this.orderSeq;
    this.after(1.0, () => {
      if (token !== this.orderSeq) return;
      forge.status = FORGE_STATUS.IDLE;
      this.activeForge = null;
      this.activeDisp = null;
      this.phase = 'await';
    });
  }

  _startDelivery(disp, forge) {
    this.phase = 'delivering';
    for (let i = 1; i <= 12; i++) this.dispensers[i].hint = 0;
    forge.status = this.overclock > 0 ? FORGE_STATUS.CYAN : FORGE_STATUS.GREEN;
    forge.running = true;
    forge.cycle(1.6);
    this.beltIn.pulse = 1;
    const hp = this.boss.hatchPos;
    this.beltOut = new Belt(forge.outPort, ...this._ctrlOut(forge.outPort, hp), hp);
    this.boss.hatchTarget = 1;
    this.boss.mouthTarget = 0.35;
    this.particles.ring(forge.windowPos.x, forge.windowPos.y, PAL.green, 120);
    this.particles.sparks(forge.windowPos.x, forge.windowPos.y, 18, PAL.green, 360);
    this.renderer.flash(COLORS.green, 0.12, 2.5);
    this.synth.hiss();
    // cargo
    const t = this.order.target;
    this.cargoTotal = clamp(8 + Math.floor(t / 30), 8, 12);
    this.cargoSpawned = 0;
    this.cargoDelivered = 0;
    this.spawnT = 0.25;
    this.cargoFrozen = false;
    for (const c of this.cargo) c.active = false;
    if (this.tutorial && this.tutStep === 4) this._tutorialStep(5);
  }

  _ctrlIn(p0, p3) {
    const dx = p3.x - p0.x;
    return [{ x: p0.x + dx * 0.45, y: p0.y - 30 }, { x: p3.x - dx * 0.45, y: p3.y + 20 }];
  }

  _ctrlOut(p0, p3) {
    // Overhead arc so the belt reads as an elevated conveyor.
    const dx = p3.x - p0.x;
    const lift = 120 + Math.min(120, dx * 0.12);
    return [{ x: p0.x + dx * 0.3, y: Math.min(p0.y, p3.y) - lift }, { x: p3.x - dx * 0.35, y: p3.y - lift * 0.6 }];
  }

  _updateCargo(dt, speedMul) {
    if (this.phase !== 'delivering' && this.phase !== 'surge') return;
    const bIn = this.beltIn;
    const bOut = this.beltOut;
    const forge = this.activeForge;
    if (!bIn || !bOut || !forge) return;
    if (this.cargoFrozen) return;
    // A surge due while a drawer is open is deferred, never dropped: hold the
    // delivery (no movement, no finishing) until the drawer closes, then fire.
    const gate0 = this._surgeGate();
    if (gate0 === 'hold') return;
    if (gate0 === 'fire') {
      this._surge();
      return;
    }
    const v = 300 * speedMul;
    // Spawn
    if (this.cargoSpawned < this.cargoTotal) {
      this.spawnT -= dt * speedMul;
      if (this.spawnT <= 0 && bIn.isLive) {
        this.spawnT = 0.34;
        for (const c of this.cargo) {
          if (c.active) continue;
          c.active = true;
          c.stage = 0;
          c.s = 0;
          c.wait = 0;
          c.rot = Math.random() * 6;
          c.spin = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
          this.cargoSpawned++;
          this.activeDisp && this.activeDisp.bump(0.12);
          break;
        }
      }
    }
    for (const c of this.cargo) {
      if (!c.active) continue;
      c.rot += c.spin * dt * speedMul;
      if (c.stage === 0) {
        c.s += v * dt;
        if (c.s >= bIn.length) {
          c.stage = 1;
          c.wait = 0.12;
        }
      } else if (c.stage === 1) {
        c.wait -= dt * speedMul;
        if (c.wait <= 0) {
          c.stage = 2;
          c.s = 0;
          forge.cycle(0.8);
          const op = forge.outPort;
          this.particles.sparks(op.x, op.y, 3, this.overclock > 0 ? PAL.cyan : PAL.orange, 220, 1.2, -0.3);
        }
      } else {
        c.s += v * dt;
        if (c.s >= bOut.length) {
          c.active = false;
          this.cargoDelivered++;
          this._onCargoArrive();
        }
      }
    }
    // Surge trigger: halfway through the delivery.
    const gate = this._surgeGate();
    if (gate === 'fire') {
      this._surge();
      return;
    }
    if (gate === 'hold') return;
    if (this.phase === 'delivering' && this.cargoDelivered >= this.cargoTotal) this._finishDelivery();
  }

  _surgeGate() {
    return surgeGate({
      pending: !!this.surgeThisOrder && !this.surgeDone && this.phase === 'delivering',
      delivered: this.cargoDelivered,
      total: this.cargoTotal,
      blocking: this._uiBlocking(),
    });
  }

  _onCargoArrive() {
    const b = this.boss;
    if (!b) return;
    b.receive(this.cargoDelivered / this.cargoTotal);
    const hp = b.hatchPos;
    this.particles.sparks(hp.x, hp.y, 5, this.overclock > 0 ? PAL.cyan : PAL.gold, 260);
    this.particles.embers(hp.x, hp.y, 2, b.eyePal, 40);
    this.synth.deliver();
  }

  _drawCargo(ctx, r, t) {
    if (this.phase !== 'delivering' && this.phase !== 'surge') return;
    const bIn = this.beltIn;
    const bOut = this.beltOut;
    if (!bIn || !bOut) return;
    const pt = this._pt;
    const trail = (this.save.styles && this.save.styles.trail) || 'none';
    const rainbow = trail === 'rainbow';
    const oc = this.overclock > 0;
    const S = this.sprites;
    for (let i = 0; i < this.cargo.length; i++) {
      const c = this.cargo[i];
      if (!c.active || c.stage === 1) continue;
      const belt = c.stage === 0 ? bIn : bOut;
      // trails (additive)
      if (oc || trail !== 'none') {
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 1; k <= 5; k++) {
          const s = c.s - k * 12;
          if (s < 0) break;
          belt.pointAt(s, pt);
          let g;
          let sz = 22 - k * 2;
          let dx = 0;
          let dy = 0;
          ctx.globalAlpha = (1 - k / 6) * 0.7;
          if (oc) g = S.glow[PAL.cyan];
          else if (rainbow) g = S.glow[PAL_RAINBOW[(k + ((t * 10) | 0)) % PAL_RAINBOW.length]];
          else if (trail === 'fire') {
            g = S.glow[k < 3 ? PAL.gold : k < 4 ? PAL.orange : PAL.red];
            dy = -k * 3 - Math.abs(Math.sin(t * 13 + k + i)) * 6; // flames lick upwards
            sz = 24 - k * 2.5;
          } else {
            // sparkle: twinkling white/gold stars scattered around the path
            const tw = Math.sin(t * 17 + k * 2.3 + i);
            if (tw < 0) continue;
            g = S.glow[k % 2 ? PAL.white : PAL.gold];
            ctx.globalAlpha = tw * 0.9;
            dx = Math.sin(k * 7.1 + i) * 12;
            dy = Math.cos(k * 5.3 + i) * 12 - 6;
            sz = 7 + tw * 6;
          }
          r.local(pt.x + dx, pt.y + dy, 0, 1);
          ctx.drawImage(g, -sz, -sz, sz * 2, sz * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      belt.pointAt(c.s, pt);
      const bob = Math.sin(t * 8 + i) * 2;
      if (c.stage === 0) {
        this.items.drawOre(ctx, r, pt.x, pt.y - 6 + bob, c.rot * 0.3, 1);
      } else {
        // glow behind part
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.45;
        r.local(pt.x, pt.y - 10 + bob, 0, 1);
        ctx.drawImage(S.soft[oc ? PAL.cyan : PAL.white], -34, -34, 68, 68);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this.items.drawPart(ctx, r, this.partIndex, pt.x, pt.y - 10 + bob, c.rot, 0.9);
      }
    }
    r.resetLocal();
  }

  _drawDragPreview(ctx, r, t) {
    const d = this.drag;
    if (d.id === null || !d.moved || this.phase !== 'await') return;
    let x0;
    let y0;
    if (d.from === 'disp' && this.selDisp) {
      const p = this.selDisp.port;
      x0 = p.x;
      y0 = p.y;
    } else if (d.from === 'forge' && this.selForge) {
      const p = this.selForge.inPort;
      x0 = p.x;
      y0 = p.y;
    } else return;
    const x1 = d.x;
    const y1 = d.y;
    const dx = x1 - x0;
    r.resetLocal();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = this.hoverForge || this.hoverDisp ? COLORS.green : COLORS.cyan;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + dx * 0.45, y0 - 30, x1 - dx * 0.45, y1 + 20, x1, y1);
    ctx.stroke();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 4;
    ctx.setLineDash(DASH);
    ctx.lineDashOffset = -t * 80;
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha = 0.8;
    ctx.drawImage(this.sprites.glow[PAL.cyan], x1 - 26, y1 - 26, 52, 52);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _finishDelivery() {
    this.phase = 'departing';
    const token = this.orderSeq;
    const order = this.order;
    const boss = this.boss;
    const forge = this.activeForge;
    const oc = this.overclock > 0;
    const out = deliveryOutcome({
      streak: this.save.streak,
      mismatches: this.mismatches,
      wrongThisOrder: !!this.wrongThisOrder,
      tutorial: !!this.tutorial,
      calib: this.calib,
      criticalMs: CRITICAL_MS,
    });
    const critical = out.critical;
    this.save.streak = out.streak;
    const combo = out.streak;
    const bolts = earnBolts(this.save, orderPayout(this.save, { target: order.target, isPractice: !!order.isPractice, critical, overclocked: oc, streak: combo }));
    const bag = !this.tutorial && Math.random() < magnetChance(this.save);
    this.save.ordersCompleted = (this.save.ordersCompleted || 0) + 1;
    let leveledUp = false;
    if (this.save.ordersCompleted % 5 === 0) {
      this.save.level = (this.save.level || 1) + 1;
      leveledUp = true;
    }
    if (this.tutorial) {
      this.tutorial = false;
      this.save.tutorialDone = true;
    }
    this._persist();
    this._refreshOpenShop();

    // Juice
    const hp = boss ? boss.hatchPos : { x: DOCK.bossX, y: DOCK.hatchY };
    if (boss) {
      boss.happy = 2.2;
      boss.hatchTarget = 0;
      boss.mouthTarget = 0;
      boss.eyeGlow = 1;
    }
    this.floaters.spawn(`+${order.target}!`, hp.x, hp.y - 220, { size: 76, color: '#ffffff', glow: COLORS.cyan, life: 1.6, vy: -60 });
    this.floaters.spawn(`+${formatBolts(bolts)} bolts`, hp.x, hp.y - 140, { size: 38, color: COLORS.gold, glow: COLORS.goldDeep, life: 1.6, delay: 0.25, vy: -50 });
    if (combo >= 2) this.floaters.spawn(`COMBO x${combo}`, hp.x, hp.y - 80, { size: 34, color: COLORS.magenta, glow: COLORS.magenta, life: 1.5, delay: 0.45, vy: -40, wobble: 1 });
    if (bag) this._spawnBag(hp.x, hp.y - 60, magnetReward(bolts));
    if (critical) {
      this.floaters.spawn('CRITICAL EFFICIENCY!', 640, 560, { size: 58, color: COLORS.magenta, glow: COLORS.magenta, life: 1.9, wobble: 1, vy: -30 });
      this.renderer.flash(COLORS.magenta, 0.2, 2);
    }
    this.particles.confetti(hp.x, hp.y - 120, critical ? 90 : 60);
    this.particles.coins(hp.x, hp.y - 40, 10);
    this.particles.ring(hp.x, hp.y, PAL.gold, 220);
    this.renderer.addShake(0.25);
    this.cat.notice(hp.x - 60);
    const streak = Math.min(5, this.save.streak || 0);
    this.synth.correct(streak);
    this.after(0.25, () => this.synth.bossHappy());
    for (let i = 0; i < 4; i++) this.after(0.4 + i * 0.09, () => this.synth.coin());
    const sp = this.renderer.worldToScreen(hp.x, hp.y);
    this.bus.emit('game:bolts', { bolts: this.save.bolts, delta: bolts, x: sp.x, y: sp.y });
    this._hud();

    this.after(1.3, () => {
      if (token !== this.orderSeq) return;
      if (boss) boss.leave();
      if (forge) {
        forge.running = false;
        forge.status = FORGE_STATUS.IDLE;
      }
      for (const b of [this.beltIn, this.beltOut]) {
        if (b) {
          b.retract();
          this.oldBelts.push(b);
        }
      }
      this.beltIn = null;
      this.beltOut = null;
      this.activeForge = null;
      this.activeDisp = null;
    });
    this.after(2.4, () => {
      if (token !== this.orderSeq) return;
      if (this.tutStep) this._tutorialEnd();
      if (leveledUp) this._levelUp();
      this._nextOrder();
    });
  }

  _levelUp() {
    const lvl = this.save.level;
    let newTables = [];
    const s = this.save.settings;
    if (s.autoCurriculum && this.unlockedTables) {
      try {
        const now = this.unlockedTables(lvl, s) || [];
        const before = new Set(this.unlockedTables(lvl - 1, s) || []);
        newTables = now.filter((t) => !before.has(t));
      } catch (e) {
        console.error(e);
      }
    }
    try {
      this.ui.showLevelUp(lvl, newTables);
    } catch (e) {
      console.error(e);
    }
    this.particles.confetti(683, 300, 120, 700);
    this.renderer.flash(COLORS.gold, 0.3, 1.5);
  }

  // ---------------------------------------------------------------------------
  // Surge / Overclock
  // ---------------------------------------------------------------------------

  _surgeSource() {
    if (this.surgeVariant === 'turbo' && this.boss) return { x: this.boss.x, y: this.boss.baseY - 330 };
    const f = this.activeForge;
    if (f) return f.windowPos;
    return { x: 683, y: 512 };
  }

  async _surge() {
    this.surgeDone = true;
    this.phase = 'surge';
    this.cargoFrozen = true;
    const token = this.orderSeq;
    const variant = Math.random() < 0.5 || !this.boss ? 'jam' : 'turbo';
    this.surgeVariant = variant;
    const forge = this.activeForge;
    if (variant === 'jam') {
      if (this.beltIn) this.beltIn.jammed = true;
      if (this.beltOut) this.beltOut.jammed = true;
      if (forge) {
        forge.status = FORGE_STATUS.RED;
        forge.sputter = 0.8;
        forge.running = false;
        const wp = forge.windowPos;
        this.particles.sparks(wp.x, wp.y, 24, PAL.red, 420);
        this.particles.steam(wp.x, wp.y - 60, 8, 2);
        this.floaters.spawn('JAMMED!', wp.x, wp.y - 140, { size: 52, color: COLORS.red, glow: COLORS.red, life: 1.4, wobble: 1 });
      }
      this.renderer.addShake(0.45);
      this.renderer.flash(COLORS.red, 0.18, 3);
      this.synth.jam();
    } else {
      this.boss.turbo = true;
      this.floaters.spawn('TURBO MODE!', this.boss.x, 440, { size: 52, color: COLORS.magenta, glow: COLORS.magenta, life: 1.6, wobble: 1 });
      this.particles.sparks(this.boss.x, this.boss.baseY - 60, 20, PAL.orange, 380);
      this.renderer.addShake(0.35);
      this.synth.bossArrive();
    }
    let fact = null;
    try {
      fact = await this.engine.nextSurge(this.save.level, this.save.settings);
    } catch (err) {
      console.error('[game] nextSurge failed; using fallback', err);
    }
    if (!validFact(fact)) fact = fallbackFact(this.save.level, this.save.settings);
    if (token !== this.orderSeq) return;
    // Never start the 4 s clock under a drawer, in portrait or while hidden:
    // waitFor only resolves from update(), which is frozen in portrait/hidden.
    await this.waitFor(() => !this._uiBlocking());
    if (token !== this.orderSeq) return;
    const src = this._surgeSource();
    const getAnchor = () => {
      const p = this._surgeSource();
      return this.renderer.worldToScreen(p.x, p.y);
    };
    let res = null;
    try {
      res = await this.ui.promptSurge({ a: fact.a, b: fact.b, timeLimitMs: 4000, anchor: getAnchor(), getAnchor });
    } catch (err) {
      console.error('[game] promptSurge failed', err);
    }
    if (token !== this.orderSeq) return;
    const rec = surgeRecord(res);
    if (rec.record) this._record(fact.a, fact.b, rec.correct, rec.ms);
    res = res || { firstTryCorrect: false, inTime: false, responseTimeMs: 0 };
    if (this.beltIn) this.beltIn.jammed = false;
    if (this.beltOut) this.beltOut.jammed = false;
    if (this.boss) this.boss.turbo = false;
    if (forge) {
      forge.running = true;
      forge.status = FORGE_STATUS.GREEN;
      forge.cycle(1.4);
    }
    this.cargoFrozen = false;
    this.phase = 'delivering';
    if (res.inTime && res.firstTryCorrect) {
      this._startOverclock();
    } else {
      const p = src;
      this.floaters.spawn('Jam cleared!', p.x, p.y - 120, { size: 42, color: COLORS.green, glow: COLORS.green, life: 1.3 });
      this.particles.steam(p.x, p.y - 40, 6, 1.5);
      this.synth.hiss();
    }
    this.surgeVariant = null;
  }

  _startOverclock() {
    const was = this.overclock > 0;
    this.overclock = OVERCLOCK_S + overclockBonusSec(this.save);
    this.hudT = 0;
    if (this.activeForge) this.activeForge.status = FORGE_STATUS.CYAN;
    this.renderer.flash(COLORS.cyan, 0.55, 2.2);
    this.renderer.addShake(0.5);
    this.floaters.spawn('OVERCLOCK!', 683, 420, { size: 86, color: '#e6feff', glow: COLORS.cyan, life: 1.8, wobble: 1, vy: -20 });
    for (let i = 1; i <= 12; i++) {
      const f = this.forges[i];
      this.particles.sparks(f.cx, f.cy - 20, 4, PAL.cyan, 300);
    }
    if (this.beltOut) {
      for (let k = 0; k < 12; k++) {
        const p = this.beltOut.pointAt((k / 12) * this.beltOut.length, this._pt);
        this.particles.sparks(p.x, p.y, 2, PAL.cyan, 260);
      }
    }
    if (!was) this.synth.surgeStart();
    this._hud();
  }

  _endOverclock() {
    this.overclock = 0;
    if (this.activeForge && this.activeForge.status === FORGE_STATUS.CYAN) this.activeForge.status = FORGE_STATUS.GREEN;
    this.synth.surgeEnd();
    this._hud();
  }

  // ---------------------------------------------------------------------------
  // Tutorial
  // ---------------------------------------------------------------------------

  _tutorialStep(step) {
    this.tutStep = step;
    const views = {
      1: { text: 'This boss needs 10 parts!', target: () => (this.boss ? this._union(this.boss.rect, this.boss.bubbleRect) : null) },
      2: { text: 'Tap the 2 crate', target: () => this.dispensers[2].hit },
      3: { text: 'Now tap the ×5 forge', target: () => this.forges[5].hit },
      4: { text: '2 × 5 = ? Punch it in!', target: () => this.forges[5].hit },
      5: { text: 'Great! Watch it go!', target: () => (this.boss ? this.boss.rect : null) },
    };
    this.tutView = { step, ...views[step] };
    this._refreshTutorial();
    if (step === 1) {
      const seq = this.orderSeq;
      this.after(4.5, () => {
        if (this.tutStep === 1 && seq === this.orderSeq) this._tutorialStep(2);
      });
    }
    if (step === 2) this.dispensers[2].hint = 1e9;
    else this.dispensers[2].hint = 0;
    this.forges[5].hint = step === 3 ? 1e9 : 0;
    if (step === 5) {
      this.after(2.6, () => {
        if (this.tutStep === 5) this._tutorialEnd();
      });
    }
  }

  _tutorialEnd() {
    this.after(1.2, () => this._maybeDaily());
    this.tutStep = 0;
    this.tutView = null;
    this.forges[5].hint = 0;
    this.dispensers[2].hint = 0;
    try {
      this.ui.hideTutorial();
    } catch (e) {
      console.error(e);
    }
  }

  _refreshTutorial() {
    const v = this.tutView;
    if (!v) return;
    const rect = v.target();
    try {
      this.ui.showTutorial({ text: v.text, target: rect ? this.renderer.rectToScreen(rect) : null, step: v.step, total: TUTORIAL_TOTAL });
    } catch (e) {
      console.error(e);
    }
  }

  _union(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
  }

  _tutorialAllows(kind, value) {
    if (!this.tutorial || !this.tutStep) return true;
    if (this.tutStep === 2) return kind === 'disp' && value === 2;
    if (this.tutStep === 3) return (kind === 'forge' && value === 5) || (kind === 'disp' && value === 2);
    return false;
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------

  _dispAt(x, y) {
    for (let i = 1; i <= 12; i++) if (hitRect(this.dispensers[i].hit, x, y)) return this.dispensers[i];
    return null;
  }

  _forgeAt(x, y) {
    for (let i = 1; i <= 12; i++) if (hitRect(this.forges[i].hit, x, y)) return this.forges[i];
    return null;
  }

  _clearSelection() {
    if (this.selDisp) this.selDisp.selected = false;
    if (this.selForge) this.selForge.selected = false;
    this.selDisp = null;
    this.selForge = null;
    if (this.hoverForge) this.hoverForge.hover = false;
    if (this.hoverDisp) this.hoverDisp.hover = false;
    this.hoverForge = null;
    this.hoverDisp = null;
  }

  _promptOpen() {
    try {
      return !!(this.ui.isPromptOpen && this.ui.isPromptOpen());
    } catch (e) {
      return false;
    }
  }

  /** Tables the auto curriculum unlocks at the current level (ignores the manual list). */
  _autoTables() {
    try {
      const t = this.unlockedTables ? this.unlockedTables(this.save.level, { ...this.save.settings, autoCurriculum: true }) : null;
      return Array.isArray(t) ? t.slice() : null;
    } catch (e) {
      return null;
    }
  }

  _uiBlocking() {
    try {
      return !!this.ui.isBlocking();
    } catch (e) {
      return false;
    }
  }

  _syncPortraitClass() {
    try {
      document.documentElement.classList.toggle('rf-portrait', !!this.renderer.portrait);
    } catch (e) {
      /* no DOM */
    }
  }

  _blockedAt(x, y) {
    let blocking = false;
    try {
      blocking = !!this.ui.isBlocking();
    } catch (e) {
      blocking = false;
    }
    if (!blocking) return false;
    // During the tutorial the spotlighted target stays interactive.
    if (this.tutView) {
      const rect = this.tutView.target();
      if (rect && hitRect(rect, x, y)) return false;
    }
    return true;
  }

  _onDown(x, y, id) {
    if (this.drag.id !== null && this.drag.id !== id) return; // second finger: ignore
    if (this.tutStep === 1) {
      this._tutorialStep(2);
      return;
    }
    if (this._blockedAt(x, y)) return;

    if (this.phase === 'await') {
      const d = this._dispAt(x, y);
      if (d) {
        if (!this._tutorialAllows('disp', d.value)) return this._nudge();
        if (this.selForge) {
          const f = this.selForge;
          this._wire(d, f);
          return;
        }
        if (this.selDisp && this.selDisp !== d) this.selDisp.selected = false;
        this._clearSelection();
        this.selDisp = d;
        d.selected = true;
        d.bump(0.15);
        this.synth.click();
        this._startDrag(id, 'disp', x, y);
        if (this.tutStep === 2) this._tutorialStep(3);
        return;
      }
      const f = this._forgeAt(x, y);
      if (f) {
        if (!this._tutorialAllows('forge', f.mult)) return this._nudge();
        if (this.selDisp) {
          this._wire(this.selDisp, f);
          return;
        }
        if (this.tutorial) return;
        this._clearSelection();
        this.selForge = f;
        f.selected = true;
        f.cycle(0.3);
        this.synth.click();
        this._startDrag(id, 'forge', x, y);
        return;
      }
    }
    // Golden bolt bags sit in the dock, clear of every crate/forge, and are checked after them.
    if (this._tapBag(x, y)) return;
    if (this.boss && this.boss.arrived && hitRect(this.boss.rect, x, y)) {
      this.boss.poke();
      this.synth.bossHappy();
      return;
    }
    if (this.cat.hitTest(x, y)) {
      this.cat.pet();
      this.particles.embers(this.cat.x, 960, 4, PAL.magenta);
      return;
    }
    if (this.phase === 'await' && !this.tutorial) this._clearSelection();
  }

  _nudge() {
    // Wrong target during the tutorial: shake the right one gently.
    if (this.tutStep === 2) this.dispensers[2].bump(0.3);
    if (this.tutStep === 3) this.forges[5].cycle(0.8);
  }

  _startDrag(id, from, x, y) {
    const d = this.drag;
    d.id = id;
    d.from = from;
    d.x = x;
    d.y = y;
    d.sx = x;
    d.sy = y;
    d.moved = false;
  }

  _onMove(x, y, id) {
    const d = this.drag;
    if (d.id !== id) return;
    d.x = x;
    d.y = y;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > DRAG_THRESHOLD) d.moved = true;
    if (!d.moved) return;
    if (d.from === 'disp') {
      const f = this._forgeAt(x, y);
      const ok = f && this._tutorialAllows('forge', f.mult) ? f : null;
      if (ok !== this.hoverForge) {
        if (this.hoverForge) this.hoverForge.hover = false;
        this.hoverForge = ok;
        if (ok) ok.hover = true;
      }
    } else if (d.from === 'forge') {
      const ds = this._dispAt(x, y);
      if (ds !== this.hoverDisp) {
        if (this.hoverDisp) this.hoverDisp.hover = false;
        this.hoverDisp = ds;
        if (ds) ds.hover = true;
      }
    }
  }

  _onUp(x, y, id) {
    const d = this.drag;
    if (d.id !== id) return;
    d.id = null;
    if (d.moved && this.phase === 'await') {
      if (d.from === 'disp' && this.selDisp) {
        const f = this._forgeAt(x, y);
        if (f && this._tutorialAllows('forge', f.mult)) {
          this._wire(this.selDisp, f);
          return;
        }
      } else if (d.from === 'forge' && this.selForge) {
        const ds = this._dispAt(x, y);
        if (ds) {
          this._wire(ds, this.selForge);
          return;
        }
      }
    }
    if (this.hoverForge) this.hoverForge.hover = false;
    if (this.hoverDisp) this.hoverDisp.hover = false;
    this.hoverForge = null;
    this.hoverDisp = null;
  }

  _onCancel(id) {
    if (this.drag.id !== id) return;
    this.drag.id = null;
    if (this.hoverForge) this.hoverForge.hover = false;
    if (this.hoverDisp) this.hoverDisp.hover = false;
    this.hoverForge = null;
    this.hoverDisp = null;
  }

  // ---------------------------------------------------------------------------
  // Shop
  // ---------------------------------------------------------------------------

  _droneItems() {
    const s = this.save;
    const items = [];
    for (let t = 1; t <= 12; t++) {
      const owned = !!(s.drones && s.drones[t]);
      const equipped = owned && !!(s.dronesEquipped && s.dronesEquipped[t]);
      let m = 0;
      try {
        m = this.engine ? this.engine.tableMasteryCached(t) || 0 : 0;
      } catch (e) {
        m = 0;
      }
      const locked = !owned && m < 0.95;
      items.push({
        id: `drone-${t}`,
        name: `×${t} Auto-Drone`,
        desc: `Flies over and calibrates ×${t} forges for you`,
        cost: DRONE_COST,
        kind: 'drone',
        owned,
        equipped,
        locked,
        lockReason: locked ? `Master the ×${t} table first (${Math.round(m * 100)}%)` : '',
      });
    }
    return items;
  }

  _shopView(tab) {
    return shopView(this.save, { tab, drones: this._droneItems() });
  }

  /** After earning bolts outside the shop: keep an open shop's prices / "Need N more" current. */
  _refreshOpenShop() {
    try {
      const ui = this.ui;
      if (!ui || typeof ui.refreshShop !== 'function') return;
      if (ui.shop && ui.shop.isOpen === false) return;
      ui.refreshShop(this._shopView());
    } catch (e) {
      console.error(e);
    }
  }

  _openShop(payload) {
    if (this._promptOpen()) return;
    const tab = payload && typeof payload.tab === 'string' ? payload.tab : undefined;
    try {
      this.ui.openShop(this._shopView(tab), (a) => this._shopAction(a));
    } catch (e) {
      console.error('[game] openShop failed', e);
    }
  }

  /** Shop UI action -> { ok, reason?, pet? } (synchronous; see SHOP_DESIGN.md section 11). */
  _shopAction(a) {
    let res;
    try {
      res = this._runShopAction(a);
    } catch (e) {
      console.error('[game] shop action failed', e);
      res = { ok: false, reason: 'unknown' };
    }
    if (!res || !res.ok) return { ok: false, reason: shopReason(res && res.reason) };
    this._syncCat();
    this._persist();
    this._hud();
    try {
      this.ui.refreshShop(this._shopView());
    } catch (e) {
      console.error(e);
    }
    const out = { ok: true };
    if (res.pet) out.pet = res.pet;
    return out;
  }

  _runShopAction(a) {
    const s = this.save;
    if (!a || typeof a !== 'object') return { ok: false, reason: 'unknown' };
    const before = s.bolts;
    let res;
    let buy = false;
    switch (a.type) {
      case 'upgrade': res = buyUpgrade(s, a.id); buy = true; break;
      case 'build': res = buyBuild(s, a.id); buy = true; break;
      case 'hatch': res = hatchEgg(s, a.egg, Math.random); buy = true; break;
      case 'equipPet': res = equipPet(s, a.uid); break;
      case 'unequipPet': res = unequipPet(s, a.uid); break;
      case 'equipBest': res = equipBest(s); break;
      case 'sellPet': res = sellPet(s, a.uid); break;
      case 'golden': res = makeGolden(s, a.petId); buy = true; break;
      case 'style':
        if (a.action === 'buy') {
          res = buyStyle(s, a.key);
          buy = true;
        } else res = equipStyle(s, a.key);
        break;
      case 'drone': res = this._droneAction(a.id, a.action); buy = a.action === 'buy'; break;
      case 'rebirth': res = applyRebirth(s); break;
      default: return { ok: false, reason: 'unknown' };
    }
    if (!res || !res.ok) return res;
    if (a.type === 'rebirth') this._onRebirth();
    if (a.type === 'build' && typeof res.id === 'string') this.buildQueue.push(res.id);
    else if (a.type === 'build' && typeof a.id === 'string') this.buildQueue.push(a.id);
    else if (buy) {
      this._safeSynth('purchase');
      this.renderer.flash(COLORS.gold, 0.15, 3);
    }
    const delta = (s.bolts || 0) - (before || 0);
    if (delta !== 0) this.bus.emit('game:bolts', { bolts: s.bolts, delta, x: this.renderer.cssW - 120, y: 42 });
    return res;
  }

  _droneAction(id, action) {
    const s = this.save;
    const item = this._droneItems().find((i) => i.id === id);
    if (!item) return { ok: false, reason: 'unknown' };
    const t = Number(String(id).split('-')[1]);
    if (action === 'buy') {
      if (item.owned) return { ok: false, reason: 'owned' };
      if (item.locked) return { ok: false, reason: item.lockReason || 'locked' };
      if ((s.bolts || 0) < item.cost) return { ok: false, reason: 'bolts' };
      s.bolts -= item.cost;
      s.drones = s.drones || {};
      s.drones[t] = true;
      s.dronesEquipped = s.dronesEquipped || {};
      s.dronesEquipped[t] = true;
      return { ok: true };
    }
    if (action === 'equip' || action === 'unequip') {
      if (!item.owned) return { ok: false, reason: 'notOwned' };
      s.dronesEquipped = s.dronesEquipped || {};
      if (action === 'equip') s.dronesEquipped[t] = true;
      else delete s.dronesEquipped[t];
      return { ok: true };
    }
    return { ok: false, reason: 'unknown' };
  }

  _onRebirth() {
    this.renderer.flash(COLORS.gold, 0.5, 1.2);
    this.renderer.addShake(0.4);
    this.particles.confetti(683, 300, 160, 700);
    this.floaters.spawn('REBIRTH!', 683, 420, { size: 86, color: COLORS.gold, glow: COLORS.goldDeep, life: 2, wobble: 1, vy: -20 });
    this.bags.length = 0;
    this.buildQueue.length = 0;
    this.buildFx = null;
  }

  _safeSynth(name, ...args) {
    try {
      if (this.synth && typeof this.synth[name] === 'function') this.synth[name](...args);
    } catch (e) {
      console.error(e);
    }
  }

  // ---------------------------------------------------------------------------
  // Daily chest
  // ---------------------------------------------------------------------------

  /** Pops the daily chest up once per session when today's reward is claimable. */
  _maybeDaily() {
    if (this.tutorial || this.dailyAuto) return;
    let st;
    try {
      if (clampDailyClock(this.save, localDateStr())) this._persist();
      st = dailyStatus(this.save, localDateStr());
    } catch (e) {
      return;
    }
    if (!st.claimable) {
      this.dailyPending = false;
      return;
    }
    const shown = this._openDaily();
    this.dailyPending = !shown;
    if (shown) this.dailyAuto = true;
  }

  /** Opens the daily chest. Returns false when the UI refused (a calibration prompt is open). */
  _openDaily() {
    if (this._promptOpen()) return false;
    let st;
    try {
      st = dailyStatus(this.save, localDateStr());
    } catch (e) {
      return false;
    }
    let shown = false;
    try {
      shown = this.ui.showDailyReward(st, () => this._claimDaily()) !== false;
    } catch (e) {
      console.error('[game] showDailyReward failed', e);
    }
    return shown;
  }

  _claimDaily() {
    let res;
    try {
      res = claimDaily(this.save, localDateStr(), Math.random);
    } catch (e) {
      console.error('[game] claimDaily failed', e);
      res = { ok: false, reason: 'unknown' };
    }
    if (!res || !res.ok) return { ok: false, reason: shopReason(res && res.reason) };
    this.dailyPending = false;
    this._syncCat();
    this._persist();
    this._hud();
    this._refreshOpenShop();
    if (res.bolts) this.bus.emit('game:bolts', { bolts: this.save.bolts, delta: res.bolts, x: this.renderer.cssW / 2, y: this.renderer.cssH / 2 });
    const out = { ok: true, day: res.day };
    if (res.bolts) out.bolts = res.bolts;
    if (res.pet) out.pet = res.pet;
    if (res.egg) out.egg = res.egg;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Pets, builds & golden bolt bags in the scene
  // ---------------------------------------------------------------------------

  _equippedPets() {
    const s = this.save;
    const eq = Array.isArray(s.petsEquipped) ? s.petsEquipped : [];
    const pets = Array.isArray(s.pets) ? s.pets : [];
    const out = [];
    for (const uid of eq) {
      const p = pets.find((q) => q && q.uid === uid);
      if (p) out.push(p);
    }
    return out;
  }

  _syncCat() {
    this.cat.setActive(this._equippedPets().some((p) => p.id === 'cyberCat'));
  }

  // Build-in animation: a bought build stays hidden while the shop covers the factory, then drops
  // in with sparkles and a "NEW: <name>!" floater (one at a time, in purchase order).
  _updateBuildFx(dt) {
    if (this.buildFx) {
      this.buildFx.t += dt;
      if (this.buildFx.t >= BUILD_FX_S) this.buildFx = null;
      return;
    }
    if (!this.buildQueue.length || this._uiBlocking()) return;
    const id = this.buildQueue.shift();
    if (!this._buildIds().includes(id)) return;
    this.buildFx = { id, t: 0 };
    const a = BUILD_ANCHORS[id] || { x: 683, y: 600 };
    const name = (BUILDS.find((b) => b.id === id) || {}).name || 'Build';
    this.particles.ring(a.x, a.y, PAL.gold, 260, 0.6);
    this.particles.sparks(a.x, a.y, 40, PAL.gold, 520);
    this.particles.confetti(a.x, a.y, 50, 560);
    this.renderer.flash(COLORS.gold, 0.18, 2.5);
    this.renderer.addShake(0.15);
    // keep the floater over the machine area: never over the HUD or the boss's order bubble
    const fx = Math.max(320, Math.min(720, a.x));
    const fy = Math.max(430, Math.min(760, a.y - 140));
    this.floaters.spawn(`NEW: ${name}!`, fx, fy, { size: 54, color: COLORS.gold, glow: COLORS.goldDeep, life: 2.2, wobble: 1, vy: -30 });
    this._safeSynth('levelUp');
  }

  _buildIntro() {
    const q = this.buildQueue;
    const fx = this.buildFx;
    if (!q.length && !fx) return null;
    if (this._buildIntroCache && this._buildIntroCache.q === q.length && this._buildIntroCache.fx === fx) {
      if (fx) this._buildIntroCache.v.k = Math.min(1, fx.t / BUILD_DROP_S);
      return this._buildIntroCache.v;
    }
    const v = { hide: q.slice(), id: fx ? fx.id : null, k: fx ? Math.min(1, fx.t / BUILD_DROP_S) : 1 };
    this._buildIntroCache = { q: q.length, fx, v };
    return v;
  }

  _buildIds() {
    const n = Math.max(0, Math.min(BUILDS.length, this.save.builds | 0));
    if (this._buildCache && this._buildCache.n === n) return this._buildCache.ids;
    const ids = BUILDS.slice(0, n).map((b) => b.id);
    this._buildCache = { n, ids };
    return ids;
  }

  _drawPets(ctx, r, t) {
    const pets = this._equippedPets();
    if (!pets.length) return;
    r.resetLocal();
    // The Cyber-Cat critter walks the floor itself; other pets hover over the floor strip
    // under the forges (no hit areas, never over a crate or forge).
    let k = 0;
    const n = pets.length;
    for (const p of pets) {
      if (p.id === 'cyberCat' && this.cat.active) continue;
      const lane = 380 + ((k + 0.5) / Math.max(1, n)) * 520;
      const x = lane + Math.sin(t * 0.35 + k * 1.7) * 30;
      const y = PET_Y + Math.sin(t * 2.4 + k * 1.1) * 7;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(x, 1008, 20 - (y - PET_Y) * 0.6, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      try {
        drawPet(ctx, p.id, x, y, 56, t + k, p.golden === true);
      } catch (e) {
        /* never break the frame for a pet */
      }
      k++;
    }
  }

  _spawnBag(x, y, reward) {
    if (this.bags.length >= 3) this.bags.shift();
    this.bags.push({ x0: x, y0: y, x, y, t: 0, reward });
    this.particles.sparks(x, y, 12, PAL.gold, 320);
    this._safeSynth('coin');
  }

  _updateBags(dt) {
    for (let i = this.bags.length - 1; i >= 0; i--) {
      const b = this.bags[i];
      b.t += dt;
      const k = Math.min(1, b.t / BAG_POP);
      const e = 1 - (1 - k) * (1 - k);
      b.x = b.x0 + (BAG_SPOT.x - b.x0) * e;
      b.y = b.y0 + (BAG_SPOT.y - b.y0) * e - Math.sin(k * Math.PI) * 120;
      if (k >= 1) b.y += Math.sin((b.t - BAG_POP) * 5) * 6;
      if (b.t >= BAG_LIFE) this.bags.splice(i, 1);
    }
  }

  /** Bag hit radius in world px: at least 44 CSS px (88 px across), capped so it stays in the dock. */
  _bagRadius() {
    const sc = this.renderer.scale || 1;
    return clamp(44 / sc, 60, 120);
  }

  _tapBag(x, y) {
    if (!this.bags.length) return false;
    const R = this._bagRadius();
    for (let i = this.bags.length - 1; i >= 0; i--) {
      const b = this.bags[i];
      if (b.t < BAG_POP * 0.6) continue;
      if (Math.hypot(x - b.x, y - b.y) > R) continue;
      this.bags.splice(i, 1);
      const got = earnBolts(this.save, b.reward);
      this.floaters.spawn(`+${formatBolts(got)}`, b.x, b.y - 70, { size: 44, color: COLORS.gold, glow: COLORS.goldDeep, life: 1.3, vy: -60 });
      this.particles.coins(b.x, b.y, 12);
      this.particles.ring(b.x, b.y, PAL.gold, 160);
      this._safeSynth('purchase');
      for (let k = 0; k < 3; k++) this.after(0.08 * k, () => this._safeSynth('coin'));
      const sp = this.renderer.worldToScreen(b.x, b.y);
      this.bus.emit('game:bolts', { bolts: this.save.bolts, delta: got, x: sp.x, y: sp.y });
      this._persist();
      this._hud();
      this._refreshOpenShop();
      return true;
    }
    return false;
  }

  _drawBags(ctx, r, t) {
    if (!this.bags.length) return;
    const S = this.sprites;
    for (const b of this.bags) {
      const fade = b.t > BAG_LIFE - 0.6 ? Math.max(0, (BAG_LIFE - b.t) / 0.6) : 1;
      const blink = b.t > BAG_LIFE - 1.2 ? (Math.sin(t * 24) > 0 ? 1 : 0.55) : 1;
      r.resetLocal();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * fade;
      ctx.drawImage(S.soft[PAL.gold], b.x - 80, b.y - 80, 160, 160);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade * blink;
      r.local(b.x, b.y, Math.sin(t * 6) * 0.12, 1);
      // sack
      ctx.fillStyle = '#ffd34d';
      ctx.strokeStyle = '#a86e00';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-16, -30);
      ctx.quadraticCurveTo(-44, 0, -36, 24);
      ctx.quadraticCurveTo(0, 40, 36, 24);
      ctx.quadraticCurveTo(44, 0, 16, -30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#c98a12';
      ctx.fillRect(-18, -36, 36, 9);
      ctx.fillStyle = '#7a4a00';
      ctx.font = `900 30px ${'system-ui, sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('B', 0, 6);
      ctx.globalAlpha = 1;
      r.resetLocal();
      if (b.t > BAG_POP && fade > 0.5) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.8 * (0.5 + 0.5 * Math.sin(t * 9));
        ctx.drawImage(S.glow[PAL.white], b.x + 22, b.y - 40, 18, 18);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    r.resetLocal();
  }

  // ---------------------------------------------------------------------------
  // Foreman's Log
  // ---------------------------------------------------------------------------

  async _openForeman() {
    let snap = { facts: {}, tableMastery: new Array(13).fill(0) };
    try {
      await this.engineReady;
      snap = (await this.engine.snapshot()) || snap;
    } catch (e) {
      console.error('[game] snapshot failed', e);
    }
    // The snapshot is async: a prompt may have opened meanwhile. Never cover a live prompt
    // (its clock would keep running under the drawer).
    if (this._promptOpen()) return;
    try {
      this.ui.openForemanLog(
        { facts: snap.facts || {}, tableMastery: snap.tableMastery || [], settings: { ...this.save.settings, enabledTables: [...(this.save.settings.enabledTables || [])] }, autoTables: this._autoTables() },
        {
          onSettingsChange: (settings) => this._onSettingsChange(settings),
          onReset: () => {
            try {
              this.engine.reset();
            } catch (e) {
              console.error(e);
            }
          },
        },
      );
    } catch (e) {
      console.error('[game] openForemanLog failed', e);
    }
  }

  _onSettingsChange(settings) {
    if (!settings || typeof settings !== 'object') return;
    const cur = this.save.settings;
    if (typeof settings.autoCurriculum === 'boolean') cur.autoCurriculum = settings.autoCurriculum;
    if (Array.isArray(settings.enabledTables)) {
      const t = [...new Set(settings.enabledTables.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 12))].sort((a, b) => a - b);
      cur.enabledTables = t;
    }
    if (typeof settings.sfx === 'boolean') cur.sfx = settings.sfx;
    if (typeof settings.ambient === 'boolean') cur.ambient = settings.ambient;
    this._applySettings();
    this._persist();
    this._hud();
  }
}

const DASH = [14, 12];
const NO_DASH = [];
const PAL_RAINBOW = [PAL.red, PAL.orange, PAL.gold, PAL.green, PAL.cyan, PAL.blue, PAL.purple, PAL.magenta];
