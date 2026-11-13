import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawPet, PET_COLORS, PET_IDS } from '../src/render/pets.js';
import { PETS } from '../src/game/economy.js';

/** Minimal 2D-context stand-in: records calls, checks save/restore balance, rejects NaN. */
function mockCtx() {
  let depth = 0;
  const calls = [];
  const grad = { addColorStop() {} };
  const handler = {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => {
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${String(prop)} got ${a}`);
        calls.push(prop);
        if (prop === 'save') depth++;
        if (prop === 'restore') depth--;
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return grad;
        return undefined;
      };
    },
    set(target, prop, v) {
      target[prop] = v;
      return true;
    },
  };
  const ctx = new Proxy({}, handler);
  return { ctx, calls, depth: () => depth };
}

test('drawPet draws all 15 economy pets (normal + golden) with balanced save/restore', () => {
  assert.deepEqual([...PET_IDS].sort(), PETS.map((p) => p.id).sort());
  for (const p of PETS) {
    assert.match(PET_COLORS[p.id], /^#[0-9a-f]{6}$/i);
    for (const golden of [false, true]) {
      for (const t of [0, 0.37, 5.2]) {
        const m = mockCtx();
        drawPet(m.ctx, p.id, 50, 60, 48, t, golden);
        assert.equal(m.depth(), 0, `${p.id} save/restore`);
        assert.ok(m.calls.filter((c) => c === 'fill').length > 3, `${p.id} draws`);
      }
    }
  }
});

test('drawPet: unknown ids draw a placeholder; bad size draws nothing', () => {
  const m = mockCtx();
  drawPet(m.ctx, '__proto__', 0, 0, 40, 0);
  assert.equal(m.depth(), 0);
  assert.ok(m.calls.includes('fillText'));
  const n = mockCtx();
  drawPet(n.ctx, 'boltBug', 0, 0, 0, 0);
  assert.equal(n.calls.length, 0);
});
