// Main-thread facade over the mastery worker, with an in-thread fallback running the same
// handler code. Persists the tracker to storage (localStorage-like) under MASTERY_KEY.

import { MasteryTracker, unlockedTables, factKey, DEFAULT_TABLES } from './mastery.js';
import { createHandler } from './worker.js';

export const MASTERY_KEY = 'robofactor.mastery.v1';

const HANDSHAKE_MS = 1500;
const REQUEST_TIMEOUT_MS = 2500;
const PERSIST_DEBOUNCE_MS = 300;
const RECENT_FACTS = 6;

function validFactor(n) {
  return Number.isInteger(n) && n >= 1 && n <= 12;
}

export class MathEngine {
  static async create({ storage } = {}) {
    const engine = new MathEngine(storage);
    await engine._start();
    return engine;
  }

  constructor(storage) {
    this._storage = storage || null;
    this._worker = null;
    this._handler = null; // in-thread fallback
    this._nextId = 1;
    this._pending = new Map(); // id -> { msg, resolve, timer, fallback }
    this._recent = [];
    this._cache = new Array(13).fill(0);
    this._lastState = null;
    this._persistTimer = 0;
    this._persistDirty = false;
    this._flushHooked = false;
  }

  // ------------------------------------------------------------------ startup

  _loadStored() {
    try {
      if (!this._storage) return null;
      const text = this._storage.getItem(MASTERY_KEY);
      return text ? JSON.parse(text) : null;
    } catch (_) {
      return null;
    }
  }

  async _start() {
    const initial = new MasteryTracker(this._loadStored()).serialize();
    this._lastState = initial;
    this._cache = new MasteryTracker(initial).tableMasteries();
    this._hookFlush();

    let worker = null;
    if (typeof Worker === 'function') {
      try {
        worker = await this._handshake(initial);
      } catch (_) {
        worker = null;
      }
    }
    if (worker) {
      this._worker = worker;
      worker.onmessage = (e) => this._onMessage(e.data);
      worker.onerror = () => this._failover();
      worker.onmessageerror = () => this._failover();
    } else {
      this._useFallback();
    }
  }

  _handshake(initial) {
    return new Promise((resolve, reject) => {
      let w;
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (ok) {
          resolve(w);
        } else {
          try {
            if (w) w.terminate();
          } catch (_) {
            /* ignore */
          }
          reject(new Error('worker handshake failed'));
        }
      };
      const timer = setTimeout(() => done(false), HANDSHAKE_MS);
      try {
        w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => {
          if (e.data && e.data.type === 'ready') done(true);
        };
        w.onerror = () => done(false);
        w.postMessage({ type: 'init', data: initial });
      } catch (_) {
        done(false);
      }
    });
  }

  _useFallback() {
    this._worker = null;
    this._handler = createHandler((m) => this._onMessage(m));
    this._handler({ type: 'init', data: this._lastState });
  }

  /** Worker died or hung: switch to the in-thread tracker and replay pending requests. */
  _failover() {
    if (this._handler) return;
    const w = this._worker;
    if (w) {
      try {
        w.terminate();
      } catch (_) {
        /* ignore */
      }
    }
    this._useFallback();
    for (const p of [...this._pending.values()]) {
      clearTimeout(p.timer);
      p.timer = 0;
      this._dispatch(p);
    }
  }

  // ------------------------------------------------------------------ messaging

  _send(msg) {
    try {
      if (this._handler) this._handler(msg);
      else if (this._worker) this._worker.postMessage(msg);
    } catch (_) {
      if (!this._handler) this._failover();
    }
  }

  _dispatch(p) {
    if (!this._handler) {
      p.timer = setTimeout(() => this._failover(), REQUEST_TIMEOUT_MS);
    }
    this._send(p.msg);
  }

  _request(msg, fallback) {
    return new Promise((resolve) => {
      const id = this._nextId++;
      msg.id = id;
      const p = { msg, resolve, timer: 0, fallback };
      this._pending.set(id, p);
      this._dispatch(p);
    });
  }

  _settle(id, value) {
    const p = this._pending.get(id);
    if (!p) return;
    this._pending.delete(id);
    clearTimeout(p.timer);
    p.resolve(value);
  }

  _onMessage(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.type) {
      case 'state':
        this._lastState = m.data;
        if (Array.isArray(m.tableMastery)) this._cache = m.tableMastery;
        this._schedulePersist();
        break;
      case 'next':
        this._settle(m.id, { a: m.a, b: m.b, isPractice: !!m.isPractice, mastered: !!m.mastered });
        break;
      case 'snapshot':
        if (Array.isArray(m.tableMastery)) this._cache = m.tableMastery;
        this._settle(m.id, { facts: m.facts || {}, tableMastery: m.tableMastery || this._cache });
        break;
      case 'error':
        if (m.id !== undefined) {
          const p = this._pending.get(m.id);
          if (p) this._settle(m.id, p.fallback());
        }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ persistence

  _schedulePersist() {
    this._persistDirty = true;
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = 0;
      this.flush();
    }, PERSIST_DEBOUNCE_MS);
    if (this._persistTimer && typeof this._persistTimer.unref === 'function') this._persistTimer.unref();
  }

  /** Write the latest state to storage now. Never throws. */
  flush() {
    clearTimeout(this._persistTimer);
    this._persistTimer = 0;
    if (!this._persistDirty) return;
    this._persistDirty = false;
    try {
      if (this._storage && this._lastState) {
        this._storage.setItem(MASTERY_KEY, JSON.stringify(this._lastState));
      }
    } catch (_) {
      /* private mode / quota: play on without persistence */
    }
  }

  _hookFlush() {
    if (this._flushHooked) return;
    this._flushHooked = true;
    try {
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') this.flush();
        });
      }
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('pagehide', () => this.flush());
      }
    } catch (_) {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ public API

  record(a, b, correct, responseTimeMs) {
    if (!validFactor(a) || !validFactor(b)) return;
    this._send({
      type: 'record',
      a,
      b,
      correct: !!correct,
      responseTimeMs: Number.isFinite(responseTimeMs) ? responseTimeMs : 5000,
      now: Date.now(),
    });
  }

  async _next(kind, level, settings) {
    let tables;
    try {
      tables = unlockedTables(level, settings);
    } catch (_) {
      tables = DEFAULT_TABLES.slice();
    }
    if (!Array.isArray(tables) || tables.length === 0) tables = DEFAULT_TABLES.slice();
    const fallback = () => {
      const a = tables[Math.floor(Math.random() * tables.length)] || DEFAULT_TABLES[0];
      return { a, b: 1 + Math.floor(Math.random() * 12), isPractice: false, mastered: false };
    };
    let r;
    try {
      r = await this._request({ type: 'next', kind, tables, recentKeys: this._recent.slice() }, fallback);
    } catch (_) {
      r = fallback();
    }
    if (!r || !validFactor(r.a) || !validFactor(r.b)) r = fallback();
    this._recent.push(factKey(r.a, r.b), factKey(r.b, r.a));
    while (this._recent.length > RECENT_FACTS * 2) this._recent.shift();
    return r;
  }

  async nextOrder(level, settings) {
    const r = await this._next('order', level, settings);
    return { a: r.a, b: r.b, target: r.a * r.b, isPractice: !!r.isPractice, mastered: !!r.mastered };
  }

  async nextSurge(level, settings) {
    const r = await this._next('surge', level, settings);
    return { a: r.a, b: r.b, isPractice: !!r.isPractice };
  }

  async snapshot() {
    const fallback = () => ({ facts: {}, tableMastery: this._cache.slice() });
    try {
      const r = await this._request({ type: 'snapshot' }, fallback);
      return r || fallback();
    } catch (_) {
      return fallback();
    }
  }

  tableMasteryCached(t) {
    const v = this._cache[t];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  }

  reset() {
    this._recent = [];
    this._cache = new Array(13).fill(0);
    this._lastState = new MasteryTracker().serialize();
    this._persistDirty = true;
    this._send({ type: 'reset' });
    this.flush();
  }
}
