// Pure game-rule helpers (no DOM) so they can be unit-tested in Node.

/**
 * Decide whether a calibration result should be recorded in the mastery engine.
 * @param {{cancelled?:boolean, answered?:boolean, firstTryCorrect?:boolean, responseTimeMs?:number}|null} res
 * @param {{auto?:boolean}} [ctx] auto: a drone auto-solved the prompt
 * @returns {{record:boolean, correct:boolean, ms:number}}
 */
export function calibrationRecord(res, ctx = {}) {
  const none = { record: false, correct: false, ms: 0 };
  if (!res || ctx.auto) return none;
  // Without a real response time there is nothing trustworthy to record.
  if (!validMs(res.responseTimeMs)) return none;
  const ms = res.responseTimeMs;
  if (res.cancelled) {
    // Backing out without typing anything is not an error; backing out after a
    // wrong first submission still counts as that wrong attempt.
    if (res.answered === true && res.firstTryCorrect !== true) return { record: true, correct: false, ms };
    return none;
  }
  return { record: true, correct: res.firstTryCorrect === true, ms };
}

function validMs(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/**
 * Decide whether a surge result should be recorded. A timeout without an answer is
 * recorded as wrong (responseTimeMs is then the time the clock ran). A missing result or
 * a non-positive / non-finite time is never recorded.
 * @param {{firstTryCorrect?:boolean, inTime?:boolean, responseTimeMs?:number}|null} res
 * @returns {{record:boolean, correct:boolean, ms:number}}
 */
export function surgeRecord(res) {
  if (!res || !validMs(res.responseTimeMs)) return { record: false, correct: false, ms: 0 };
  return { record: true, correct: res.firstTryCorrect === true, ms: res.responseTimeMs };
}

/**
 * Per-tick surge decision during a delivery.
 *  'fire' - start the surge now
 *  'hold' - a surge is due but a drawer/prompt is open: freeze the delivery (no cargo
 *           movement, no finishing) so the surge is deferred, never dropped
 *  'none' - nothing to do; keep delivering
 * @param {{pending:boolean, delivered:number, total:number, blocking:boolean}} s
 *   pending: this order has a surge that has not run yet and the phase is 'delivering'
 */
export function surgeGate({ pending, delivered, total, blocking }) {
  if (!pending) return 'none';
  if (delivered < surgeTriggerPoint(total)) return 'none';
  return blocking ? 'hold' : 'fire';
}

/** Cargo count at which a pending surge triggers (half way through the delivery). */
export function surgeTriggerPoint(total) {
  return Math.floor((Number(total) || 0) / 2);
}

/**
 * A cancelled calibration after a wrong submission breaks the combo (and the order can no
 * longer be first-try / CRITICAL, even if the player re-wires and answers right).
 */
export function cancelBreaksStreak(res) {
  return !!res && res.cancelled === true && res.answered === true && res.firstTryCorrect !== true;
}

/**
 * Combo streak and CRITICAL for a finished delivery.
 *  - auto (drone) and tutorial orders neither break nor extend the streak (no CRITICAL either
 *    for drones); the unchanged streak still pays its combo bonus
 *  - otherwise a clean order (no mismatch, no wrong answer this order, first try) extends it,
 *    anything else resets it to 0
 * @param {{streak:number, mismatches:number, wrongThisOrder:boolean, tutorial:boolean,
 *   calib:{firstTryCorrect:boolean, responseTimeMs:number, auto:boolean}|null, criticalMs:number,
 *   peeked?:boolean}} s  peeked: the parent log was opened on the unanswered order (no CRITICAL;
 *   the streak is unaffected)
 * @returns {{streak:number, critical:boolean}}
 */
export function deliveryOutcome({ streak, mismatches, wrongThisOrder, tutorial, calib, criticalMs, peeked = false }) {
  const cur = Number.isInteger(streak) && streak > 0 ? streak : 0;
  const clean = !!(mismatches === 0 && !wrongThisOrder && calib && calib.firstTryCorrect === true);
  const ms = calib ? calib.responseTimeMs : 0;
  const critical = !!(clean && !peeked && !calib.auto && typeof ms === 'number' && ms > 0 && ms < criticalMs);
  if (tutorial || (calib && calib.auto)) return { streak: cur, critical };
  return { streak: clean ? cur + 1 : 0, critical };
}

// ---------------------------------------------------------------------------
// Order kinds
//  'build'  - forward recall: the boss shows "a × b" (never the product); the child wires
//             dispenser a + forge ×b (or the swapped pair) and answers the Calibration Lock.
//             The keypad answer is what gets recorded.
//  'factor' - inverse / fact families, only for facts already mastered: the boss shows the
//             product; any valid factorisation wired IS the answer (no keypad).
// ---------------------------------------------------------------------------

/** Chance that an order for a mastered fact is posed as a factor order. */
export const FACTOR_CHANCE = 0.5;
/** CRITICAL threshold for factor orders: order ready ('await') -> correct pair wired. */
export const FACTOR_CRITICAL_MS = 6000;
/** Response time recorded for a factor order's own fact on its first mismatch (slow on purpose). */
export const FACTOR_MISS_MS = 5000;

/** Factor orders need target > 12 (otherwise crate 1 + forge ×target copies the answer). */
export const FACTOR_MIN_TARGET = 12;

/**
 * Factor only for a mastered, non-practice fact with target > 12, outside the tutorial, at
 * FACTOR_CHANCE. Everything else is a build order.
 * @param {{mastered?:boolean, tutorial?:boolean, isPractice?:boolean, target?:number}} o
 * @param {() => number} [rng]
 * @returns {'build'|'factor'}
 */
export function orderKind({ mastered, tutorial, isPractice, target } = {}, rng = Math.random) {
  if (tutorial || mastered !== true || isPractice) return 'build';
  // Products up to 12 can be "solved" by copying (crate 1 + forge ×target): always build.
  if (!(Number(target) > FACTOR_MIN_TARGET)) return 'build';
  return rng() < FACTOR_CHANCE ? 'factor' : 'build';
}

/** Build orders accept exactly the asked pair, in either order (dispenser b + forge ×a too). */
export function buildPairOk(order, A, B) {
  if (!order) return false;
  return (A === order.a && B === order.b) || (A === order.b && B === order.a);
}

/** Is machine value v part of a build order's pair (a dispenser or forge worth selecting)? */
export function buildMachineOk(order, v) {
  return !!order && (v === order.a || v === order.b);
}

/**
 * Mastery record for a factor-order mismatch. Only the FIRST mismatch of the order records,
 * and it records the order's own fact (a, b) as wrong at a fixed slow time so the fact returns
 * to practice. Nothing is ever recorded about the wrongly wired pair, and a successful factor
 * order records nothing.
 * @param {{a:number, b:number}|null} order
 * @param {number} priorMismatches mismatches on this order before this one
 * @returns {{record:boolean, a:number, b:number, correct:boolean, ms:number}}
 */
export function factorMismatchRecord(order, priorMismatches) {
  if (!order || priorMismatches !== 0) return { record: false, a: 0, b: 0, correct: false, ms: 0 };
  return { record: true, a: order.a, b: order.b, correct: false, ms: FACTOR_MISS_MS };
}

// ---------------------------------------------------------------------------
// Order clock and recording
// ---------------------------------------------------------------------------

/**
 * Seconds of the ready-to-wire phase that are not counted as recall time on a build order
 * (finding and wiring the two machines takes a moment even when the fact is known).
 */
export const WIRE_ALLOWANCE_MS = 2500;

/**
 * A build order whose order clock (ready-to-wire time plus cancelled-prompt time) exceeds this
 * was not being attended to (child wandered off): nothing is recorded for it.
 */
export const IDLE_SKIP_MS = 20000;

/**
 * Does the per-order clock run this tick? It runs while the order waits to be wired
 * ('await'), only when no drawer/shop/log/daily/hatch overlay is open. (The whole sim is
 * frozen while the tab is hidden or in portrait, so those pauses come for free.)
 * The clock is per order: it is reset when the order arrives, not per wire, so time before a
 * cancelled calibration still counts after the re-wire.
 */
export function orderClockRuns({ phase, hasOrder, blocking }) {
  return phase === 'await' && !!hasOrder && !blocking;
}

/**
 * Does the calibration-prompt clock run this tick? While a non-drone build order's Calibration
 * Lock is up (phase 'calibrating'), paused by any OTHER overlay (drawer/shop/log/daily/hatch) but
 * not by the prompt itself. Its time only matters if the prompt is then cancelled.
 */
export function promptClockRuns({ phase, timing, covered }) {
  return phase === 'calibrating' && !!timing && !covered;
}

/**
 * Order clock after a calibration prompt closes. A cancelled prompt (blank or after a wrong
 * answer) adds the time spent thinking in it — otherwise "open keypad, think, cancel, re-wire,
 * answer fast" would hide the recall time. An answered prompt adds nothing: its keypad time comes
 * from the prompt result (so it is never counted twice).
 * @param {number} orderMs order clock so far
 * @param {number} promptMs time the prompt was open (pause-aware)
 * @param {object|null} res prompt result
 */
export function orderClockAfterPrompt(orderMs, promptMs, res) {
  const o = Number.isFinite(orderMs) && orderMs > 0 ? orderMs : 0;
  if (!res || res.cancelled !== true) return o;
  return o + (Number.isFinite(promptMs) && promptMs > 0 ? promptMs : 0);
}

/**
 * Recall time for a build order's keypad answer. The bubble shows "a × b" from the moment the
 * order is ready, so the child can work it out before wiring: count the ready-to-wire time
 * (minus a wiring allowance) on top of the keypad time, but never less than the keypad time.
 * @param {number} keypadFirstMs keypad open -> first submission
 * @param {number} awaitToWireMs order clock (ready -> wire, pause-aware, all wires so far)
 */
export function buildRecallMs(keypadFirstMs, awaitToWireMs) {
  const k = Number(keypadFirstMs);
  if (!Number.isFinite(k) || k <= 0) return 0;
  const w = Number(awaitToWireMs);
  const extra = Number.isFinite(w) && w > 0 ? w - WIRE_ALLOWANCE_MS : 0;
  return Math.round(Math.max(k, k + extra));
}

/**
 * Mastery record for a build order's calibration result. Like calibrationRecord, but:
 *  - the recorded time is buildRecallMs(...)
 *  - nothing is recorded once this order already had a wrong keypad submission (the blueprint
 *    has shown the product, so a later "correct" is copying, not recall)
 *  - nothing is recorded when the parent log was opened on this unanswered order (peeked)
 *  - past IDLE_SKIP_MS on the order clock (not attending) a correct answer is not recorded, but a
 *    wrong one still is, so hard facts the child stared at and missed still come back as weak
 *  - the tutorial passes awaitMs 0 (reading the onboarding text is not recall time)
 * @param {object|null} res prompt result
 * @param {{auto?:boolean, wrongBefore?:boolean, peeked?:boolean, awaitMs?:number}} ctx
 * @returns {{record:boolean, correct:boolean, ms:number}}
 */
export function buildCalibrationRecord(res, { auto = false, wrongBefore = false, peeked = false, awaitMs = 0 } = {}) {
  const none = { record: false, correct: false, ms: 0 };
  if (wrongBefore || peeked) return none;
  const r = calibrationRecord(res, { auto });
  if (!r.record) return r;
  if (Number(awaitMs) > IDLE_SKIP_MS && r.correct) return none;
  return { ...r, ms: buildRecallMs(r.ms, awaitMs) };
}

/** A keypad result that had a wrong first submission (completed or cancelled). */
export function hadWrongSubmission(res) {
  if (!res) return false;
  if (res.cancelled) return res.answered === true && res.firstTryCorrect !== true;
  return res.answered !== false && res.firstTryCorrect !== true;
}

/**
 * Opening the parent log (which lists every product) while the current order is still
 * unanswered marks that order as peeked: no mastery record and no CRITICAL for it.
 */
export function logPeeksOrder(phase) {
  return phase === 'await' || phase === 'calibrating';
}
