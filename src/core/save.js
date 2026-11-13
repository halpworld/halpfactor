// Persistent save data. All storage access is wrapped in try/catch; the game must work
// (without persistence) when localStorage is unavailable.

export const SAVE_KEY = 'robofactor.save.v1';

import { DEFAULT_TABLES } from '../math/mastery.js';
import { migrateEconomy } from '../game/economy.js';

// Economy fields owned (and sanitised) by src/game/economy.js migrateEconomy().
const ECON_FIELDS = ['upgrades', 'builds', 'rebirths', 'pets', 'nextPetUid', 'petsEquipped', 'petIndex', 'styles', 'daily', 'stats', 'econVersion'];
const MAX_BOLTS = 1e15;
const MAX_COUNT = 1e7;
const MAX_LEVEL = 999;

export function defaultSave() {
  const save = {
    version: 1,
    bolts: 0,
    level: 1,
    ordersCompleted: 0,
    streak: 0,
    tutorialDone: false,
    drones: {}, // table -> true when the Auto-Drone is owned
    dronesEquipped: {}, // table -> true when an owned drone is switched on
    settings: {
      autoCurriculum: true,
      enabledTables: DEFAULT_TABLES.slice(),
      sfx: true,
      ambient: true,
    },
  };
  return migrateEconomy(save);
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function int(v, def, min, max) {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function bool(v, def) {
  return typeof v === 'boolean' ? v : def;
}

/** Validate/merge arbitrary input into a well-formed save object. Never throws. */
export function sanitizeSave(raw) {
  const out = defaultSave();
  if (!isObj(raw)) return out;

  out.bolts = int(raw.bolts, 0, 0, MAX_BOLTS);
  out.level = int(raw.level, 1, 1, MAX_LEVEL);
  out.ordersCompleted = int(raw.ordersCompleted, 0, 0, MAX_COUNT);
  // The combo streak is session-only: never restored from storage (out.streak stays 0).
  out.tutorialDone = bool(raw.tutorialDone, false);

  // Economy: sanitised by migrateEconomy on a scratch copy of the raw fields. Old saves (no
  // econVersion) still carry owned/equipped cosmetics, which are migrated to styles/pets.
  const econ = {};
  for (const k of ECON_FIELDS) if (Object.prototype.hasOwnProperty.call(raw, k)) econ[k] = raw[k];
  if (raw.econVersion === undefined) {
    econ.owned = raw.owned;
    econ.equipped = raw.equipped;
  }
  migrateEconomy(econ);
  for (const k of ECON_FIELDS) out[k] = econ[k];

  if (isObj(raw.drones)) {
    for (const k of Object.keys(raw.drones)) {
      if (!/^\d{1,2}$/.test(k)) continue;
      const t = Number(k);
      if (t >= 1 && t <= 12 && raw.drones[k] === true) out.drones[String(t)] = true;
    }
  }
  // Saves from before drones could be switched off have no dronesEquipped: every owned
  // drone stays on. Otherwise only owned drones can be equipped.
  const de = isObj(raw.dronesEquipped) ? raw.dronesEquipped : null;
  for (const k of Object.keys(out.drones)) {
    out.dronesEquipped[k] = de ? de[k] === true || de[Number(k)] === true : true;
    if (!out.dronesEquipped[k]) delete out.dronesEquipped[k];
  }

  const s = isObj(raw.settings) ? raw.settings : {};
  out.settings.autoCurriculum = bool(s.autoCurriculum, true);
  out.settings.sfx = bool(s.sfx, true);
  out.settings.ambient = bool(s.ambient, true);
  if (Array.isArray(s.enabledTables)) {
    const set = new Set();
    for (const v of s.enabledTables) {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 12) set.add(v);
    }
    if (set.size > 0) out.settings.enabledTables = [...set].sort((a, b) => a - b);
  }
  return out;
}

function memoryShim() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      m.set(k, String(v));
    },
    removeItem: (k) => {
      m.delete(k);
    },
    isMemory: true,
  };
}

export function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return memoryShim();
    const probe = '__robofactor_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch (_) {
    return memoryShim();
  }
}

export function loadSave(storage = safeLocalStorage()) {
  try {
    const text = storage.getItem(SAVE_KEY);
    if (!text) return defaultSave();
    return sanitizeSave(JSON.parse(text));
  } catch (_) {
    return defaultSave();
  }
}

/** Returns true if the save was written. Never throws. */
export function writeSave(save, storage = safeLocalStorage()) {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(sanitizeSave(save)));
    return true;
  } catch (_) {
    return false;
  }
}
