import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/game/economy.js';
import { mulberry32 } from '../src/render/util.js';
import { simulate } from './economy-sim.mjs';

const fresh = (extra = {}) => E.migrateEconomy({ bolts: 0, ...extra });

test('catalogs: 15 unique pets, 5 per egg, odds sum to 1', () => {
  assert.equal(E.PETS.length, 15);
  assert.equal(new Set(E.PETS.map((p) => p.id)).size, 15);
  for (const egg of E.EGGS) assert.equal(egg.pets.length, 5);
  const sum = E.RARITIES.reduce((s, r) => s + r.chance, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(E.petInfo('cyberCat').rarity, 'legendary');
  assert.equal(E.petInfo('cyberCat').boost, 0.8);
  assert.equal(E.petInfo('neonSlime').boost, 0.1); // common 5% ×2
  assert.equal(E.petInfo('galaxyPhoenix').boost, 3.2); // legendary 80% ×4
  assert.equal(E.STYLES.length, 13);
});

test('upgradeCost = round(base * 1.6^lvl), null at max / unknown', () => {
  assert.equal(E.upgradeCost('forge', 0), 40);
  assert.equal(E.upgradeCost('forge', 1), 64);
  assert.equal(E.upgradeCost('forge', 2), Math.round(40 * 1.6 ** 2));
  assert.equal(E.upgradeCost('forge', 9), Math.round(40 * 1.6 ** 9));
  assert.equal(E.upgradeCost('forge', 10), null);
  assert.equal(E.upgradeCost('battery', 4), null);
  assert.equal(E.upgradeCost('nope', 0), null);
  assert.equal(E.upgradeCost('__proto__', 0), null);
});

test('buildCost scales with rebirths; bad index is null', () => {
  assert.equal(E.buildCost(0, 0), E.BUILDS[0].cost);
  assert.equal(E.buildCost(9, 0), E.BUILDS[9].cost);
  assert.equal(E.buildCost(0, 2), Math.round(E.BUILDS[0].cost * (1 + E.BUILD_REBIRTH_SCALE * 2)));
  assert.equal(E.buildCost(10, 0), null);
  assert.equal(E.buildCost(-1, 0), null);
});

test('orderPayout: base, flat, and every multiplier', () => {
  const s = fresh();
  assert.equal(E.orderPayout(s, { target: 30 }), 15); // 10 + 5
  assert.equal(E.orderPayout(s, { target: 0 }), 10);
  assert.equal(E.orderPayout(s, { target: 144 }), 34);
  assert.equal(E.orderPayout(s, { target: 30, isPractice: true }), Math.round(15 * 1.5));
  assert.equal(E.orderPayout(s, { target: 30, critical: true }), Math.round(15 * 1.5));
  assert.equal(E.orderPayout(s, { target: 30, overclocked: true }), 30);
  assert.equal(E.orderPayout(s, { target: 30, streak: 3 }), Math.round(15 * 1.3));
  assert.equal(E.orderPayout(s, { target: 30, streak: 50 }), Math.round(15 * 1.5)); // cap 50%
  s.upgrades.combo = 2;
  assert.equal(E.comboCap(s), 0.7);
  assert.equal(E.orderPayout(s, { target: 30, streak: 50 }), Math.round(15 * 1.7));
  s.upgrades.combo = 0;
  s.builds = 2;
  const flat = E.BUILDS[0].flat + E.BUILDS[1].flat;
  assert.equal(E.buildFlat(s), flat);
  assert.equal(E.orderPayout(s, { target: 30 }), 15 + flat);
  s.builds = 0;
  s.upgrades.forge = 3;
  assert.equal(E.orderPayout(s, { target: 30 }), Math.round(15 * 1.6));
  s.upgrades.forge = 0;
  s.rebirths = 2;
  assert.equal(E.rebirthMult(s), 2);
  assert.equal(E.orderPayout(s, { target: 30 }), 30);
  s.rebirths = 0;
  s.pets = [{ uid: 1, id: 'cyberCat', golden: false }, { uid: 2, id: 'boltBug', golden: true }];
  s.petsEquipped = [1, 2];
  assert.equal(E.petBoost(s), 0.95); // 0.8 + 0.05*3
  assert.equal(E.orderPayout(s, { target: 30 }), Math.round(15 * 1.95));
  // everything stacks multiplicatively
  const all = E.orderPayout(s, { target: 30, isPractice: true, critical: true, overclocked: true, streak: 2 });
  assert.equal(all, Math.round(15 * 1.5 * 1.5 * 1.2 * 2 * 1.95));
  // never below 1, garbage-safe
  assert.equal(E.orderPayout(fresh(), { target: NaN }), 10);
  assert.ok(E.orderPayout({}, {}) >= 1);
});

test('upgrade effects: belt, battery, magnet', () => {
  const s = fresh({ upgrades: { belt: 2, battery: 3, magnet: 4 } });
  assert.equal(E.beltSpeedMult(s), 1.3);
  assert.equal(E.overclockBonusSec(s), 9);
  assert.equal(E.magnetChance(s), 0.4);
  assert.equal(E.magnetReward(41), 21);
  assert.equal(E.magnetReward(-5), 1);
});

test('buyUpgrade / buyBuild: costs, max, order, need', () => {
  const s = fresh({ bolts: 50 });
  assert.deepEqual(E.buyUpgrade(s, 'forge'), { ok: true, id: 'forge', level: 1, cost: 40 });
  assert.equal(s.bolts, 10);
  const r = E.buyUpgrade(s, 'forge');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bolts');
  assert.equal(r.need, 54);
  assert.equal(E.buyUpgrade(s, 'nope').reason, 'unknown');
  s.upgrades.battery = 4;
  s.bolts = 1e6;
  assert.equal(E.buyUpgrade(s, 'battery').reason, 'max');

  const b = fresh({ bolts: 1e6 });
  assert.equal(E.buyBuild(b, 'lights').reason, 'order');
  assert.equal(E.buyBuild(b, 'sign').ok, true);
  assert.equal(E.buyBuild(b, 'sign').reason, 'owned');
  assert.equal(E.buyBuild(b).id, 'lights');
  assert.equal(b.builds, 2);
  for (let i = 2; i < 10; i++) assert.equal(E.buyBuild(b).ok, true);
  assert.equal(E.buyBuild(b).reason, 'max');
});

test('rollEgg odds over 100k seeded rolls match 60/25/10/4/1', () => {
  const rng = mulberry32(12345);
  const N = 100000;
  for (const egg of E.EGGS) {
    const counts = new Map();
    for (let i = 0; i < N; i++) {
      const id = E.rollEgg(egg.id, rng);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
    egg.pets.forEach((id, i) => {
      const p = (counts.get(id) || 0) / N;
      const want = E.RARITIES[i].chance;
      const tol = 4 * Math.sqrt((want * (1 - want)) / N) + 1e-3;
      assert.ok(Math.abs(p - want) < tol, `${egg.id}/${id}: ${p} vs ${want}`);
    });
  }
  assert.equal(E.rollEgg('nope', rng), null);
  assert.equal(E.rollEgg('basic', () => 0.9999999999), 'cyberCat');
  assert.equal(E.rollEgg('basic', () => 1), 'cyberCat');
  assert.equal(E.rollEgg('basic', () => NaN), 'boltBug');
});

test('hatchEgg: cost, lock, auto-equip, index, inventory cap', () => {
  const s = fresh({ bolts: 1000 });
  const r = E.hatchEgg(s, 'basic', () => 0.0);
  assert.equal(r.ok, true);
  assert.equal(r.pet.id, 'boltBug');
  assert.equal(r.pet.isNew, true);
  assert.equal(r.pet.equipped, true);
  assert.equal(s.bolts, 1000 - E.eggInfo('basic').cost);
  assert.deepEqual(s.petIndex, ['boltBug']);
  assert.equal(E.hatchEgg(s, 'basic', () => 0).pet.isNew, false);
  assert.equal(E.hatchEgg(s, 'galaxy', () => 0).reason, 'locked');
  assert.equal(E.hatchEgg(s, 'neon', () => 0).reason, 'locked');
  s.builds = 5;
  assert.equal(E.eggUnlocked(s, 'neon'), true);
  assert.equal(E.hatchEgg(s, 'nope', () => 0).reason, 'unknown');
  s.bolts = 1;
  const poor = E.hatchEgg(s, 'basic', () => 0);
  assert.equal(poor.reason, 'bolts');
  assert.equal(poor.need, E.eggInfo('basic').cost - 1);
  // 4th pet doesn't auto-equip into 3 slots
  s.bolts = 1e6;
  E.hatchEgg(s, 'basic', () => 0);
  E.hatchEgg(s, 'basic', () => 0);
  assert.equal(s.petsEquipped.length, 3);
  while (s.pets.length < E.INV_MAX) E.hatchEgg(s, 'basic', () => 0);
  const before = s.bolts;
  assert.equal(E.hatchEgg(s, 'basic', () => 0).reason, 'full');
  assert.equal(s.bolts, before);
  // uids are unique
  assert.equal(new Set(s.pets.map((p) => p.uid)).size, s.pets.length);
});

test('equip / unequip / slots / equipBest / sell', () => {
  const s = fresh({ bolts: 0 });
  s.pets = [
    { uid: 1, id: 'boltBug', golden: false },
    { uid: 2, id: 'gearPup', golden: false },
    { uid: 3, id: 'sparkMouse', golden: false },
    { uid: 4, id: 'cyberCat', golden: false },
    { uid: 5, id: 'turboTurtle', golden: false },
  ];
  E.migrateEconomy(s);
  assert.equal(E.petSlots(s), 3);
  for (const u of [1, 2, 3]) assert.equal(E.equipPet(s, u).ok, true);
  assert.equal(E.equipPet(s, 4).reason, 'slots');
  assert.equal(E.equipPet(s, 99).reason, 'unknown');
  assert.equal(E.equipPet(s, 1).ok, true); // already equipped: no-op
  assert.equal(s.petsEquipped.length, 3);
  assert.equal(E.unequipPet(s, 2).ok, true);
  assert.deepEqual(s.petsEquipped, [1, 3]);
  E.equipBest(s);
  assert.deepEqual(s.petsEquipped, [4, 5, 3]); // 0.8, 0.4, 0.2
  assert.equal(E.sellPet(s, 4).reason, 'equipped');
  const sold = E.sellPet(s, 1);
  assert.equal(sold.ok, true);
  assert.equal(sold.bolts, Math.round(E.eggInfo('basic').cost * 0.2));
  assert.equal(s.bolts, sold.bolts);
  assert.equal(s.pets.length, 4);
  assert.equal(E.sellPet(s, 1).reason, 'unknown');
  assert.equal(E.petSellValue({ id: 'boltBug', golden: true }), Math.round(E.eggInfo('basic').cost * 0.2) * 5);
  s.rebirths = 5;
  assert.equal(E.petSlots(s), 6);
  s.rebirths = 50;
  assert.equal(E.petSlots(s), 6);
});

test('makeGolden: needs 5 normal copies, uses unequipped first, golden ×3', () => {
  const s = fresh();
  s.pets = [1, 2, 3, 4, 5, 6].map((uid) => ({ uid, id: 'gearPup', golden: false }));
  s.pets.push({ uid: 7, id: 'boltBug', golden: false });
  E.migrateEconomy(s);
  s.petsEquipped = [6, 7];
  assert.equal(E.makeGolden(s, 'boltBug').reason, 'notEnough');
  assert.equal(E.makeGolden(s, 'nope').reason, 'unknown');
  const r = E.makeGolden(s, 'gearPup');
  assert.equal(r.ok, true);
  assert.deepEqual(r.used.sort(), [1, 2, 3, 4, 5]);
  assert.equal(r.pet.golden, true);
  assert.equal(r.pet.boost, 0.3);
  assert.equal(r.pet.equipped, false); // no equipped copy was used
  assert.equal(s.pets.length, 3);
  assert.deepEqual(s.petsEquipped, [6, 7]);
  assert.equal(E.makeGolden(s, 'gearPup').reason, 'notEnough'); // golden copies don't count
  // when an equipped copy is consumed the golden one takes its place
  const t = fresh();
  t.pets = [1, 2, 3, 4, 5].map((uid) => ({ uid, id: 'boltBug', golden: false }));
  E.migrateEconomy(t);
  t.petsEquipped = [1];
  const g = E.makeGolden(t, 'boltBug');
  assert.equal(g.pet.equipped, true);
  assert.deepEqual(t.petsEquipped, [g.pet.uid]);
  assert.equal(E.shopView(t).pets.goldenReady.length, 0);
});

test('styles: buy equips, defaults always owned, equip needs ownership', () => {
  const s = fresh({ bolts: 200 });
  assert.equal(E.styleOwned(s, 'belt:steel'), true);
  assert.equal(E.styleEquipped(s, 'belt:steel'), true);
  assert.equal(E.equipStyle(s, 'belt:gold').reason, 'notOwned');
  assert.equal(E.buyStyle(s, 'belt:gold').ok, true);
  assert.equal(s.styles.belt, 'gold');
  assert.equal(s.bolts, 50);
  assert.equal(E.buyStyle(s, 'belt:gold').reason, 'owned');
  assert.equal(E.buyStyle(s, 'belt:steel').reason, 'owned');
  assert.equal(E.buyStyle(s, 'theme:space').reason, 'bolts');
  assert.equal(E.buyStyle(s, 'belt:__proto__').reason, 'unknown');
  assert.equal(E.equipStyle(s, 'belt:steel').ok, true);
  assert.equal(s.styles.belt, 'steel');
});

test('rebirth: resets bolts/upgrades/builds, keeps pets/styles/daily, +slot', () => {
  const s = fresh({ bolts: 5000, builds: 9, upgrades: { forge: 4, belt: 2 } });
  s.pets = [{ uid: 1, id: 'cyberCat', golden: false }];
  s.petsEquipped = [1];
  s.styles.owned = ['belt:gold'];
  s.styles.belt = 'gold';
  s.daily = { last: '2026-01-02', streak: 3 };
  s.drones = { 5: true };
  s.level = 12;
  assert.equal(E.canRebirth(s), false);
  assert.equal(E.applyRebirth(s).reason, 'locked');
  s.builds = 10;
  assert.equal(E.canRebirth(s), true);
  const r = E.applyRebirth(s);
  assert.deepEqual(r, { ok: true, rebirths: 1, mult: 1.5, slots: 4 });
  assert.equal(s.bolts, 0);
  assert.equal(s.builds, 0);
  assert.deepEqual(s.upgrades, { forge: 0, belt: 0, magnet: 0, battery: 0, combo: 0 });
  assert.deepEqual(s.pets, [{ uid: 1, id: 'cyberCat', golden: false }]);
  assert.deepEqual(s.petsEquipped, [1]);
  assert.equal(s.styles.belt, 'gold');
  assert.deepEqual(s.daily, { last: '2026-01-02', streak: 3 });
  assert.deepEqual(s.drones, { 5: true });
  assert.equal(s.level, 12);
  assert.equal(E.eggUnlocked(s, 'galaxy'), true);
  assert.equal(E.eggUnlocked(s, 'neon'), true);
  s.rebirths = E.MAX_REBIRTHS;
  s.builds = 10;
  assert.equal(E.canRebirth(s), false);
});

test('daily: first claim, yesterday, skip, wrap after 7, same day, bad date', () => {
  const s = fresh();
  let st = E.dailyStatus(s, '2026-03-01');
  assert.equal(st.claimable, true);
  assert.equal(st.day, 1);
  assert.equal(st.rewards.length, 7);
  assert.deepEqual(st.rewards[0], { day: 1, bolts: 50 });
  assert.deepEqual(st.rewards[6], { day: 7, egg: 'basic' });
  let r = E.claimDaily(s, '2026-03-01');
  assert.deepEqual(r, { ok: true, day: 1, bolts: 50 });
  assert.equal(s.bolts, 50);
  assert.equal(s.stats.totalBolts, 50);
  assert.equal(E.claimDaily(s, '2026-03-01').reason, 'claimed');
  assert.equal(E.dailyStatus(s, '2026-03-01').claimable, false);
  // consecutive days across a month boundary
  assert.equal(E.claimDaily(s, '2026-03-02').day, 2);
  // skip a day -> back to 1
  assert.equal(E.claimDaily(s, '2026-03-04').day, 1);
  // run 7 days, day 7 is a free egg, then wraps to day 1
  const days = ['2026-12-26', '2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
  const t = fresh();
  const got = days.map((d) => E.claimDaily(t, d, () => 0));
  assert.deepEqual(got.map((g) => g.day), [1, 2, 3, 4, 5, 6, 7, 1]);
  assert.equal(got[6].pet.id, 'boltBug');
  assert.equal(got[6].egg, 'basic');
  assert.equal(t.pets.length, 1);
  assert.equal(t.bolts, 50 + 75 + 100 + 150 + 200 + 300 + 50);
  // leap day
  assert.equal(E.prevDateStr('2028-03-01'), '2028-02-29');
  assert.equal(E.prevDateStr('2027-03-01'), '2027-02-28');
  // bad dates
  assert.equal(E.claimDaily(t, '2027-02-30').reason, 'badDate');
  assert.equal(E.claimDaily(t, 'yesterday').reason, 'badDate');
  assert.equal(E.dailyStatus(t, null).claimable, false);
  // rebirth multiplies bolt rewards; neon egg on day 7 once unlocked
  const u = fresh({ rebirths: 2 });
  st = E.dailyStatus(u, '2026-05-05');
  assert.equal(st.rewards[0].bolts, 100);
  assert.equal(st.rewards[6].egg, 'neon');
  // full inventory on day 7 pays the egg price in bolts
  const v = fresh({ daily: { last: '2026-05-04', streak: 6 } });
  v.pets = Array.from({ length: E.INV_MAX }, (_, i) => ({ uid: i + 1, id: 'boltBug', golden: false }));
  E.migrateEconomy(v);
  const full = E.claimDaily(v, '2026-05-05');
  assert.equal(full.day, 7);
  assert.equal(full.reason, 'full');
  assert.equal(full.bolts, E.eggInfo('basic').cost);
  // clock moved backwards (today <= last claim): not claimable, nothing paid
  const w = fresh({ daily: { last: '2030-01-01', streak: 4 } });
  assert.equal(E.dailyStatus(w, '2026-01-01').claimable, false);
  assert.equal(E.claimDaily(w, '2026-01-01').reason, 'claimed');
  assert.deepEqual(w.daily, { last: '2030-01-01', streak: 4 });
  // ...and clampDailyClock unlocks it: claimed "today", next real day claimable from day 1
  assert.equal(E.clampDailyClock(w, '2026-01-01'), true);
  assert.deepEqual(w.daily, { last: '2026-01-01', streak: 0 });
  assert.equal(E.dailyStatus(w, '2026-01-01').claimable, false);
  assert.equal(E.dailyStatus(w, '2026-01-02').claimable, true);
  assert.equal(E.dailyStatus(w, '2026-01-02').day, 1);
  assert.equal(E.clampDailyClock(w, '2026-01-01'), false);
  assert.equal(E.localDateStr(new Date(2026, 0, 5)), '2026-01-05');
});

test('nextGoal: cheapest, Build wins ties, eggs only while slots free or untried, rebirth last', () => {
  const s = fresh({ bolts: 10 });
  let g = E.nextGoal(s);
  assert.equal(g.kind, 'build');
  assert.equal(g.id, 'sign');
  assert.equal(g.cost, E.BUILDS[0].cost);
  assert.equal(g.progress, 10 / E.BUILDS[0].cost);
  assert.equal(g.tab, 'build');
  // tie: make an upgrade cost the same as the build
  s.builds = 1; // next build = lights
  const lights = E.buildCost(1, 0);
  g = E.nextGoal(s);
  assert.ok(g.cost <= lights);
  // all builds done -> rebirth
  s.builds = 10;
  g = E.nextGoal(s);
  assert.equal(g.kind, 'rebirth');
  assert.equal(g.progress, 1);
  // eggs: once slots are full and the egg has been tried, it stops being a goal
  const t = fresh({ bolts: 0, upgrades: { forge: 10, belt: 5, magnet: 5, battery: 4, combo: 5 }, builds: 4 });
  t.pets = [1, 2, 3].map((uid) => ({ uid, id: 'boltBug', golden: false }));
  E.migrateEconomy(t);
  assert.equal(E.nextGoal(t).kind, 'build');
  t.pets.pop();
  assert.equal(E.nextGoal(t).kind, 'egg');
  // progress caps at 1
  t.bolts = 1e9;
  assert.equal(E.nextGoal(t).progress, 1);
});

test('shopView matches the section 11 shape', () => {
  const s = fresh({ bolts: 70, builds: 1, upgrades: { forge: 2 } });
  s.pets = [{ uid: 1, id: 'cyberCat', golden: false }];
  s.petsEquipped = [1];
  E.migrateEconomy(s);
  const drones = [{ id: 'drone-2', name: '×2 Auto-Drone' }];
  const v = E.shopView(s, { tab: 'pets', drones });
  assert.equal(v.bolts, 70);
  assert.equal(v.rebirths, 0);
  assert.equal(v.tab, 'pets');
  assert.equal(v.mult, Math.round(1.4 * 1.8 * 10000) / 10000);
  assert.equal(v.upgrades.length, 5);
  const f = v.upgrades[0];
  for (const k of ['id', 'name', 'desc', 'level', 'max', 'cost', 'effectText', 'nextEffectText', 'affordable']) assert.ok(k in f, k);
  assert.equal(f.level, 2);
  assert.equal(f.effectText, '+40% bolts');
  assert.equal(f.nextEffectText, '+60% bolts');
  assert.equal(v.build.done, 1);
  assert.equal(v.build.total, 10);
  assert.deepEqual(v.build.items.slice(0, 3).map((i) => i.state), ['owned', 'next', 'locked']);
  assert.equal(v.build.items[1].affordable, 70 >= E.BUILDS[1].cost);
  for (const k of ['id', 'name', 'cost', 'flat', 'state', 'affordable']) assert.ok(k in v.build.items[0], k);
  assert.equal(v.pets.eggs.length, 3);
  for (const k of ['id', 'name', 'cost', 'unlocked', 'unlockText', 'affordable', 'odds']) assert.ok(k in v.pets.eggs[0], k);
  assert.equal(v.pets.eggs[0].odds.length, 5);
  for (const k of ['petId', 'name', 'rarity', 'chance', 'boost']) assert.ok(k in v.pets.eggs[0].odds[0], k);
  assert.equal(v.pets.eggs[1].unlocked, false);
  assert.ok(v.pets.eggs[1].unlockText.length > 0);
  assert.deepEqual(v.pets.inventory[0], { uid: 1, id: 'cyberCat', name: 'Cyber-Cat', rarity: 'legendary', golden: false, boost: 0.8, equipped: true, sellValue: 12 });
  assert.equal(v.pets.slots, 3);
  assert.equal(v.pets.equippedCount, 1);
  assert.equal(v.pets.invCount, 1);
  assert.equal(v.pets.invMax, 60);
  assert.deepEqual(v.pets.goldenReady, []);
  assert.equal(v.pets.index.length, 15);
  assert.equal(v.pets.index.find((i) => i.id === 'cyberCat').found, true);
  assert.equal(v.pets.index.find((i) => i.id === 'boltBug').found, false);
  assert.equal(v.style.length, 13);
  for (const k of ['key', 'kind', 'id', 'name', 'cost', 'owned', 'equipped', 'affordable']) assert.ok(k in v.style[0], k);
  assert.equal(v.drones, drones);
  for (const k of ['can', 'rebirths', 'nextMult', 'nextSlots', 'buildsDone', 'buildsTotal', 'keeps', 'resets']) assert.ok(k in v.rebirth, k);
  assert.equal(v.rebirth.nextMult, 1.5);
  assert.equal(v.rebirth.nextSlots, 4);
  // no tab given -> no tab key
  assert.equal('tab' in E.shopView(s), false);
  // maxed upgrade has null cost / nextEffectText
  s.upgrades.battery = 4;
  const bat = E.shopView(s).upgrades.find((u) => u.id === 'battery');
  assert.equal(bat.cost, null);
  assert.equal(bat.nextEffectText, null);
  assert.equal(bat.affordable, false);
});

test('migrateEconomy: old cosmetics become styles and a Cyber-Cat pet', () => {
  const old = {
    bolts: 300,
    owned: { goldBelts: true, rainbowTrails: true, cyberCat: true },
    equipped: { goldBelts: true, rainbowTrails: false, cyberCat: true },
    drones: { 3: true },
  };
  const s = E.migrateEconomy(old);
  assert.equal(s, old);
  assert.deepEqual(s.styles, { owned: ['belt:gold', 'trail:rainbow'], belt: 'gold', trail: 'none', theme: 'neon' });
  assert.deepEqual(s.pets, [{ uid: 1, id: 'cyberCat', golden: false }]);
  assert.deepEqual(s.petsEquipped, [1]);
  assert.deepEqual(s.petIndex, ['cyberCat']);
  assert.equal(s.nextPetUid, 2);
  assert.deepEqual(s.upgrades, { forge: 0, belt: 0, magnet: 0, battery: 0, combo: 0 });
  assert.equal(s.builds, 0);
  assert.equal(s.rebirths, 0);
  assert.deepEqual(s.daily, { last: null, streak: 0 });
  assert.deepEqual(s.stats, { totalBolts: 0 });
  assert.equal(s.econVersion, E.ECON_VERSION);
  assert.deepEqual(s.drones, { 3: true });
  // idempotent: a second pass doesn't add another cat
  const again = E.migrateEconomy(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(again, JSON.parse(JSON.stringify(s)));
  // nothing owned -> nothing migrated
  const none = E.migrateEconomy({ owned: { goldBelts: false }, equipped: { goldBelts: true } });
  assert.deepEqual(none.styles.owned, []);
  assert.equal(none.styles.belt, 'steel');
  assert.deepEqual(none.pets, []);
  // owned-but-unequipped cat still becomes a pet (equipped since a slot is free? no: only if it was on)
  const off = E.migrateEconomy({ owned: { cyberCat: true }, equipped: { cyberCat: false } });
  assert.equal(off.pets.length, 1);
});

test('migrateEconomy sanitises hostile input', () => {
  const hostile = JSON.parse(`{
    "upgrades": { "forge": 1e308, "belt": -5, "magnet": "3", "battery": 2.7, "combo": null, "__proto__": { "forge": 9 } },
    "builds": 99, "rebirths": 1e9,
    "pets": [
      { "uid": 1, "id": "cyberCat", "golden": true },
      { "uid": 1, "id": "boltBug" },
      { "uid": 2, "id": "__proto__" },
      { "uid": 3, "id": "constructor" },
      { "uid": -4, "id": "boltBug" },
      { "uid": 5.5, "id": "boltBug" },
      { "uid": "6", "id": "boltBug" },
      { "uid": 7, "id": "gearPup", "golden": "yes" },
      null, 42, "pet", [1,2],
      { "uid": 1e300, "id": "boltBug" }
    ],
    "petsEquipped": [7, 7, 1, 99, "1", null, 2],
    "petIndex": ["boltBug", "boltBug", "toString", 5, "__proto__"],
    "nextPetUid": -3,
    "styles": { "owned": ["belt:gold", "belt:gold", "belt:steel", "nope:x", 7, "__proto__"], "belt": "lava", "trail": "constructor", "theme": "space", "__proto__": { "belt": "gold" } },
    "daily": { "last": "2026-02-31", "streak": 99 },
    "stats": { "totalBolts": "lots" },
    "__proto__": { "polluted": true }
  }`);
  const s = E.migrateEconomy(hostile);
  assert.deepEqual(s.upgrades, { forge: 10, belt: 0, magnet: 0, battery: 2, combo: 0 });
  assert.equal(s.builds, 10);
  assert.equal(s.rebirths, E.MAX_REBIRTHS);
  // duplicate uid 1 -> pets renumbered densely, equipped remapped (7 -> 3, 1 -> first holder)
  assert.deepEqual(s.pets, [{ uid: 1, id: 'cyberCat', golden: true }, { uid: 2, id: 'boltBug', golden: false }, { uid: 3, id: 'gearPup', golden: false }]);
  assert.deepEqual(s.petsEquipped, [3, 1]);
  assert.deepEqual(s.petIndex, ['boltBug', 'cyberCat', 'gearPup']);
  assert.equal(s.nextPetUid, 4);
  assert.deepEqual(s.styles, { owned: ['belt:gold'], belt: 'steel', trail: 'none', theme: 'neon' });
  assert.deepEqual(s.daily, { last: null, streak: 0 });
  assert.deepEqual(s.stats, { totalBolts: 0 });
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
  // non-object input passes through
  assert.equal(E.migrateEconomy(null), null);
  // > 60 pets are cut to 60, equipped trimmed to slots
  const many = { pets: Array.from({ length: 80 }, (_, i) => ({ uid: i + 1, id: 'boltBug' })), petsEquipped: [1, 2, 3, 4, 5, 6, 7] };
  E.migrateEconomy(many);
  assert.equal(many.pets.length, 60);
  assert.deepEqual(many.petsEquipped, [1, 2, 3]);
  assert.equal(many.nextPetUid, 61);
  // equipped style must be owned
  const st = E.migrateEconomy({ styles: { owned: [], theme: 'space' } });
  assert.equal(st.styles.theme, 'neon');
});

test('earnBolts adds to balance and lifetime stats; ignores junk', () => {
  const s = fresh({ bolts: 5 });
  assert.equal(E.earnBolts(s, 10.7), 10);
  assert.equal(s.bolts, 15);
  assert.equal(s.stats.totalBolts, 10);
  assert.equal(E.earnBolts(s, -3), 0);
  assert.equal(E.earnBolts(s, NaN), 0);
  assert.equal(s.bolts, 15);
});

// Section 12 balance targets. Seeds are fixed so the run is deterministic.
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

test('balance simulation (section 12 targets)', (t) => {
  const rows = SEEDS.map((seed) => ({ seed, ...simulate(seed) }));
  for (const r of rows) {
    const [r1, r2] = r.rebirths;
    assert.ok(r.firstPurchase !== null && r.firstPurchase <= 3, `seed ${r.seed}: first purchase at ${r.firstPurchase}`);
    assert.ok(r.maxGap60 <= 5, `seed ${r.seed}: ${r.maxGap60} orders without a purchase in the first 60`);
    assert.ok(r.firstEgg !== null && r.firstEgg <= 15, `seed ${r.seed}: first egg at ${r.firstEgg}`);
    assert.ok(r1 >= 80 && r1 <= 220, `seed ${r.seed}: first rebirth at ${r1}`);
    assert.ok(r2 !== undefined && r2 - r1 < r1, `seed ${r.seed}: second rebirth took ${r2 - r1} vs ${r1}`);
  }
  const med = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
  t.diagnostic(
    `median over ${rows.length} seeds: first purchase ${med(rows.map((r) => r.firstPurchase))}, first egg ${med(rows.map((r) => r.firstEgg))}, ` +
      `first rebirth ${med(rows.map((r) => r.rebirths[0]))}, second rebirth after ${med(rows.map((r) => r.rebirths[1] - r.rebirths[0]))} more`,
  );
});

test('date toggle: no second chest on the same or an earlier day', () => {
  const s = fresh({ daily: { last: '2026-05-05', streak: 2 } });
  for (const d of ['2026-05-05', '2026-05-04', '2025-12-31']) {
    assert.equal(E.dailyStatus(s, d).claimable, false, d);
    assert.equal(E.claimDaily(s, d).ok, false, d);
  }
  assert.equal(s.bolts || 0, 0);
  // the next real day still works
  const r = E.claimDaily(s, '2026-05-06');
  assert.equal(r.ok, true);
  assert.equal(r.day, 3);
});

test('rebirth view: current and next rebirth-only multiplier and slots', () => {
  const s = fresh({ rebirths: 1, builds: 10 });
  s.pets = [{ uid: 1, id: 'plasmaDragon', golden: true }];
  s.petsEquipped = [1];
  const v = E.shopView(s);
  assert.equal(v.rebirth.mult, E.rebirthMult(s));
  assert.equal(v.rebirth.slots, E.petSlots(s));
  assert.ok(v.rebirth.nextMult > v.rebirth.mult);
  assert.ok(v.rebirth.nextSlots >= v.rebirth.slots);
  // view.mult (total) is not the rebirth-only multiplier
  assert.notEqual(v.mult, v.rebirth.mult);
  const max = fresh({ rebirths: E.MAX_REBIRTHS });
  const mv = E.shopView(max);
  assert.equal(mv.rebirth.nextSlots, mv.rebirth.slots); // no slot promised at the cap
});

test('pet uids: nextPetUid clamped, no uid reuse at MAX_UID, dense renumbering', () => {
  const MAX = 2 ** 31 - 1;
  // ensurePetArrays clamp: a pet at MAX_UID must not push nextPetUid above MAX_UID
  const s = fresh({ bolts: 1e6 });
  s.pets = [{ uid: MAX, id: 'boltBug', golden: false }];
  s.petsEquipped = [];
  s.nextPetUid = 5;
  let h = E.hatchEgg(s, 'basic', () => 0);
  assert.ok(s.nextPetUid <= MAX);
  // hatch while the next uid is taken -> refused with 'full', nothing spent
  s.pets = [{ uid: MAX, id: 'boltBug', golden: false }];
  s.nextPetUid = MAX;
  const before = s.bolts;
  h = E.hatchEgg(s, 'basic', () => 0);
  assert.equal(h.ok, false);
  assert.equal(h.reason, 'full');
  assert.equal(s.bolts, before);
  assert.equal(new Set(s.pets.map((p) => p.uid)).size, s.pets.length);
  // makeGolden refuses too when no uid is free
  const g = fresh();
  g.pets = [1, 2, 3, 4, 5].map((uid) => ({ uid, id: 'gearPup', golden: false }));
  g.pets.push({ uid: MAX, id: 'boltBug', golden: false });
  g.nextPetUid = MAX;
  assert.equal(E.makeGolden(g, 'gearPup').reason, 'full');
  assert.equal(g.pets.length, 6);
  // migration renumbers densely when a pet holds MAX_UID; old cyberCat gets a unique uid
  const m = E.migrateEconomy({
    pets: [{ uid: MAX, id: 'boltBug' }, { uid: 3, id: 'gearPup' }],
    petsEquipped: [MAX, MAX, 3],
    nextPetUid: MAX,
    owned: { cyberCat: true },
    equipped: { cyberCat: true },
  });
  const uids = m.pets.map((p) => p.uid);
  assert.equal(new Set(uids).size, uids.length);
  assert.deepEqual(uids, [1, 2, 3]);
  assert.equal(m.pets[2].id, 'cyberCat');
  assert.deepEqual(m.petsEquipped, [1, 2, 3]);
  assert.equal(new Set(m.petsEquipped).size, m.petsEquipped.length);
  assert.equal(m.nextPetUid, 4);
  const sum = E.petBoostOf(m.pets[0]) + E.petBoostOf(m.pets[1]) + E.petBoostOf(m.pets[2]);
  assert.ok(Math.abs(E.petBoost(m) - sum) < 1e-9);
  // idempotent
  assert.deepEqual(E.migrateEconomy(JSON.parse(JSON.stringify(m))), m);
  // a duplicated equipped uid never counts twice
  const d = fresh();
  d.pets = [{ uid: 1, id: 'cyberCat', golden: false }];
  d.petsEquipped = [1, 1];
  E.equipPet(d, 1);
  assert.deepEqual(d.petsEquipped, [1]);
});
