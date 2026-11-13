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
 *   calib:{firstTryCorrect:boolean, responseTimeMs:number, auto:boolean}|null, criticalMs:number}} s
 * @returns {{streak:number, critical:boolean}}
 */
export function deliveryOutcome({ streak, mismatches, wrongThisOrder, tutorial, calib, criticalMs }) {
  const cur = Number.isInteger(streak) && streak > 0 ? streak : 0;
  const clean = !!(mismatches === 0 && !wrongThisOrder && calib && calib.firstTryCorrect === true);
  const ms = calib ? calib.responseTimeMs : 0;
  const critical = !!(clean && !calib.auto && typeof ms === 'number' && ms > 0 && ms < criticalMs);
  if (tutorial || (calib && calib.auto)) return { streak: cur, critical };
  return { streak: clean ? cur + 1 : 0, critical };
}
