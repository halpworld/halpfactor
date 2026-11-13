import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawBuilds, BUILD_DRAW_IDS, BUILD_ANCHORS } from '../src/render/builds.js';
import { THEME_IDS, paintTheme, drawThemeFx, themeAccent } from '../src/render/themes.js';
import { BELT_SKINS } from '../src/game/belt.js';
import { shopReason, Game } from '../src/game/game.js';
import { migrateEconomy } from '../src/game/economy.js';
import { BUILDS, STYLES } from '../src/game/economy.js';

/** 2D-context stand-in: rejects NaN/Infinity, tracks save/restore balance. */
function mockCtx() {
  let depth = 0;
  let n = 0;
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return (...args) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${String(prop)} got ${a}`);
        n++;
        if (prop === 'save') depth++;
        if (prop === 'restore') depth--;
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return grad;
        return undefined;
      };
    },
    set(t, prop, v) {
      t[prop] = v;
      return true;
    },
  });
  return { ctx, depth: () => depth, calls: () => n };
}
const sprite = {};
const S = { glow: new Array(10).fill(sprite), soft: new Array(10).fill(sprite) };
const R = { resetLocal() {}, local() {} };

test('every Build item has scene art, drawn with balanced state', () => {
  assert.deepEqual([...BUILD_DRAW_IDS].sort(), BUILDS.map((b) => b.id).sort());
  for (let n = 0; n <= BUILDS.length; n++) {
    const ids = BUILDS.slice(0, n).map((b) => b.id);
    for (const t of [0, 1.3, 77.7]) {
      const m = mockCtx();
      drawBuilds(m.ctx, R, t, S, ids);
      assert.equal(m.depth(), 0);
      if (n === 0) assert.equal(m.calls(), 0);
    }
  }
});

test('build-in animation: every build has an anchor; intro hides queued builds and stays balanced', () => {
  const ids = BUILDS.map((b) => b.id);
  for (const id of ids) {
    const a = BUILD_ANCHORS[id];
    assert.ok(a && Number.isFinite(a.x) && Number.isFinite(a.y), id);
    for (const k of [0, 0.3, 1, NaN]) {
      const m = mockCtx();
      drawBuilds(m.ctx, R, 2.5, S, ids, { hide: [], id, k });
      assert.equal(m.depth(), 0);
    }
  }
  const all = mockCtx();
  drawBuilds(all.ctx, R, 1, S, ['sign']);
  const hidden = mockCtx();
  drawBuilds(hidden.ctx, R, 1, S, ['sign'], { hide: ['sign'], id: null, k: 1 });
  assert.ok(all.calls() > 0);
  assert.equal(hidden.calls(), 0);
});

test('every theme/belt style in the shop has a renderer', () => {
  const themes = STYLES.filter((s) => s.kind === 'theme').map((s) => s.id);
  assert.deepEqual([...themes].sort(), [...THEME_IDS].sort());
  const belts = STYLES.filter((s) => s.kind === 'belt').map((s) => s.id);
  for (const b of belts) assert.ok(BELT_SKINS.includes(b), b);
  for (const id of [...THEME_IDS, 'nope', undefined]) {
    const m = mockCtx();
    paintTheme(m.ctx, id);
    for (const t of [0, 3.3, 500]) drawThemeFx(m.ctx, S, t, id);
    assert.equal(m.depth(), 0);
    const a = themeAccent(id);
    assert.ok(a === null || /^#[0-9a-f]{6}$/i.test(a));
  }
});

test('shopReason maps economy reasons to UI REASONS keys or friendly text', () => {
  const uiKeys = new Set(['full', 'inventoryFull', 'poor', 'funds', 'locked', 'equipped', 'slots', 'max']);
  for (const r of ['unknown', 'max', 'bolts', 'locked', 'owned', 'notOwned', 'full', 'equipped', 'slots', 'notEnough', 'claimed', 'badDate', 'order']) {
    const out = shopReason(r);
    assert.ok(uiKeys.has(out) || out.includes(' '), `${r} -> ${out}`);
  }
  assert.equal(shopReason('bolts'), 'poor');
  assert.equal(shopReason(undefined), "Can't do that yet!");
  assert.equal(shopReason('Master the ×3 table first (40%)'), 'Master the ×3 table first (40%)');
});

/** A Game with just enough stubs to run the earn paths (no DOM). */
function fakeGame(shopOpen) {
  const g = Object.create(Game.prototype);
  const refreshed = [];
  g.save = migrateEconomy({ bolts: 0, daily: { last: null, streak: 0 } });
  g.ui = { shop: { isOpen: shopOpen }, refreshShop: (v) => refreshed.push(v) };
  g.bags = [{ x: 1070, y: 650, t: 2, reward: 40 }];
  g.timers = [];
  g.renderer = { scale: 1, cssW: 1366, cssH: 1024, worldToScreen: (x, y) => ({ x, y }) };
  g.floaters = { spawn() {} };
  g.particles = { coins() {}, ring() {} };
  g.bus = { emit() {} };
  g.synth = {};
  g.writeSave = () => {};
  g.cat = { setActive() {} };
  g._hud = () => {};
  g._droneItems = () => [];
  return { g, refreshed };
}

test('an open shop is refreshed when bolts are earned outside it (bag tap, daily chest)', () => {
  const a = fakeGame(true);
  assert.equal(a.g._tapBag(1070, 650), true);
  assert.equal(a.refreshed.length, 1);
  assert.equal(a.refreshed[0].bolts, 40);
  const r = a.g._claimDaily();
  assert.equal(r.ok, true);
  assert.equal(a.refreshed.length, 2);
  assert.equal(a.refreshed[1].bolts, a.g.save.bolts);
  // closed shop: no refresh
  const b = fakeGame(false);
  b.g._tapBag(1070, 650);
  b.g._claimDaily();
  assert.equal(b.refreshed.length, 0);
});
