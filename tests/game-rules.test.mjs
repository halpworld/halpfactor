import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrationRecord, surgeRecord, surgeGate, surgeTriggerPoint, cancelBreaksStreak, deliveryOutcome } from '../src/game/rules.js';

test('cancel without typing anything records nothing', () => {
  assert.deepEqual(calibrationRecord({ cancelled: true, answered: false, firstTryCorrect: false, responseTimeMs: 0 }), { record: false, correct: false, ms: 0 });
  // legacy shape without `answered` must not be treated as an error either
  assert.equal(calibrationRecord({ cancelled: true, firstTryCorrect: false, responseTimeMs: 5400 }).record, false);
});

test('cancel after a wrong first submission records one wrong attempt at first-submission time', () => {
  assert.deepEqual(calibrationRecord({ cancelled: true, answered: true, firstTryCorrect: false, responseTimeMs: 2100 }), { record: true, correct: false, ms: 2100 });
});

test('cancel after a correct first submission (cannot normally happen) records nothing', () => {
  assert.equal(calibrationRecord({ cancelled: true, answered: true, firstTryCorrect: true, responseTimeMs: 900 }).record, false);
});

test('completed prompts record firstTryCorrect and time', () => {
  assert.deepEqual(calibrationRecord({ cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 1500 }), { record: true, correct: true, ms: 1500 });
  assert.deepEqual(calibrationRecord({ cancelled: false, answered: true, firstTryCorrect: false, responseTimeMs: 3000 }), { record: true, correct: false, ms: 3000 });
});

test('drone auto-solve and missing results record nothing', () => {
  assert.equal(calibrationRecord({ cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 1200 }, { auto: true }).record, false);
  assert.equal(calibrationRecord(null).record, false);
});

test('calibration results with no usable response time are never recorded', () => {
  for (const ms of [0, -5, NaN, Infinity, undefined]) {
    assert.equal(calibrationRecord({ cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: ms }).record, false, String(ms));
    assert.equal(calibrationRecord({ cancelled: true, answered: true, firstTryCorrect: false, responseTimeMs: ms }).record, false, String(ms));
  }
});

test('surge results: recorded with their time; null or non-positive time never recorded', () => {
  assert.deepEqual(surgeRecord({ firstTryCorrect: true, inTime: true, responseTimeMs: 1800 }), { record: true, correct: true, ms: 1800 });
  assert.deepEqual(surgeRecord({ firstTryCorrect: false, inTime: false, responseTimeMs: 4000 }), { record: true, correct: false, ms: 4000 });
  assert.equal(surgeRecord(null).record, false);
  assert.equal(surgeRecord(undefined).record, false);
  for (const ms of [0, -1, NaN, undefined]) assert.equal(surgeRecord({ firstTryCorrect: true, responseTimeMs: ms }).record, false, String(ms));
});

test('surgeGate: fires at the half-way point, holds (never drops) while the UI is blocking', () => {
  assert.equal(surgeGate({ pending: false, delivered: 5, total: 10, blocking: false }), 'none');
  assert.equal(surgeGate({ pending: true, delivered: 4, total: 10, blocking: false }), 'none');
  assert.equal(surgeGate({ pending: true, delivered: 4, total: 10, blocking: true }), 'none');
  assert.equal(surgeGate({ pending: true, delivered: 5, total: 10, blocking: false }), 'fire');
  assert.equal(surgeGate({ pending: true, delivered: 5, total: 10, blocking: true }), 'hold');
  // even if every crate already arrived in the same tick, a blocked surge holds instead of finishing
  assert.equal(surgeGate({ pending: true, delivered: 10, total: 10, blocking: true }), 'hold');
  assert.equal(surgeTriggerPoint(7), 3);
});

test('regression: a surge due while the shop stays open is deferred until it closes, then fires before the order finishes', () => {
  // Minimal model of Game._updateCargo's use of surgeGate.
  const st = { delivered: 0, total: 10, surgeDue: true, surgeFired: false, finished: false, blocking: false };
  const tick = () => {
    const gate = () => surgeGate({ pending: st.surgeDue && !st.surgeFired, delivered: st.delivered, total: st.total, blocking: st.blocking });
    const g0 = gate();
    if (g0 === 'hold') return; // frozen
    if (g0 === 'fire') { st.surgeFired = true; st.firedAt = st.delivered; return; }
    if (st.delivered < st.total) st.delivered++;
    const g = gate();
    if (g === 'fire') { st.surgeFired = true; st.firedAt = st.delivered; return; }
    if (g === 'hold') return;
    if (st.delivered >= st.total) st.finished = true;
  };
  for (let i = 0; i < 4; i++) tick();
  st.blocking = true; // shop opens just before the trigger point
  for (let i = 0; i < 200; i++) tick();
  assert.equal(st.finished, false);
  assert.equal(st.surgeFired, false);
  assert.ok(st.delivered <= surgeTriggerPoint(st.total));
  st.blocking = false; // shop closes
  tick();
  assert.equal(st.surgeFired, true);
  assert.equal(st.firedAt, surgeTriggerPoint(st.total));
  for (let i = 0; i < 20; i++) tick();
  assert.equal(st.finished, true);
});

test('cancelBreaksStreak: only a cancel after a wrong submission', () => {
  assert.equal(cancelBreaksStreak({ cancelled: true, answered: true, firstTryCorrect: false, responseTimeMs: 900 }), true);
  assert.equal(cancelBreaksStreak({ cancelled: true, answered: false, responseTimeMs: 900 }), false);
  assert.equal(cancelBreaksStreak({ cancelled: true }), false);
  assert.equal(cancelBreaksStreak({ firstTryCorrect: false, answered: true }), false); // not cancelled
  assert.equal(cancelBreaksStreak(null), false);
});

test('deliveryOutcome: wrong-then-cancel order is neither first-try nor CRITICAL', () => {
  const calib = { firstTryCorrect: true, responseTimeMs: 1200, auto: false };
  const base = { streak: 4, mismatches: 0, tutorial: false, calib, criticalMs: 3000 };
  assert.deepEqual(deliveryOutcome({ ...base, wrongThisOrder: false }), { streak: 5, critical: true });
  assert.deepEqual(deliveryOutcome({ ...base, wrongThisOrder: true }), { streak: 0, critical: false });
  assert.deepEqual(deliveryOutcome({ ...base, wrongThisOrder: false, mismatches: 1 }), { streak: 0, critical: false });
  assert.deepEqual(deliveryOutcome({ ...base, calib: { ...calib, firstTryCorrect: false } }), { streak: 0, critical: false });
});

test('deliveryOutcome: drone and tutorial orders neither break nor extend the streak', () => {
  const base = { streak: 3, mismatches: 0, wrongThisOrder: false, criticalMs: 3000 };
  const auto = deliveryOutcome({ ...base, tutorial: false, calib: { firstTryCorrect: true, responseTimeMs: 0, auto: true } });
  assert.deepEqual(auto, { streak: 3, critical: false });
  const autoMiss = deliveryOutcome({ ...base, tutorial: false, calib: { firstTryCorrect: false, responseTimeMs: 0, auto: true } });
  assert.equal(autoMiss.streak, 3);
  const tut = deliveryOutcome({ ...base, tutorial: true, calib: { firstTryCorrect: true, responseTimeMs: 900, auto: false } });
  assert.equal(tut.streak, 3);
  const tutWrong = deliveryOutcome({ ...base, tutorial: true, calib: { firstTryCorrect: false, responseTimeMs: 900, auto: false } });
  assert.equal(tutWrong.streak, 3);
});
