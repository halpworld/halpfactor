// Mastery tracking + adaptive fact selection. Pure: no DOM, no storage, usable in a Worker and Node.
//
// ---------------------------------------------------------------------------------------------
// Per-fact statistics (keyed by ordered fact, e.g. "7x8" and "8x7" are tracked separately so the
// Foreman's heatmap can show each cell):
//   attempts, correct          raw counts
//   avgResponseTimeMs          exponential moving average (alpha 0.3) over all attempts
//   acc                        recency-weighted accuracy: EMA (alpha 0.3) of 1/0 outcomes, seeded
//                              with the first outcome (so one early slip fades after several hits)
//   recentErrors               +1 per wrong answer, -1 per right answer (floored at 0)
//   lastSeen                   timestamp (ms) of the last attempt
//
// masteryScore (0..1):
//   speed  = clamp((5000 - avgMs) / 3000, 0, 1)        1.0 at <= 2000 ms, 0.0 at >= 5000 ms
//   score  = acc * (0.4 + 0.6 * speed)                 accuracy matters, speed adds the last 60%
//   score *= 0.9 ^ min(recentErrors, 3)                small extra drop while errors are "recent"
//   if attempts < 3: score = min(score, 0.3 * attempts)  => can never reach 0.95 before 3 attempts
//   unseen => 0
// Consequences: three fast correct answers (avg <= 2000 ms) give 1.0. 0.95 needs acc >= ~0.95
// and avg <= ~2250 ms. isMastered additionally requires avgResponseTimeMs < 2500.
//
// pickFact weighting (per fact, an "ordered pair" is evaluated for both orders and the larger
// weight is used for the pair; the displayed order is then chosen with a mild bias to the
// weaker order):
//   unseen                          2.0  (an unseen order whose reverse has been seen inherits the
//                                         reverse's weight: 7x8 known => 8x7 is not "new")
//   mastered                        0.25
//   otherwise                       1 + slowBonus + errorBonus
//        slowBonus  = 3 if avg > 4000 ms, else 0.8 * (avg - 2500) / 1500 when avg in (2500, 4000]
//        errorBonus = 3 + min(recentErrors, 3) when recentErrors > 0
//   spacing: every seen fact is multiplied by 1 + min(2, daysSinceLastSeen / 3)
//            (long-unseen facts, mastered or not, drift back into rotation)
//   recentKeys: weight * 0.05 (strongly avoided, but never impossible)
//   surge option (timed popups): weakness bonuses are halved so surges stay fair.
// isPractice = the chosen pair is weak (avg > 4000 ms, or recentErrors > 0).
// mastered   = the chosen pair is mastered in at least one order (masteredStats) and not weak
//              (always false when isPractice is true).
//
// Gentleness: when few tables are active (<= 4, none of them 11/12) the "other" factor b is
// kept in 1..10 (the 11 and 12 columns appear later via the unlocked tables / swapped order).
// ---------------------------------------------------------------------------------------------

export const ALL_TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const CURRICULUM = [[1, 2, 5, 10], [3], [4], [6], [9], [11], [7], [8], [12]];

const DAY_MS = 86400000;
const EMA_ALPHA = 0.3;
const SLOW_MS = 4000;
/** A fact counts as mastered at masteryScore >= MASTERED_SCORE and avg < MASTERED_MS. */
export const MASTERED_MS = 2500;
export const MASTERED_SCORE = 0.95;
const MAX_RT = 30000;
/** Starting tables, and the fallback whenever a table list is empty or invalid. */
export const DEFAULT_TABLES = Object.freeze([1, 2, 5, 10]);
const FALLBACK_TABLES = DEFAULT_TABLES;

export function factKey(a, b) {
  return `${a}x${b}`;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function validFactor(n) {
  return Number.isInteger(n) && n >= 1 && n <= 12;
}

function cleanTables(list) {
  const set = new Set();
  if (Array.isArray(list)) {
    for (const v of list) if (validFactor(v)) set.add(v);
  }
  return [...set].sort((a, b) => a - b);
}

export function unlockedTables(level, settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  if (s.autoCurriculum === false) {
    const t = cleanTables(s.enabledTables);
    return t.length ? t : FALLBACK_TABLES.slice();
  }
  const lv = clamp(Math.floor(Number(level)) || 1, 1, CURRICULUM.length);
  const out = [];
  for (let i = 0; i < lv; i++) out.push(...CURRICULUM[i]);
  return out.sort((a, b) => a - b);
}

function scoreOf(f) {
  if (!f.attempts) return 0;
  const speed = clamp((5000 - f.avg) / 3000, 0, 1);
  let s = f.acc * (0.4 + 0.6 * speed);
  s *= Math.pow(0.9, Math.min(f.recentErrors, 3));
  if (f.attempts < 3) s = Math.min(s, 0.3 * f.attempts);
  return clamp(s, 0, 1);
}

const EMPTY = Object.freeze({
  attempts: 0,
  correct: 0,
  avgResponseTimeMs: 0,
  masteryScore: 0,
  lastSeen: 0,
  recentErrors: 0,
});

function publicStats(f) {
  return {
    attempts: f.attempts,
    correct: f.correct,
    avgResponseTimeMs: f.avg,
    masteryScore: scoreOf(f),
    lastSeen: f.lastSeen,
    recentErrors: f.recentErrors,
  };
}

function masteredStats(st) {
  return st.attempts > 0 && st.masteryScore >= MASTERED_SCORE && st.avgResponseTimeMs < MASTERED_MS;
}

function num(v, def, lo, hi) {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def;
}

export class MasteryTracker {
  constructor(serialized) {
    this._facts = new Map(); // key -> {attempts, correct, avg, acc, lastSeen, recentErrors}
    try {
      const facts = serialized && typeof serialized === 'object' ? serialized.facts : null;
      if (facts && typeof facts === 'object' && !Array.isArray(facts)) {
        for (const key of Object.keys(facts)) {
          const m = /^(\d{1,2})x(\d{1,2})$/.exec(key);
          if (!m || !validFactor(+m[1]) || !validFactor(+m[2])) continue;
          // Normalise "07x8" -> "7x8"; on a clash keep the record with more attempts.
          const nk = factKey(+m[1], +m[2]);
          const r = facts[key];
          if (!r || typeof r !== 'object') continue;
          const attempts = Math.floor(num(r.attempts, 0, 0, 1e6));
          if (attempts < 1) continue;
          const prev = this._facts.get(nk);
          if (prev && prev.attempts >= attempts) continue;
          const correct = Math.min(attempts, Math.floor(num(r.correct, 0, 0, 1e6)));
          // A corrupted (negative / NaN / non-number) average is unknown, i.e. slow, not 0 ms.
          const avg = typeof r.avg === 'number' && Number.isFinite(r.avg) && r.avg >= 0 ? Math.min(r.avg, MAX_RT) : 5000;
          this._facts.set(nk, {
            attempts,
            correct,
            avg,
            acc: num(r.acc, correct / attempts, 0, 1),
            lastSeen: num(r.lastSeen, 0, 0, 8.64e15),
            recentErrors: Math.floor(num(r.recentErrors, 0, 0, 50)),
          });
        }
      }
    } catch (_) {
      this._facts = new Map();
    }
  }

  record(a, b, { correct, responseTimeMs, now } = {}) {
    if (!validFactor(a) || !validFactor(b)) return;
    const key = factKey(a, b);
    const ok = !!correct;
    const rt = typeof responseTimeMs === 'number' && Number.isFinite(responseTimeMs)
      ? clamp(responseTimeMs, 0, MAX_RT)
      : 5000; // unknown timing: assume slow rather than flatter the child
    const t = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
    let f = this._facts.get(key);
    if (!f) {
      f = { attempts: 0, correct: 0, avg: rt, acc: ok ? 1 : 0, lastSeen: t, recentErrors: 0 };
      this._facts.set(key, f);
    } else {
      f.avg += EMA_ALPHA * (rt - f.avg);
      f.acc += EMA_ALPHA * ((ok ? 1 : 0) - f.acc);
    }
    f.attempts += 1;
    if (ok) {
      f.correct += 1;
      f.recentErrors = Math.max(0, f.recentErrors - 1);
    } else {
      f.recentErrors = Math.min(50, f.recentErrors + 1);
    }
    f.lastSeen = t;
  }

  get(a, b) {
    const f = this._facts.get(factKey(a, b));
    return f ? publicStats(f) : { ...EMPTY };
  }

  /** Mastery of table t, 0..1: mean over b = 1..12 of the better of (t x b, b x t) scores. */
  tableMastery(t) {
    if (!validFactor(t)) return 0;
    let sum = 0;
    for (let b = 1; b <= 12; b++) {
      const s1 = this._facts.get(factKey(t, b));
      const s2 = this._facts.get(factKey(b, t));
      sum += Math.max(s1 ? scoreOf(s1) : 0, s2 ? scoreOf(s2) : 0);
    }
    return sum / 12;
  }

  /** Array of 13 table-mastery values (index 1..12 used, 0 is 0). */
  tableMasteries() {
    const out = new Array(13).fill(0);
    for (let t = 1; t <= 12; t++) out[t] = this.tableMastery(t);
    return out;
  }

  isMastered(a, b) {
    return masteredStats(this.get(a, b));
  }

  /** { facts: { [key]: stats } (seen facts only), tableMastery: number[13] } */
  snapshot() {
    const facts = {};
    for (const [key, f] of this._facts) facts[key] = publicStats(f);
    return { facts, tableMastery: this.tableMasteries() };
  }

  serialize() {
    const facts = {};
    for (const [key, f] of this._facts) {
      facts[key] = {
        attempts: f.attempts,
        correct: f.correct,
        avg: f.avg,
        acc: f.acc,
        lastSeen: f.lastSeen,
        recentErrors: f.recentErrors,
      };
    }
    return { v: 1, facts };
  }
}

function orderedWeight(st, now, surge) {
  if (!st.attempts) return { w: 2.0, weak: false };
  const weak = st.avgResponseTimeMs > SLOW_MS || st.recentErrors > 0;
  let w;
  if (!weak && masteredStats(st)) {
    w = 0.25;
  } else {
    let bonus = 0;
    if (st.avgResponseTimeMs > SLOW_MS) bonus += 3;
    else if (st.avgResponseTimeMs > MASTERED_MS) bonus += (0.8 * (st.avgResponseTimeMs - MASTERED_MS)) / 1500;
    if (st.recentErrors > 0) bonus += 3 + Math.min(st.recentErrors, 3);
    if (surge) bonus *= 0.5;
    w = 1 + bonus;
  }
  const days = Math.max(0, (now - st.lastSeen) / DAY_MS);
  w *= 1 + Math.min(2, days / 3);
  return { w, weak };
}

/** True when every t x 1..10 fact is mastered in at least one order. */
export function basicsMastered(tracker, t) {
  for (let b = 1; b <= 10; b++) {
    if (!masteredStats(tracker.get(t, b)) && !masteredStats(tracker.get(b, t))) return false;
  }
  return true;
}

export function pickFact(tracker, tables, { rng = Math.random, now = Date.now(), recentKeys = [], surge = false } = {}) {
  let ts = cleanTables(tables);
  if (!ts.length) ts = FALLBACK_TABLES.slice();
  // Small table sets (e.g. a parent override of [7]) start with x1..x10 only, but
  // once a table's 1..10 facts are mastered its x11/x12 facts open up, so the
  // table can still reach full mastery (and unlock its Auto-Drone).
  const capped = ts.length <= 4 && !ts.includes(11) && !ts.includes(12);
  const bMaxFor = (t) => (capped && !basicsMastered(tracker, t) ? 10 : 12);
  const recent = new Set(Array.isArray(recentKeys) ? recentKeys : []);

  const cands = [];
  let total = 0;
  for (const t of ts) {
    const bMax = bMaxFor(t);
    for (let b = 1; b <= bMax; b++) {
      const s1 = tracker.get(t, b);
      const s2 = t === b ? s1 : tracker.get(b, t);
      const o1 = orderedWeight(s1, now, surge);
      const o2 = t === b ? o1 : orderedWeight(s2, now, surge);
      // Knowing one order mostly implies the other: an unseen order inherits the seen order's
      // weight instead of the flat "unseen" boost (so mastered pairs don't keep resurfacing).
      if (t !== b) {
        if (!s1.attempts && s2.attempts) o1.w = o2.w;
        else if (!s2.attempts && s1.attempts) o2.w = o1.w;
      }
      let w = Math.max(o1.w, o2.w);
      if (recent.has(factKey(t, b)) || recent.has(factKey(b, t))) w *= 0.05;
      cands.push({ t, b, w, w1: o1.w, w2: o2.w, weak: o1.weak || o2.weak });
      total += w;
    }
  }

  let r = rng() * total;
  let chosen = cands[cands.length - 1];
  for (const c of cands) {
    r -= c.w;
    if (r < 0) {
      chosen = c;
      break;
    }
  }

  // Order: random swap, mildly biased towards the weaker/less-seen order (p in 0.25..0.75).
  const p1 = 0.5 * (0.5 + chosen.w1 / (chosen.w1 + chosen.w2));
  const keepOrder = rng() < p1;
  const a = keepOrder ? chosen.t : chosen.b;
  const b = keepOrder ? chosen.b : chosen.t;
  // mastered: the chosen fact is mastered in at least one order AND neither order is weak (slow
  // or with recent errors), so the game may pose it as an inverse "factor" order instead of a
  // forward "build" order. A weak pair is always practised forwards.
  const mastered = !chosen.weak && (masteredStats(tracker.get(chosen.t, chosen.b)) || masteredStats(tracker.get(chosen.b, chosen.t)));
  return { a, b, isPractice: chosen.weak, mastered };
}
