import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrationRecord, surgeRecord, surgeGate, surgeTriggerPoint, cancelBreaksStreak, deliveryOutcome,
  orderKind, buildPairOk, buildMachineOk, factorMismatchRecord, FACTOR_CRITICAL_MS, FACTOR_MISS_MS,
  FACTOR_MIN_TARGET, WIRE_ALLOWANCE_MS, buildRecallMs, buildCalibrationRecord, hadWrongSubmission,
  orderClockRuns, logPeeksOrder, promptClockRuns, orderClockAfterPrompt, IDLE_SKIP_MS,
} from '../src/game/rules.js';
import { bubbleText } from '../src/game/boss.js';

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

test('orderKind: build unless the fact is mastered (and never in the tutorial)', () => {
  const lo = () => 0.1;
  const hi = () => 0.9;
  const T = 56;
  assert.equal(orderKind({ mastered: false, tutorial: false, target: T }, lo), 'build');
  assert.equal(orderKind({ mastered: true, tutorial: true, target: T }, lo), 'build');
  assert.equal(orderKind({ mastered: true, tutorial: false, target: T }, lo), 'factor');
  assert.equal(orderKind({ mastered: true, tutorial: false, target: T }, hi), 'build');
  assert.equal(orderKind({ mastered: 'yes', target: T }, lo), 'build'); // only a real true counts
  assert.equal(orderKind({}, lo), 'build');
  assert.equal(orderKind(undefined, lo), 'build');
  // roughly half of mastered orders are factor orders
  let f = 0;
  let x = 1;
  const rng = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2000; i++) if (orderKind({ mastered: true, target: T }, rng) === 'factor') f++;
  assert.ok(f > 850 && f < 1150, String(f));
});

test('buildPairOk / buildMachineOk: the asked pair in either order, nothing else', () => {
  const o = { a: 7, b: 8, target: 56 };
  assert.equal(buildPairOk(o, 7, 8), true);
  assert.equal(buildPairOk(o, 8, 7), true);
  assert.equal(buildPairOk(o, 7, 7), false);
  assert.equal(buildPairOk(o, 8, 8), false);
  assert.equal(buildPairOk({ a: 4, b: 6, target: 24 }, 3, 8), false); // same product, other fact
  assert.equal(buildPairOk(null, 7, 8), false);
  assert.equal(buildMachineOk(o, 7), true);
  assert.equal(buildMachineOk(o, 8), true);
  assert.equal(buildMachineOk(o, 6), false);
  assert.equal(buildPairOk({ a: 6, b: 6 }, 6, 6), true);
});

test('factorMismatchRecord: first mismatch records the order fact as wrong, slow; later ones nothing', () => {
  const o = { a: 7, b: 8, target: 56 };
  assert.deepEqual(factorMismatchRecord(o, 0), { record: true, a: 7, b: 8, correct: false, ms: FACTOR_MISS_MS });
  assert.equal(FACTOR_MISS_MS, 5000);
  assert.equal(factorMismatchRecord(o, 1).record, false);
  assert.equal(factorMismatchRecord(o, 2).record, false);
  assert.equal(factorMismatchRecord(null, 0).record, false);
});

test('deliveryOutcome with the factor CRITICAL threshold', () => {
  const base = { streak: 2, mismatches: 0, wrongThisOrder: false, tutorial: false, criticalMs: FACTOR_CRITICAL_MS };
  assert.equal(FACTOR_CRITICAL_MS, 6000);
  assert.deepEqual(deliveryOutcome({ ...base, calib: { firstTryCorrect: true, responseTimeMs: 4500, auto: false } }), { streak: 3, critical: true });
  assert.deepEqual(deliveryOutcome({ ...base, calib: { firstTryCorrect: true, responseTimeMs: 7000, auto: false } }), { streak: 3, critical: false });
  assert.deepEqual(deliveryOutcome({ ...base, mismatches: 1, calib: { firstTryCorrect: false, responseTimeMs: 2000, auto: false } }), { streak: 0, critical: false });
});

test('orderKind: practice (weak) facts are always build orders', () => {
  const lo = () => 0;
  assert.equal(orderKind({ mastered: true, isPractice: true, target: 56 }, lo), 'build');
  assert.equal(orderKind({ mastered: true, isPractice: false, target: 56 }, lo), 'factor');
});

test('orderKind: targets up to 12 are never factor orders (crate 1 + forge ×target would copy)', () => {
  const lo = () => 0;
  assert.equal(FACTOR_MIN_TARGET, 12);
  for (const target of [1, 7, 10, 12]) assert.equal(orderKind({ mastered: true, target }, lo), 'build', String(target));
  assert.equal(orderKind({ mastered: true, target: 14 }, lo), 'factor');
  assert.equal(orderKind({ mastered: true }, lo), 'build'); // missing target -> build
  assert.equal(orderKind({ mastered: true, target: NaN }, lo), 'build');
});

test('buildRecallMs: keypad time plus ready-to-wire time beyond the wiring allowance', () => {
  assert.equal(WIRE_ALLOWANCE_MS, 2500);
  assert.equal(buildRecallMs(1500, 0), 1500);
  assert.equal(buildRecallMs(1500, 1800), 1500); // quick wire: never below the keypad time
  assert.equal(buildRecallMs(1500, 2500), 1500);
  assert.equal(buildRecallMs(1500, 9000), 8000); // worked it out while staring at the bubble
  assert.equal(buildRecallMs(1500, NaN), 1500);
  assert.equal(buildRecallMs(0, 9000), 0); // no keypad time -> nothing to record
  assert.equal(buildRecallMs(undefined, 9000), 0);
});

test('buildCalibrationRecord: uses recall time; nothing after an earlier wrong submission or a peek', () => {
  const ok = { cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 1200 };
  assert.deepEqual(buildCalibrationRecord(ok, { awaitMs: 6000 }), { record: true, correct: true, ms: 4700 });
  assert.deepEqual(buildCalibrationRecord(ok, { awaitMs: 500 }), { record: true, correct: true, ms: 1200 });
  // regression: wrong -> blueprint shows the product -> cancel -> re-wire -> fast "correct"
  assert.equal(buildCalibrationRecord(ok, { wrongBefore: true, awaitMs: 500 }).record, false);
  assert.equal(buildCalibrationRecord(ok, { peeked: true }).record, false);
  assert.equal(buildCalibrationRecord(ok, { auto: true }).record, false);
  // the wrong-then-cancel itself is still recorded (once)
  const wrongCancel = { cancelled: true, answered: true, firstTryCorrect: false, responseTimeMs: 2100 };
  assert.deepEqual(buildCalibrationRecord(wrongCancel, { awaitMs: 3500 }), { record: true, correct: false, ms: 3100 });
  assert.equal(buildCalibrationRecord({ cancelled: true, answered: false, responseTimeMs: 0 }, { awaitMs: 3000 }).record, false);
  assert.equal(buildCalibrationRecord(null).record, false);
});

test('hadWrongSubmission: completed-wrong and cancel-after-wrong, not a blank cancel', () => {
  assert.equal(hadWrongSubmission({ cancelled: false, answered: true, firstTryCorrect: false, responseTimeMs: 900 }), true);
  assert.equal(hadWrongSubmission({ cancelled: true, answered: true, firstTryCorrect: false, responseTimeMs: 900 }), true);
  assert.equal(hadWrongSubmission({ cancelled: true, answered: false, firstTryCorrect: false, responseTimeMs: 0 }), false);
  assert.equal(hadWrongSubmission({ cancelled: true }), false);
  assert.equal(hadWrongSubmission({ cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 900 }), false);
  assert.equal(hadWrongSubmission(null), false);
});

test('orderClockRuns: only at await with an order and nothing covering the factory', () => {
  assert.equal(orderClockRuns({ phase: 'await', hasOrder: true, blocking: false }), true);
  assert.equal(orderClockRuns({ phase: 'await', hasOrder: true, blocking: true }), false);
  assert.equal(orderClockRuns({ phase: 'await', hasOrder: false, blocking: false }), false);
  for (const phase of ['arriving', 'calibrating', 'mismatch', 'delivering', 'surge', 'departing']) {
    assert.equal(orderClockRuns({ phase, hasOrder: true, blocking: false }), false, phase);
  }
  // per order, not per wire: await -> calibrating (cancelled) -> await keeps adding up
  let ms = 0;
  const seq = [['await', 3], ['calibrating', 5], ['await', 2]];
  for (const [phase, n] of seq) for (let i = 0; i < n; i++) if (orderClockRuns({ phase, hasOrder: true, blocking: false })) ms += 1000;
  assert.equal(ms, 5000);
});

test('logPeeksOrder and deliveryOutcome peeked: no CRITICAL, streak unaffected', () => {
  assert.equal(logPeeksOrder('await'), true);
  assert.equal(logPeeksOrder('calibrating'), true);
  for (const p of ['arriving', 'mismatch', 'delivering', 'surge', 'departing']) assert.equal(logPeeksOrder(p), false, p);
  const base = { streak: 2, mismatches: 0, wrongThisOrder: false, tutorial: false, criticalMs: 3000, calib: { firstTryCorrect: true, responseTimeMs: 900, auto: false } };
  assert.deepEqual(deliveryOutcome(base), { streak: 3, critical: true });
  assert.deepEqual(deliveryOutcome({ ...base, peeked: true }), { streak: 3, critical: false });
});

test('factor first mismatch: the count is read before _mismatch increments it', () => {
  // Game._wireFactor calls factorMismatchRecord(order, this.mismatches) and only then
  // _mismatch() increments; model that sequence.
  const order = { a: 7, b: 8, target: 56 };
  let mismatches = 0;
  const recs = [];
  for (let i = 0; i < 3; i++) {
    const r = factorMismatchRecord(order, mismatches);
    if (r.record) recs.push(r);
    mismatches++;
  }
  assert.deepEqual(recs, [{ record: true, a: 7, b: 8, correct: false, ms: FACTOR_MISS_MS }]);
});

test('bubbleText: build shows "a × b" and never the product; factor shows the target', () => {
  const part = { name: 'Fusion Orbs' };
  for (let a = 1; a <= 12; a++) {
    for (let b = 1; b <= 12; b++) {
      const t = bubbleText(a * b, part, { a, b });
      assert.equal(t.line1, 'BUILD');
      assert.equal(t.num, `${a} × ${b}`);
      const nums = `${t.line1} ${t.num} ${t.line2}`.match(/\d+/g).map(Number);
      // the product may only appear when it equals one of the factors (a×1, 1×b)
      if (a * b !== a && a * b !== b) assert.ok(!nums.includes(a * b), `${a}x${b}`);
    }
  }
  const f = bubbleText(56, part, null);
  assert.deepEqual(f, { line1: 'NEED', num: '56', line2: 'Fusion Orbs' });
});

test('promptClockRuns: only while a timed build-order prompt is up and no other overlay covers it', () => {
  assert.equal(promptClockRuns({ phase: 'calibrating', timing: true, covered: false }), true);
  assert.equal(promptClockRuns({ phase: 'calibrating', timing: true, covered: true }), false);
  assert.equal(promptClockRuns({ phase: 'calibrating', timing: false, covered: false }), false); // drone / factor
  assert.equal(promptClockRuns({ phase: 'await', timing: true, covered: false }), false);
});

test('orderClockAfterPrompt: cancelled prompts add their time, answered ones do not', () => {
  assert.equal(orderClockAfterPrompt(500, 8000, { cancelled: true, answered: false, responseTimeMs: 0 }), 8500);
  assert.equal(orderClockAfterPrompt(500, 8000, { cancelled: true, answered: true, firstTryCorrect: false, responseTimeMs: 3000 }), 8500);
  assert.equal(orderClockAfterPrompt(500, 8000, { cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 7900 }), 500);
  assert.equal(orderClockAfterPrompt(500, 8000, null), 500);
  assert.equal(orderClockAfterPrompt(NaN, NaN, { cancelled: true }), 0);
});

test('regression: think in the keypad, blank cancel, re-wire, answer fast -> still slow, no CRITICAL', () => {
  // Game._wire sequence, modelled with the same pure helpers and a 1 ms tick.
  const tick = (st, ms) => {
    for (let i = 0; i < ms; i++) {
      if (orderClockRuns({ phase: st.phase, hasOrder: true, blocking: st.phase !== 'await' })) st.orderMs++;
      if (promptClockRuns({ phase: st.phase, timing: st.timing, covered: false })) st.promptMs++;
    }
  };
  const st = { phase: 'await', orderMs: 0, promptMs: 0, timing: false };
  tick(st, 500); // 0.5 s at await
  st.phase = 'calibrating'; st.promptMs = 0; st.timing = true;
  tick(st, 8000); // 8 s thinking in the keypad
  const blank = { cancelled: true, answered: false, firstTryCorrect: false, responseTimeMs: 0 };
  assert.equal(buildCalibrationRecord(blank, { awaitMs: st.orderMs }).record, false);
  st.timing = false;
  st.orderMs = orderClockAfterPrompt(st.orderMs, st.promptMs, blank);
  st.phase = 'await';
  // re-wire immediately, answer in 0.5 s
  st.phase = 'calibrating'; st.promptMs = 0; st.timing = true;
  tick(st, 500);
  const ok = { cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 500 };
  st.timing = false;
  st.orderMs = orderClockAfterPrompt(st.orderMs, st.promptMs, ok);
  assert.equal(st.orderMs, 8500);
  const rec = buildCalibrationRecord(ok, { awaitMs: st.orderMs });
  assert.equal(rec.record, true);
  // 0.5 + 8 + 0.5 - 2.5 allowance = 6.5 s (before this fix: 958 ms and CRITICAL)
  assert.ok(rec.ms >= 6500, String(rec.ms));
  const out = deliveryOutcome({ streak: 1, mismatches: 0, wrongThisOrder: false, tutorial: false, criticalMs: 3000,
    calib: { firstTryCorrect: true, responseTimeMs: buildRecallMs(ok.responseTimeMs, st.orderMs), auto: false } });
  assert.equal(out.critical, false);
});

test('tutorial: awaitMs 0 records keypad time only', () => {
  const ok = { cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 1800 };
  // Game passes awaitMs = tutorial ? 0 : orderMs
  const tutorialAwait = (tutorial, orderMs) => (tutorial ? 0 : orderMs);
  assert.deepEqual(buildCalibrationRecord(ok, { awaitMs: tutorialAwait(true, 30000) }), { record: true, correct: true, ms: 1800 });
  assert.equal(buildRecallMs(ok.responseTimeMs, tutorialAwait(true, 30000)), 1800);
  assert.equal(buildCalibrationRecord(ok, { awaitMs: tutorialAwait(false, 30000) }).record, false); // idle outside the tutorial
});

test('idle child: order clock over IDLE_SKIP_MS skips correct build answers, keeps misses', () => {
  assert.equal(IDLE_SKIP_MS, 20000);
  const ok = { cancelled: false, answered: true, firstTryCorrect: true, responseTimeMs: 900 };
  assert.equal(buildCalibrationRecord(ok, { awaitMs: 20000 }).record, true);
  assert.equal(buildCalibrationRecord(ok, { awaitMs: 20001 }).record, false);
  const wrong = { cancelled: false, answered: true, firstTryCorrect: false, responseTimeMs: 900 };
  // ...but a wrong answer after a long stare is still a miss worth practising
  const w = buildCalibrationRecord(wrong, { awaitMs: 25000 });
  assert.equal(w.record, true);
  assert.equal(w.correct, false);
  assert.ok(w.ms >= 900);
  // factor orders: an idle order is never CRITICAL, and its mismatch penalty is unchanged
  const f = deliveryOutcome({ streak: 0, mismatches: 0, wrongThisOrder: false, tutorial: false, criticalMs: FACTOR_CRITICAL_MS,
    calib: { firstTryCorrect: true, responseTimeMs: 25000, auto: false } });
  assert.equal(f.critical, false);
  assert.equal(factorMismatchRecord({ a: 7, b: 8 }, 0).ms, FACTOR_MISS_MS);
});
