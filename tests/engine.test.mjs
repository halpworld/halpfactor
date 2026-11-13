import test from 'node:test';
import assert from 'node:assert/strict';
import { MathEngine, MASTERY_KEY } from '../src/math/engine.js';
import { createHandler } from '../src/math/worker.js';

function memStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

test('engine (in-thread fallback in Node): order, record, snapshot, persist, reset', async () => {
  const st = memStorage();
  const e = await MathEngine.create({ storage: st });
  const o = await e.nextOrder(1, { autoCurriculum: true });
  assert.equal(o.target, o.a * o.b);
  assert.equal(typeof o.isPractice, 'boolean');
  assert.equal(o.mastered, false); // nothing recorded yet
  const s = await e.nextSurge(3, { autoCurriculum: true });
  assert.ok(s.a >= 1 && s.b >= 1 && s.a <= 12 && s.b <= 12);

  for (let i = 0; i < 3; i++) e.record(4, 5, true, 1000);
  e.flush();
  const saved = JSON.parse(st.getItem(MASTERY_KEY));
  assert.equal(saved.facts['4x5'].attempts, 3);
  const snap = await e.snapshot();
  assert.equal(snap.facts['4x5'].attempts, 3);
  assert.equal(snap.tableMastery.length, 13);
  assert.ok(e.tableMasteryCached(4) > 0);

  // a new engine loads persisted state
  const e2 = await MathEngine.create({ storage: st });
  assert.ok((await e2.snapshot()).facts['4x5']);
  e2.reset();
  assert.equal(e2.tableMasteryCached(4), 0);
  assert.deepEqual(JSON.parse(st.getItem(MASTERY_KEY)).facts, {});
});

test('engine tolerates garbage / throwing storage and bad args', async () => {
  const bad = memStorage({ [MASTERY_KEY]: '{not json' });
  const e = await MathEngine.create({ storage: bad });
  e.record(0, 99, true, NaN);
  assert.equal((await e.nextOrder(1, {})).target > 0, true);
  const thrower = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  const e2 = await MathEngine.create({ storage: thrower });
  e2.record(2, 3, true, 900);
  e2.flush();
  assert.equal((await e2.snapshot()).facts['2x3'].attempts, 1);
  const e3 = await MathEngine.create({});
  assert.ok((await e3.nextSurge(1, null)).a >= 1);
});

test('worker message protocol via createHandler', () => {
  const out = [];
  const h = createHandler((m) => out.push(m));
  h({ type: 'init', data: { facts: {} } });
  assert.equal(out.pop().type, 'ready');
  h({ type: 'record', a: 3, b: 3, correct: true, responseTimeMs: 1000, now: 1 });
  const st = out.pop();
  assert.equal(st.type, 'state');
  assert.equal(st.data.facts['3x3'].attempts, 1);
  assert.equal(st.tableMastery.length, 13);
  h({ type: 'next', id: 7, kind: 'order', tables: [3], recentKeys: [] });
  const n = out.pop();
  assert.equal(n.type, 'next'); assert.equal(n.id, 7);
  h({ type: 'snapshot', id: 8 });
  const sn = out.pop();
  assert.equal(sn.id, 8); assert.ok(sn.facts['3x3']);
  h({ type: 'reset' });
  assert.deepEqual(out.pop().data.facts, {});
  h(null); h('x'); h({ type: 'bogus' });
  assert.equal(out.length, 0);
});

test('worker next message carries mastered; engine nextOrder passes it through', async () => {
  const out = [];
  const h = createHandler((m) => out.push(m));
  h({ type: 'init', data: null });
  for (let i = 0; i < 5; i++) h({ type: 'record', a: 7, b: 1, correct: true, responseTimeMs: 1000, now: Date.now() });
  h({ type: 'next', id: 1, kind: 'order', tables: [7], recentKeys: [] });
  const n = out.find((m) => m.type === 'next');
  assert.equal(typeof n.mastered, 'boolean');

  const st = memStorage();
  const e = await MathEngine.create({ storage: st });
  for (let b = 1; b <= 10; b++) for (let i = 0; i < 5; i++) e.record(2, b, true, 1000);
  let mastered = 0;
  for (let i = 0; i < 40; i++) {
    const o = await e.nextOrder(9, { autoCurriculum: false, enabledTables: [2] });
    assert.equal(typeof o.mastered, 'boolean');
    if (o.mastered) mastered++;
  }
  assert.ok(mastered > 0);
});
