// Engine harness: real Game + render stack, stub synth/ui/engine/save.
import { Emitter } from '../src/core/events.js';
import { Game } from '../src/game/game.js';
import { makeSynth } from './stubs/synth.js';
import { makeEngine } from './stubs/engine.js';
import { makeSave, unlockedTables } from './stubs/save.js';
import { makeUI } from './stubs/ui.js';

const logEl = document.getElementById('log');
const lines = [];
const log = (m) => {
  lines.unshift(m);
  lines.length = Math.min(lines.length, 14);
  logEl.textContent = lines.join('\n');
};
window.addEventListener('error', (e) => log('ERROR ' + (e.error && e.error.stack || e.message)));

const params = new URLSearchParams(location.search);
const bus = new Emitter();
const synth = makeSynth(params.has('quiet') ? null : log);
const engine = makeEngine(log);
const save = makeSave({
  tutorialDone: !params.has('tutorial'),
  bolts: Number(params.get('bolts') || 0),
});
const own = (kind, id) => { save.styles.owned.push(kind + ':' + id); save.styles[kind] = id; };
if (params.has('cat')) { save.pets.push({ uid: save.nextPetUid, id: 'cyberCat', golden: false }); save.petsEquipped.push(save.nextPetUid++); save.petIndex.push('cyberCat'); }
if (params.has('rainbow')) own('trail', 'rainbow');
if (params.has('gold')) own('belt', 'gold');
if (params.has('drone')) { const t = Number(params.get('drone')); save.drones[t] = true; save.dronesEquipped = { ...(save.dronesEquipped || {}), [t]: true }; }
const ui = makeUI(document.getElementById('ui'), bus, log);
const writes = [];
const game = new Game({
  canvas: document.getElementById('game'),
  ui,
  synth,
  engine: Promise.resolve(engine),
  save,
  bus,
  writeSave: (s) => writes.push(JSON.stringify(s)),
  unlockedTables,
});
game.start();
bus.on('game:bolts', (p) => log('game:bolts ' + JSON.stringify(p)));

// Test helpers for scripted play-throughs.
window.__h = {
  game, ui, engine, save, synth, bus, writes,
  /** Tap a world point through the real pointer path. */
  tapWorld(x, y) {
    const s = game.renderer.worldToScreen(x, y);
    const c = game.canvas.getBoundingClientRect();
    const o = { clientX: c.left + s.x, clientY: c.top + s.y, pointerId: 1, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true };
    game.canvas.dispatchEvent(new PointerEvent('pointerdown', o));
    game.canvas.dispatchEvent(new PointerEvent('pointerup', o));
  },
  tapDisp(v) { const d = game.dispensers[v]; this.tapWorld(d.cx, d.cy); },
  tapForge(m) { const f = game.forges[m]; this.tapWorld(f.cx, f.cy); },
  answer(correct = true) {
    const p = ui.pending;
    if (!p) return false;
    p.answer(correct ? p.o.a * p.o.b : p.o.a * p.o.b + 1);
    return true;
  },
  /** Solve the current order via a valid dispenser/forge pair. */
  solve() {
    const o = game.order;
    if (!o) return false;
    this.tapDisp(o.a);
    this.tapForge(o.b);
    return true;
  },
  state() {
    return { phase: game.phase, order: game.order, bolts: save.bolts, level: save.level, orders: save.ordersCompleted, overclock: +game.overclock.toFixed(2), tutStep: game.tutStep, pending: ui.pending && ui.pending.kind, particles: game.particles.high, err: game.errCount };
  },
};
window.__game = game;
