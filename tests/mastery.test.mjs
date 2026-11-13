import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_TABLES, CURRICULUM, DEFAULT_TABLES, MASTERED_MS, factKey, unlockedTables, MasteryTracker, pickFact,
} from '../src/math/mastery.js';

const NOW = 1_700_000_000_000;

function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rec = (tr, a, b, correct, ms, now = NOW) => tr.record(a, b, { correct, responseTimeMs: ms, now });

test('constants and factKey', () => {
  assert.deepEqual(ALL_TABLES, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(CURRICULUM.length, 9);
  assert.equal(factKey(7, 8), '7x8');
});

test('recording updates counts, EMA and lastSeen', () => {
  const t = new MasteryTracker();
  assert.deepEqual(t.get(3, 4), {
    attempts: 0, correct: 0, avgResponseTimeMs: 0, masteryScore: 0, lastSeen: 0, recentErrors: 0,
  });
  rec(t, 3, 4, true, 2000);
  rec(t, 3, 4, false, 5000, NOW + 10);
  const s = t.get(3, 4);
  assert.equal(s.attempts, 2);
  assert.equal(s.correct, 1);
  assert.equal(s.lastSeen, NOW + 10);
  assert.equal(s.recentErrors, 1);
  assert.ok(Math.abs(s.avgResponseTimeMs - (2000 + 0.3 * 3000)) < 1e-9);
  // order matters for the key
  assert.equal(t.get(4, 3).attempts, 0);
});

test('invalid record input is ignored; bad timing is treated as slow', () => {
  const t = new MasteryTracker();
  rec(t, 0, 5, true, 1000);
  rec(t, 13, 5, true, 1000);
  rec(t, 2.5, 5, true, 1000);
  assert.equal(t.get(2, 5).attempts, 0);
  t.record(2, 5, { correct: true, responseTimeMs: NaN, now: NOW });
  assert.equal(t.get(2, 5).avgResponseTimeMs, 5000);
  t.record(2, 5); // no opts fields at all
  assert.equal(t.get(2, 5).attempts, 2);
});

test('mastery needs >= 3 attempts, speed and accuracy', () => {
  const t = new MasteryTracker();
  rec(t, 6, 7, true, 1200);
  rec(t, 6, 7, true, 1200);
  assert.ok(t.get(6, 7).masteryScore < 0.95, 'two attempts can never be mastered');
  assert.equal(t.isMastered(6, 7), false);
  rec(t, 6, 7, true, 1200);
  assert.ok(t.get(6, 7).masteryScore >= 0.95);
  assert.equal(t.isMastered(6, 7), true);

  // correct but slow: not mastered
  const slow = new MasteryTracker();
  for (let i = 0; i < 6; i++) rec(slow, 6, 8, true, 4500);
  assert.equal(slow.isMastered(6, 8), false);
  assert.ok(slow.get(6, 8).masteryScore < 0.95);

  // unseen: not mastered
  assert.equal(new MasteryTracker().isMastered(1, 1), false);
});

test('errors drop the score and mark recentErrors; recovery follows', () => {
  const t = new MasteryTracker();
  for (let i = 0; i < 4; i++) rec(t, 7, 8, true, 1500);
  const before = t.get(7, 8).masteryScore;
  rec(t, 7, 8, false, 3000);
  const after = t.get(7, 8);
  assert.ok(after.masteryScore < before - 0.2);
  assert.equal(after.recentErrors, 1);
  assert.equal(t.isMastered(7, 8), false);
  for (let i = 0; i < 12; i++) rec(t, 7, 8, true, 1500);
  assert.equal(t.get(7, 8).recentErrors, 0);
  assert.equal(t.isMastered(7, 8), true);
});

test('score bounds and attempts<3 cap', () => {
  const t = new MasteryTracker();
  rec(t, 2, 2, true, 100);
  assert.ok(t.get(2, 2).masteryScore <= 0.3 + 1e-9);
  rec(t, 2, 2, true, 100);
  assert.ok(t.get(2, 2).masteryScore <= 0.6 + 1e-9);
  for (let i = 0; i < 20; i++) rec(t, 2, 2, false, 30000);
  const s = t.get(2, 2).masteryScore;
  assert.ok(s >= 0 && s <= 1);
});

test('tableMastery averages the 12 pairs, taking the better order', () => {
  const t = new MasteryTracker();
  assert.equal(t.tableMastery(5), 0);
  for (let b = 1; b <= 12; b++) for (let i = 0; i < 3; i++) rec(t, 5, b, true, 1000);
  assert.ok(Math.abs(t.tableMastery(5) - 1) < 1e-9);
  assert.ok(t.tableMastery(3) > 0 && t.tableMastery(3) < 1); // 3x5 / 5x3 overlap contributes
  // swapped order counts too
  const u = new MasteryTracker();
  for (let i = 0; i < 3; i++) rec(u, 12, 4, true, 1000);
  assert.ok(Math.abs(u.tableMastery(4) - 1 / 12) < 1e-9);
  assert.equal(u.tableMastery(99), 0);
  const all = u.tableMasteries();
  assert.equal(all.length, 13);
  assert.equal(all[0], 0);
});

test('serialize round-trips and is JSON-able', () => {
  const t = new MasteryTracker();
  for (let i = 0; i < 4; i++) rec(t, 9, 6, i !== 2, 1800 + i * 100);
  rec(t, 3, 3, true, 900);
  const json = JSON.parse(JSON.stringify(t.serialize()));
  const u = new MasteryTracker(json);
  assert.deepEqual(u.get(9, 6), t.get(9, 6));
  assert.deepEqual(u.get(3, 3), t.get(3, 3));
  const snap = u.snapshot();
  assert.ok(snap.facts['9x6']);
  assert.equal(snap.tableMastery.length, 13);
});

test('constructor tolerates garbage', () => {
  const junk = [
    undefined, null, 0, 'str', [], [1, 2], true, NaN,
    {}, { facts: null }, { facts: [] }, { facts: 'x' }, { facts: 5 },
    { facts: { 'abc': {}, '0x5': { attempts: 3 }, '13x2': { attempts: 3 }, '2x2': null, '3x3': 'no', '4x4': [] } },
    { facts: { '5x5': { attempts: -4, correct: 9 } } },
    { facts: { '5x6': { attempts: 'many', correct: {} } } },
    { facts: { '6x6': { attempts: 3, correct: 99, avg: -50, acc: 7, lastSeen: 'yesterday', recentErrors: -3 } } },
    { facts: { '7x7': { attempts: Infinity, correct: NaN, avg: Infinity } } },
    { facts: { '8x8': { attempts: 3, correct: 3, avg: 1000, acc: 1, lastSeen: NOW, recentErrors: 0, __proto__: { x: 1 } } } },
  ];
  for (const j of junk) {
    const t = new MasteryTracker(j);
    for (let a = 1; a <= 12; a++) {
      for (let b = 1; b <= 12; b++) {
        const s = t.get(a, b);
        for (const k of ['attempts', 'correct', 'avgResponseTimeMs', 'masteryScore', 'lastSeen', 'recentErrors']) {
          assert.ok(Number.isFinite(s[k]), `${k} finite for ${JSON.stringify(j)}`);
        }
        assert.ok(s.masteryScore >= 0 && s.masteryScore <= 1);
        assert.ok(s.correct <= s.attempts);
      }
    }
    // still usable
    pickFact(t, [2], { rng: rng32(1), now: NOW });
    JSON.stringify(t.serialize());
  }
  const t = new MasteryTracker({ facts: { '6x6': { attempts: 3, correct: 99, avg: -50, acc: 7, recentErrors: -3 } } });
  const s = t.get(6, 6);
  assert.equal(s.correct, 3);
  assert.equal(s.avgResponseTimeMs, 5000); // corrupted avg = unknown (slow), never a flattering 0
  assert.equal(s.recentErrors, 0);
});

test('constructor normalises fact keys and treats NaN avg as unknown', () => {
  const t = new MasteryTracker({ facts: {
    '07x8': { attempts: 5, correct: 5, avg: 1500, acc: 1, lastSeen: NOW, recentErrors: 0 },
    '7x8': { attempts: 2, correct: 0, avg: 4000, acc: 0, lastSeen: NOW, recentErrors: 2 },
    '3x04': { attempts: 3, correct: 3, avg: 'NaN', acc: 1, lastSeen: NOW, recentErrors: 0 },
  } });
  const keys = Object.keys(t.serialize().facts).sort();
  assert.deepEqual(keys, ['3x4', '7x8']);
  assert.equal(t.get(7, 8).attempts, 5); // clash: the record with more attempts wins
  assert.equal(t.get(3, 4).avgResponseTimeMs, 5000);
  assert.equal(MASTERED_MS, 2500);
});

test('curriculum / unlockedTables', () => {
  assert.deepEqual(unlockedTables(1, { autoCurriculum: true }), [1, 2, 5, 10]);
  assert.deepEqual(unlockedTables(2, { autoCurriculum: true }), [1, 2, 3, 5, 10]);
  assert.deepEqual(unlockedTables(3, undefined), [1, 2, 3, 4, 5, 10]);
  assert.deepEqual(unlockedTables(9, {}), ALL_TABLES);
  assert.deepEqual(unlockedTables(500, { autoCurriculum: true }), ALL_TABLES);
  assert.deepEqual(unlockedTables(0, {}), [1, 2, 5, 10]);
  assert.deepEqual(unlockedTables('x', {}), [1, 2, 5, 10]);
  assert.deepEqual(unlockedTables(NaN, null), [1, 2, 5, 10]);
  // manual
  assert.deepEqual(unlockedTables(9, { autoCurriculum: false, enabledTables: [7, 3, 3, 99, 'x', 0] }), [3, 7]);
  assert.deepEqual(unlockedTables(9, { autoCurriculum: false, enabledTables: [] }), [...DEFAULT_TABLES]);
  assert.deepEqual(unlockedTables(9, { autoCurriculum: false }), [...DEFAULT_TABLES]);
  // curriculum covers every table exactly once
  assert.deepEqual([...CURRICULUM.flat()].sort((a, b) => a - b), ALL_TABLES);
});

test('pickFact output shape and ranges', () => {
  const t = new MasteryTracker();
  const rng = rng32(42);
  for (let i = 0; i < 500; i++) {
    const f = pickFact(t, [3, 7], { rng, now: NOW });
    assert.ok(Number.isInteger(f.a) && Number.isInteger(f.b));
    assert.ok(f.a >= 1 && f.a <= 12 && f.b >= 1 && f.b <= 12);
    assert.ok([3, 7].includes(f.a) || [3, 7].includes(f.b));
    assert.equal(typeof f.isPractice, 'boolean');
  }
  // garbage tables fall back
  const g = pickFact(t, [], { rng, now: NOW });
  assert.ok([2, 5, 10].includes(g.a) || [2, 5, 10].includes(g.b));
  pickFact(t, null, { rng, now: NOW });
  pickFact(t, 'nope', { rng, now: NOW });
});

test('low-level gentleness: b stays within 1..10 for small table sets; 11/12 appear later', () => {
  const t = new MasteryTracker();
  const rng = rng32(7);
  for (let i = 0; i < 400; i++) {
    const f = pickFact(t, [1, 2, 5, 10], { rng, now: NOW });
    const other = [1, 2, 5, 10].includes(f.a) ? f.b : f.a;
    assert.ok(other <= 10);
  }
  let saw12 = false;
  for (let i = 0; i < 2000 && !saw12; i++) {
    const f = pickFact(t, ALL_TABLES, { rng, now: NOW });
    if (f.a === 12 || f.b === 12) saw12 = true;
  }
  assert.ok(saw12);
});

function share(tr, tables, key, n, opts = {}) {
  const rng = rng32(12345);
  let hits = 0;
  const [x, y] = key;
  for (let i = 0; i < n; i++) {
    const f = pickFact(tr, tables, { rng, now: NOW, ...opts });
    if ((f.a === x && f.b === y) || (f.a === y && f.b === x)) hits++;
  }
  return hits / n;
}

test('weak (slow / error) facts are picked far more often than mastered ones', () => {
  const t = new MasteryTracker();
  for (let b = 1; b <= 10; b++) for (let i = 0; i < 4; i++) { rec(t, 3, b, true, 1200); rec(t, b, 3, true, 1200); }
  const uniform = 1 / 10;
  const baseline = share(t, [3], [3, 4], 4000);
  assert.ok(baseline < uniform, 'mastered facts are below uniform');

  // introduce an error-prone fact
  rec(t, 3, 7, false, 6000);
  const withError = share(t, [3], [3, 7], 4000);
  assert.ok(withError > 0.4, `error fact share ${withError}`);
  assert.ok(withError > baseline * 5);

  // slow fact, no errors
  const t2 = new MasteryTracker();
  for (let b = 1; b <= 10; b++) for (let i = 0; i < 4; i++) rec(t2, 3, b, true, b === 8 ? 6500 : 1200);
  const slowShare = share(t2, [3], [3, 8], 4000);
  assert.ok(slowShare > 0.3, `slow fact share ${slowShare}`);
});

test('unseen facts are favoured over mastered ones; long-unseen facts creep back', () => {
  const t = new MasteryTracker();
  for (let b = 1; b <= 10; b++) if (b !== 9) for (let i = 0; i < 4; i++) rec(t, 4, b, true, 1100);
  const unseen = share(t, [4], [4, 9], 4000);
  assert.ok(unseen > 0.25, `unseen share ${unseen}`);

  // same mastered facts, but 'now' is 10 days later => spacing raises their weight
  const fresh = share(t, [4], [4, 3], 4000);
  const later = share(t, [4], [4, 3], 4000, { now: NOW + 10 * 86400000 });
  assert.ok(later > fresh, `spacing ${later} > ${fresh}`);
});

test('recentKeys are avoided', () => {
  const t = new MasteryTracker();
  const rng = rng32(99);
  let hits = 0;
  for (let i = 0; i < 2000; i++) {
    const f = pickFact(t, [6], { rng, now: NOW, recentKeys: ['6x7', '7x6'] });
    if ((f.a === 6 && f.b === 7) || (f.a === 7 && f.b === 6)) hits++;
  }
  assert.ok(hits / 2000 < 0.02, `recent share ${hits / 2000}`);
  // single-fact table + recent must still return something
  const only = pickFact(t, [1], { rng, now: NOW, recentKeys: ALL_TABLES.flatMap((b) => [factKey(1, b), factKey(b, 1)]) });
  assert.ok(only.a >= 1 && only.b >= 1);
});

test('isPractice flags weak facts only', () => {
  const t = new MasteryTracker();
  for (let b = 1; b <= 10; b++) for (let i = 0; i < 4; i++) { rec(t, 2, b, true, 1000); rec(t, b, 2, true, 1000); }
  const rng = rng32(5);
  for (let i = 0; i < 200; i++) assert.equal(pickFact(t, [2], { rng, now: NOW }).isPractice, false);
  rec(t, 2, 6, false, 5000);
  let practice = 0, other = 0;
  for (let i = 0; i < 500; i++) {
    const f = pickFact(t, [2], { rng, now: NOW });
    const is26 = (f.a === 2 && f.b === 6) || (f.a === 6 && f.b === 2);
    if (is26) { assert.equal(f.isPractice, true); practice++; } else { assert.equal(f.isPractice, false); other++; }
  }
  assert.ok(practice > 0 && other > 0);
});

test('small table override [7]: perfect fast answers reach the drone gate (>= 0.95)', async () => {
  const { basicsMastered } = await import('../src/math/mastery.js');
  const tr = new MasteryTracker();
  const rng = rng32(42);
  const recent = [];
  let now = NOW;
  let n = 0;
  let sawElevenTwelve = false;
  while (tr.tableMastery(7) < 0.95 && n < 2000) {
    const f = pickFact(tr, [7], { rng, now, recentKeys: recent });
    if (f.a > 10 || f.b > 10) sawElevenTwelve = true;
    rec(tr, f.a, f.b, true, 1200, now);
    recent.unshift(factKey(f.a, f.b));
    recent.length = Math.min(recent.length, 4);
    now += 8000;
    n++;
  }
  assert.ok(tr.tableMastery(7) >= 0.95, `table 7 mastery ${tr.tableMastery(7)} after ${n} answers`);
  assert.ok(sawElevenTwelve, 'x11/x12 facts must open up once x1..x10 are mastered');
  assert.ok(basicsMastered(tr, 7));
});

test('small table override keeps x11/x12 closed until basics are mastered', () => {
  const tr = new MasteryTracker();
  const rng = rng32(7);
  for (let i = 0; i < 300; i++) {
    const f = pickFact(tr, [2, 5], { rng, now: NOW });
    assert.ok(f.a <= 10 && f.b <= 10, `${f.a}x${f.b} asked before basics mastered`);
  }
});
