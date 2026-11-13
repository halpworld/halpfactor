import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TABLES } from '../src/math/mastery.js';
import { SAVE_KEY, defaultSave, loadSave, writeSave, safeLocalStorage, sanitizeSave } from '../src/core/save.js';

function memStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    _m: m,
  };
}
const throwing = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

test('defaultSave matches the contract shape', () => {
  assert.deepEqual(defaultSave(), {
    version: 1, bolts: 0, level: 1, ordersCompleted: 0, streak: 0, tutorialDone: false,
    drones: {},
    dronesEquipped: {},
    settings: { autoCurriculum: true, enabledTables: [1, 2, 5, 10], sfx: true, ambient: true },
    upgrades: { forge: 0, belt: 0, magnet: 0, battery: 0, combo: 0 },
    builds: 0, rebirths: 0, pets: [], nextPetUid: 1, petsEquipped: [], petIndex: [],
    styles: { owned: [], belt: 'steel', trail: 'none', theme: 'neon' },
    daily: { last: null, streak: 0 }, stats: { totalBolts: 0 }, econVersion: 1,
  });
  assert.notEqual(defaultSave().settings.enabledTables, defaultSave().settings.enabledTables);
  assert.equal(SAVE_KEY, 'robofactor.save.v1');
});

test('round trip', () => {
  const st = memStorage();
  const s = defaultSave();
  s.bolts = 321; s.level = 4; s.ordersCompleted = 17; s.streak = 3; s.tutorialDone = true;
  s.drones['7'] = true;
  s.upgrades.forge = 3; s.builds = 2; s.rebirths = 1;
  s.pets = [{ uid: 1, id: 'cyberCat', golden: false }, { uid: 2, id: 'gearPup', golden: true }];
  s.nextPetUid = 3; s.petsEquipped = [2]; s.petIndex = ['cyberCat', 'gearPup'];
  s.styles = { owned: ['belt:gold'], belt: 'gold', trail: 'none', theme: 'neon' };
  s.daily = { last: '2026-01-02', streak: 2 }; s.stats.totalBolts = 999;
  s.settings = { autoCurriculum: false, enabledTables: [3, 4], sfx: false, ambient: false };
  assert.equal(writeSave(s, st), true);
  // the combo streak is session-only: it never comes back from storage
  assert.deepEqual(loadSave(st), { ...s, streak: 0 });
});

test('combo streak is not persisted', () => {
  const st = memStorage();
  const s = defaultSave();
  s.streak = 9;
  writeSave(s, st);
  assert.equal(loadSave(st).streak, 0);
  assert.equal(sanitizeSave({ streak: 5 }).streak, 0);
});

test('missing / corrupt / non-object storage contents give defaults', () => {
  assert.deepEqual(loadSave(memStorage()), defaultSave());
  for (const bad of ['', '{', 'null', '42', '"x"', '[]', 'undefined']) {
    assert.deepEqual(loadSave(memStorage({ [SAVE_KEY]: bad })), defaultSave(), bad);
  }
});

test('storage that throws never throws out', () => {
  assert.deepEqual(loadSave(throwing), defaultSave());
  assert.equal(writeSave(defaultSave(), throwing), false);
  assert.deepEqual(loadSave(null), defaultSave());
  assert.equal(writeSave(defaultSave(), null), false);
});

test('sanitises types and ranges', () => {
  const s = sanitizeSave({
    version: 99, bolts: -5, level: 0, ordersCompleted: 'x', streak: 1e99, tutorialDone: 'yes',
    owned: { goldBelts: 1, rainbowTrails: true, cyberCat: 'true', extra: true },
    equipped: { goldBelts: true, rainbowTrails: true, cyberCat: true },
    drones: { 2: true, 5: 'yes', 0: true, 13: true, x: true, 12: true, '07': true },
    settings: { autoCurriculum: 'no', enabledTables: [7, 7, 0, 13, 2.5, '3', null, 3], sfx: 0, ambient: null },
    junk: 1,
  });
  assert.equal(s.version, 1);
  assert.equal(s.bolts, 0);
  assert.equal(s.level, 1);
  assert.equal(s.ordersCompleted, 0);
  assert.ok(s.streak <= 1e7 && Number.isFinite(s.streak));
  assert.equal(s.tutorialDone, false);
  // old cosmetics migrate: only `true` counts as owned; equipped only if owned
  assert.deepEqual(s.styles, { owned: ['trail:rainbow'], belt: 'steel', trail: 'rainbow', theme: 'neon' });
  assert.deepEqual(s.pets, []);
  assert.equal('owned' in s, false);
  assert.equal('equipped' in s, false);
  assert.deepEqual(s.drones, { 2: true, 7: true, 12: true });
  assert.deepEqual(s.settings, { autoCurriculum: true, enabledTables: [3, 7], sfx: true, ambient: true });
  assert.equal('junk' in s, false);
});

test('old cosmetics migrate once into styles/pets; econVersion saves ignore owned/equipped', () => {
  const s = sanitizeSave({
    owned: { goldBelts: true, rainbowTrails: true, cyberCat: true },
    equipped: { goldBelts: true, rainbowTrails: false, cyberCat: true },
  });
  assert.deepEqual(s.styles.owned.sort(), ['belt:gold', 'trail:rainbow']);
  assert.equal(s.styles.belt, 'gold');
  assert.equal(s.styles.trail, 'none');
  assert.deepEqual(s.pets, [{ uid: 1, id: 'cyberCat', golden: false }]);
  assert.deepEqual(s.petsEquipped, [1]);
  assert.equal(s.econVersion, 1);
  // idempotent through storage
  const st = memStorage();
  writeSave(s, st);
  assert.deepEqual(loadSave(st), s);
  // migrated saves never re-add a sold cat
  const sold = sanitizeSave({ ...s, pets: [], petsEquipped: [], owned: { cyberCat: true } });
  assert.deepEqual(sold.pets, []);
  // hostile economy fields are sanitised
  const h = sanitizeSave({ econVersion: 1, pets: [{ uid: -1, id: 'cyberCat' }, { uid: 5, id: '__proto__' }, 7], upgrades: { forge: 1e9 }, builds: 'x', styles: { belt: 'lava' } });
  assert.deepEqual(h.pets, []);
  assert.equal(h.upgrades.forge, 10);
  assert.equal(h.builds, 0);
  assert.equal(h.styles.belt, 'steel');
});

test('bolts clamp allows big tycoon numbers', () => {
  assert.equal(sanitizeSave({ bolts: 5e12 }).bolts, 5e12);
  assert.equal(sanitizeSave({ bolts: 1e300 }).bolts, 1e15);
});

test('numbers: finite, non-negative, floored', () => {
  for (const v of [NaN, Infinity, -Infinity, -1, '5', null, {}, [], undefined]) {
    const s = sanitizeSave({ bolts: v, level: v, ordersCompleted: v, streak: v });
    assert.ok(Number.isFinite(s.bolts) && s.bolts >= 0);
    assert.ok(Number.isInteger(s.level) && s.level >= 1);
    assert.ok(Number.isInteger(s.ordersCompleted) && s.ordersCompleted >= 0);
    assert.ok(Number.isInteger(s.streak) && s.streak >= 0);
  }
  assert.equal(sanitizeSave({ bolts: 12.9 }).bolts, 12);
  assert.equal(sanitizeSave({ level: 3.7 }).level, 3);
});

test('bad containers fall back to defaults; empty enabledTables restored', () => {
  for (const raw of [null, undefined, 5, 'x', [], { owned: 5, equipped: [], drones: [1, 2], settings: 'x' }]) {
    const s = sanitizeSave(raw);
    assert.deepEqual(s, defaultSave());
  }
  assert.deepEqual(sanitizeSave({ settings: { enabledTables: [] } }).settings.enabledTables, [1, 2, 5, 10]);
  assert.deepEqual(sanitizeSave({ settings: { enabledTables: [0, 99] } }).settings.enabledTables, [1, 2, 5, 10]);
  assert.deepEqual(sanitizeSave({ settings: { enabledTables: 'x' } }).settings.enabledTables, [1, 2, 5, 10]);
});

test('writeSave sanitises what it stores; partial saves merge with defaults', () => {
  const st = memStorage();
  writeSave({ bolts: -1, level: 2 }, st);
  const stored = JSON.parse(st.getItem(SAVE_KEY));
  assert.equal(stored.bolts, 0);
  assert.equal(stored.level, 2);
  assert.deepEqual(stored.settings, defaultSave().settings);
  const merged = loadSave(memStorage({ [SAVE_KEY]: JSON.stringify({ bolts: 50, settings: { sfx: false } }) }));
  assert.equal(merged.bolts, 50);
  assert.equal(merged.settings.sfx, false);
  assert.equal(merged.settings.ambient, true);
});

test('safeLocalStorage falls back to a working in-memory shim', () => {
  const s = safeLocalStorage(); // no localStorage in Node
  s.setItem('a', '1');
  assert.equal(s.getItem('a'), '1');
  assert.equal(s.getItem('nope'), null);
  s.removeItem('a');
  assert.equal(s.getItem('a'), null);
  assert.deepEqual(loadSave(), defaultSave()); // default-arg path
});

test('drones: old saves (no dronesEquipped) keep owned drones on; equip state only for owned drones', () => {
  const old = sanitizeSave({ drones: { 7: true, 3: true } });
  assert.deepEqual(old.drones, { 3: true, 7: true });
  assert.deepEqual(old.dronesEquipped, { 3: true, 7: true });
  const s = sanitizeSave({ drones: { 7: true, 3: true }, dronesEquipped: { 7: false, 3: true, 9: true, x: true } });
  assert.deepEqual(s.dronesEquipped, { 3: true });
  const bad = sanitizeSave({ drones: { 4: true }, dronesEquipped: 'yes' });
  assert.deepEqual(bad.dronesEquipped, { 4: true });
  // round-trips through storage
  const st = memStorage();
  writeSave(s, st);
  assert.deepEqual(loadSave(st).dronesEquipped, { 3: true });
});

test('empty enabledTables fallback is the shared DEFAULT_TABLES constant', () => {
  assert.deepEqual(sanitizeSave({ settings: { enabledTables: [] } }).settings.enabledTables, [...DEFAULT_TABLES]);
  assert.deepEqual(defaultSave().settings.enabledTables, [...DEFAULT_TABLES]);
});
