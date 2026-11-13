// Stub save: defaultSave shape from the contract, kept in memory only.
import { migrateEconomy } from '../../src/game/economy.js';

export function makeSave(overrides = {}) {
  return migrateEconomy({
    version: 1,
    bolts: 0,
    level: 1,
    ordersCompleted: 0,
    streak: 0,
    tutorialDone: false,
    drones: {},
    dronesEquipped: {},
    settings: { autoCurriculum: true, enabledTables: [1, 2, 5, 10], sfx: true, ambient: true },
    ...overrides,
  });
}

export function unlockedTables(level, settings) {
  const order = [[1, 2, 5, 10], [3], [4], [6], [9], [11], [7], [8], [12]];
  const out = [];
  for (let i = 0; i < Math.min(order.length, Math.ceil(level / 2)); i++) out.push(...order[i]);
  return out.sort((a, b) => a - b);
}
