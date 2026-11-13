// Tycoon-style shop economy: catalogs, payout formula, purchases, pets, rebirth, daily chest.
// Pure: no DOM, no timers, no globals. Randomness is injected (`rng = Math.random`).
// The binding spec is docs/SHOP_DESIGN.md (sections 1-5, 7, 8, 10-12).
//
// Mutation helpers take the (sanitised) save, change it in place and return
// `{ ok: true, ... }` or `{ ok: false, reason, ... }`. They never throw on bad input.
//
// Reason codes: 'unknown' (bad id), 'max' (already maxed), 'bolts' (can't afford; `need` says how
// many more), 'locked', 'owned', 'notOwned', 'full' (pet inventory), 'equipped' (can't sell an
// equipped pet), 'slots' (no free equip slot), 'notEnough' (golden craft needs 5), 'claimed',
// 'badDate', 'order' (builds are bought in order).

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

/** Upgrades: cost(level) = round(baseCost * COST_GROWTH^level). Kept until rebirth. */
export const UPGRADES = Object.freeze([
  { id: 'forge', name: 'Forge Power', desc: 'More bolts from every order', max: 10, baseCost: 40 },
  { id: 'belt', name: 'Turbo Belts', desc: 'Belts run faster', max: 5, baseCost: 30 },
  { id: 'magnet', name: 'Bolt Magnet', desc: 'Golden bolt bags pop out of deliveries — tap them!', max: 5, baseCost: 60 },
  { id: 'battery', name: 'Overclock Battery', desc: 'Overclock lasts longer', max: 4, baseCost: 80 },
  { id: 'combo', name: 'Combo Chip', desc: 'Bigger combo bonus for right-first-time streaks', max: 5, baseCost: 100 },
].map(Object.freeze));
export const COST_GROWTH = 1.6;

/** Factory builds, bought strictly in order. `flat` is added to every order's base payout. */
export const BUILDS = Object.freeze([
  { id: 'sign', name: 'Neon Sign', cost: 25, flat: 2 },
  { id: 'lights', name: 'Party Lights', cost: 60, flat: 3 },
  { id: 'arm', name: 'Robot Arm', cost: 120, flat: 4 },
  { id: 'steam', name: 'Steam Generator', cost: 250, flat: 6 },
  { id: 'belt2', name: 'Second Belt Line', cost: 450, flat: 8 },
  { id: 'lift', name: 'Hover-Lift', cost: 800, flat: 11 },
  { id: 'reactor', name: 'Plasma Reactor', cost: 2000, flat: 15 },
  { id: 'trophies', name: 'Trophy Wall', cost: 4500, flat: 20 },
  { id: 'rocket', name: 'Rocket Pad', cost: 8000, flat: 28 },
  { id: 'statue', name: 'Golden Robot Statue', cost: 16000, flat: 40 },
].map(Object.freeze));

/** Rarities, in roll order. `chance` sums to 1 for every egg. */
export const RARITIES = Object.freeze([
  { id: 'common', name: 'Common', chance: 0.6, boost: 0.05, color: '#b8c2d8' },
  { id: 'uncommon', name: 'Uncommon', chance: 0.25, boost: 0.1, color: '#39ff88' },
  { id: 'rare', name: 'Rare', chance: 0.1, boost: 0.2, color: '#4d9cff' },
  { id: 'epic', name: 'Epic', chance: 0.04, boost: 0.4, color: '#b45cff' },
  { id: 'legendary', name: 'Legendary', chance: 0.01, boost: 0.8, color: '#ffd34d' },
].map(Object.freeze));

/** Eggs. `pets` is one pet id per rarity, in RARITIES order. */
export const EGGS = Object.freeze([
  {
    id: 'basic', name: 'Robo Egg', cost: 60, boostMult: 1, unlockText: '',
    pets: Object.freeze(['boltBug', 'gearPup', 'sparkMouse', 'turboTurtle', 'cyberCat']),
  },
  {
    id: 'neon', name: 'Neon Egg', cost: 600, boostMult: 2, unlockText: 'Build the Second Belt Line or Rebirth',
    pets: Object.freeze(['neonSlime', 'magnetMonkey', 'laserFox', 'roboOwl', 'plasmaDragon']),
  },
  {
    id: 'galaxy', name: 'Galaxy Egg', cost: 2500, boostMult: 4, unlockText: 'Rebirth once to unlock',
    pets: Object.freeze(['starBlob', 'cometBunny', 'orbitOcto', 'nebulaNarwhal', 'galaxyPhoenix']),
  },
].map(Object.freeze));

const PET_NAMES = {
  boltBug: 'Bolt Bug', gearPup: 'Gear Pup', sparkMouse: 'Spark Mouse', turboTurtle: 'Turbo Turtle', cyberCat: 'Cyber-Cat',
  neonSlime: 'Neon Slime', magnetMonkey: 'Magnet Monkey', laserFox: 'Laser Fox', roboOwl: 'Robo Owl', plasmaDragon: 'Plasma Dragon',
  starBlob: 'Star Blob', cometBunny: 'Comet Bunny', orbitOcto: 'Orbit Octo', nebulaNarwhal: 'Nebula Narwhal', galaxyPhoenix: 'Galaxy Phoenix',
};

/** All 15 pets: { id, name, egg, rarity, boost } where boost is the normal (non-golden) boost. */
export const PETS = Object.freeze(
  EGGS.flatMap((egg) =>
    egg.pets.map((id, i) =>
      Object.freeze({ id, name: PET_NAMES[id], egg: egg.id, rarity: RARITIES[i].id, boost: round4(RARITIES[i].boost * egg.boostMult) }),
    ),
  ),
);

/** Styles (permanent). Key = `kind:id`. Cost 0 = the default for that kind (always owned). */
export const STYLES = Object.freeze([
  { kind: 'belt', id: 'steel', name: 'Steel', cost: 0 },
  { kind: 'belt', id: 'gold', name: 'Golden Belts', cost: 150 },
  { kind: 'belt', id: 'candy', name: 'Candy Stripe', cost: 400 },
  { kind: 'belt', id: 'lava', name: 'Lava Belts', cost: 900 },
  { kind: 'trail', id: 'none', name: 'No Trail', cost: 0 },
  { kind: 'trail', id: 'rainbow', name: 'Rainbow Trails', cost: 250 },
  { kind: 'trail', id: 'sparkle', name: 'Star Sparkle', cost: 500 },
  { kind: 'trail', id: 'fire', name: 'Fire Trail', cost: 1000 },
  { kind: 'theme', id: 'neon', name: 'Neon Lab', cost: 0 },
  { kind: 'theme', id: 'lava', name: 'Lava Forge', cost: 1500 },
  { kind: 'theme', id: 'ice', name: 'Ice Station', cost: 2500 },
  { kind: 'theme', id: 'candy', name: 'Candy Factory', cost: 4000 },
  { kind: 'theme', id: 'space', name: 'Deep Space', cost: 6000 },
].map((s) => Object.freeze({ ...s, key: `${s.kind}:${s.id}` })));
export const STYLE_KINDS = Object.freeze(['belt', 'trail', 'theme']);
export const STYLE_DEFAULTS = Object.freeze({ belt: 'steel', trail: 'none', theme: 'neon' });

/** Daily chest rewards by streak day (1..7). Day 7 is a free egg hatch. */
export const DAILY_REWARDS = Object.freeze([50, 75, 100, 150, 200, 300, 'egg']);

export const INV_MAX = 60;
export const BASE_SLOTS = 3;
export const MAX_SLOTS = 6;
export const MAX_REBIRTHS = 99;
export const GOLDEN_COPIES = 5;
export const GOLDEN_BOOST_MULT = 3;
export const SELL_FRACTION = 0.2;
export const GOLDEN_SELL_MULT = 5;
export const REBIRTH_BONUS = 0.5; // per rebirth
export const BUILD_REBIRTH_SCALE = 0.5; // build costs × (1 + 0.5·rebirths)
export const COMBO_STEP = 0.1;
export const COMBO_BASE_CAP = 0.5;
export const MAGNET_BONUS = 0.5; // golden bag = +50% of that order's payout
export const ECON_VERSION = 1;

const MAX_BOLTS = 1e15;
const MAX_UID = 2 ** 31 - 1;

const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
const BUILD_INDEX = new Map(BUILDS.map((b, i) => [b.id, i]));
const EGG_BY_ID = new Map(EGGS.map((e) => [e.id, e]));
const PET_BY_ID = new Map(PETS.map((p) => [p.id, p]));
const STYLE_BY_KEY = new Map(STYLES.map((s) => [s.key, s]));
const RARITY_BY_ID = new Map(RARITIES.map((r) => [r.id, r]));

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function own(o, k) {
  return isObj(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

function int(v, def, min, max) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function bolts(save) {
  const b = save && save.bolts;
  return typeof b === 'number' && Number.isFinite(b) && b > 0 ? b : 0;
}

function rebirthsOf(save) {
  return int(save && save.rebirths, 0, 0, MAX_REBIRTHS);
}

function levelOf(save, id) {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return 0;
  return int(own(save && save.upgrades, id), 0, 0, u.max);
}

function buildsOf(save) {
  return int(save && save.builds, 0, 0, BUILDS.length);
}

function spend(save, n) {
  save.bolts = Math.max(0, bolts(save) - n);
}

function fail(reason, extra) {
  return { ok: false, reason, ...extra };
}

function needFail(save, cost) {
  return fail('bolts', { need: Math.max(0, Math.ceil(cost - bolts(save))) });
}

/** Adds earned bolts (from solving math) to the balance and lifetime stats. Returns the amount. */
export function earnBolts(save, n) {
  const add = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  save.bolts = Math.min(MAX_BOLTS, bolts(save) + add);
  if (!isObj(save.stats)) save.stats = { totalBolts: 0 };
  const tb = save.stats.totalBolts;
  save.stats.totalBolts = Math.min(MAX_BOLTS, (typeof tb === 'number' && Number.isFinite(tb) && tb > 0 ? tb : 0) + add);
  return add;
}

export function petInfo(petId) {
  return PET_BY_ID.get(petId) || null;
}

export function eggInfo(eggId) {
  return EGG_BY_ID.get(eggId) || null;
}

export function styleInfo(key) {
  return STYLE_BY_KEY.get(key) || null;
}

export function rarityInfo(rarityId) {
  return RARITY_BY_ID.get(rarityId) || null;
}

// ---------------------------------------------------------------------------
// Costs, multipliers and per-upgrade effects
// ---------------------------------------------------------------------------

/** Cost of buying the next level when the upgrade is at `lvl`. null when maxed or unknown. */
export function upgradeCost(id, lvl) {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return null;
  const l = int(lvl, 0, 0, u.max);
  if (l >= u.max) return null;
  return Math.round(u.baseCost * COST_GROWTH ** l);
}

/** Cost of Build item `index` (0-based) after `rebirths` rebirths. null for a bad index. */
export function buildCost(index, rebirths = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= BUILDS.length) return null;
  return Math.round(BUILDS[index].cost * (1 + BUILD_REBIRTH_SCALE * int(rebirths, 0, 0, MAX_REBIRTHS)));
}

/** Sum of `flat` for every Build item owned. */
export function buildFlat(save) {
  let f = 0;
  const n = buildsOf(save);
  for (let i = 0; i < n; i++) f += BUILDS[i].flat;
  return f;
}

export function rebirthMult(save) {
  return 1 + REBIRTH_BONUS * rebirthsOf(save);
}

export function petSlots(save) {
  return Math.min(MAX_SLOTS, BASE_SLOTS + rebirthsOf(save));
}

/** Boost of one pet object ({ id, golden }). */
export function petBoostOf(pet) {
  const p = pet && PET_BY_ID.get(pet.id);
  if (!p) return 0;
  return round4(p.boost * (pet.golden === true ? GOLDEN_BOOST_MULT : 1));
}

/** Sum of equipped pets' boosts (additive), e.g. 0.35 = +35%. */
export function petBoost(save) {
  const pets = Array.isArray(save && save.pets) ? save.pets : [];
  const eq = new Set(Array.isArray(save && save.petsEquipped) ? save.petsEquipped : []);
  let b = 0;
  for (const p of pets) if (p && eq.has(p.uid)) b += petBoostOf(p);
  return round4(b);
}

export function comboCap(save) {
  return round4(COMBO_BASE_CAP + COMBO_STEP * levelOf(save, 'combo'));
}

/**
 * Combo bonus for an order. `streak` = consecutive first-try orders INCLUDING this one
 * (0 when this order's first answer was wrong). +10% each, capped at comboCap.
 */
export function comboBonus(streak, save) {
  const s = int(streak, 0, 0, 1e6);
  return Math.min(comboCap(save), round4(COMBO_STEP * s));
}

/** Belt speed multiplier from Turbo Belts. */
export function beltSpeedMult(save) {
  return round4(1 + 0.15 * levelOf(save, 'belt'));
}

/** Extra overclock seconds from Overclock Battery. */
export function overclockBonusSec(save) {
  return 3 * levelOf(save, 'battery');
}

/** Chance (0..0.5) that a delivery drops a golden bolt bag. */
export function magnetChance(save) {
  return round4(0.1 * levelOf(save, 'magnet'));
}

/** Bolts for tapping a golden bolt bag, given that order's payout. */
export function magnetReward(payout) {
  const p = typeof payout === 'number' && Number.isFinite(payout) && payout > 0 ? payout : 0;
  return Math.max(1, Math.round(p * MAGNET_BONUS));
}

/** The always-on bolt multiplier (forge × pets × rebirth), for display. */
export function totalMult(save) {
  return round4((1 + 0.2 * levelOf(save, 'forge')) * (1 + petBoost(save)) * rebirthMult(save));
}

/**
 * Bolts for one delivered order (spec section 1).
 * order = { target, isPractice, critical, overclocked, streak }
 */
export function orderPayout(save, order = {}) {
  const target = typeof order.target === 'number' && Number.isFinite(order.target) ? Math.max(0, Math.min(144, order.target)) : 0;
  let base = 10 + Math.round(target / 6);
  base += buildFlat(save);
  let mult = 1;
  if (order.isPractice) mult *= 1.5;
  if (order.critical) mult *= 1.5;
  mult *= 1 + comboBonus(order.streak, save);
  if (order.overclocked) mult *= 2;
  mult *= 1 + 0.2 * levelOf(save, 'forge');
  mult *= 1 + petBoost(save);
  mult *= rebirthMult(save);
  return Math.max(1, Math.round(base * mult));
}

// ---------------------------------------------------------------------------
// Upgrades & builds
// ---------------------------------------------------------------------------

export function buyUpgrade(save, id) {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return fail('unknown');
  const lvl = levelOf(save, id);
  const cost = upgradeCost(id, lvl);
  if (cost === null) return fail('max');
  if (bolts(save) < cost) return needFail(save, cost);
  spend(save, cost);
  if (!isObj(save.upgrades)) save.upgrades = {};
  save.upgrades[id] = lvl + 1;
  return { ok: true, id, level: lvl + 1, cost };
}

/** Buys the next Build item. `id` (optional) must be the next one in order. */
export function buyBuild(save, id) {
  const n = buildsOf(save);
  if (id !== undefined && id !== null) {
    if (!BUILD_INDEX.has(id)) return fail('unknown');
    const idx = BUILD_INDEX.get(id);
    if (idx < n) return fail('owned');
    if (idx > n) return fail('order');
  }
  if (n >= BUILDS.length) return fail('max');
  const cost = buildCost(n, rebirthsOf(save));
  if (bolts(save) < cost) return needFail(save, cost);
  spend(save, cost);
  save.builds = n + 1;
  return { ok: true, id: BUILDS[n].id, index: n, cost };
}

// ---------------------------------------------------------------------------
// Pets
// ---------------------------------------------------------------------------

export function eggUnlocked(save, eggId) {
  if (eggId === 'basic') return true;
  if (eggId === 'neon') return buildsOf(save) >= 5 || rebirthsOf(save) >= 1;
  if (eggId === 'galaxy') return rebirthsOf(save) >= 1;
  return false;
}

/** Odds table for an egg's card: [{ petId, name, rarity, chance, boost }]. */
export function eggOdds(eggId) {
  const egg = EGG_BY_ID.get(eggId);
  if (!egg) return [];
  return egg.pets.map((petId, i) => {
    const p = PET_BY_ID.get(petId);
    return { petId, name: p.name, rarity: p.rarity, chance: RARITIES[i].chance, boost: p.boost };
  });
}

/** Rolls one pet id from an egg. Returns null for an unknown egg. */
export function rollEgg(eggId, rng = Math.random) {
  const egg = EGG_BY_ID.get(eggId);
  if (!egg) return null;
  let r = Number(rng());
  if (!Number.isFinite(r) || r < 0) r = 0;
  if (r >= 1) r = 0.9999999;
  let acc = 0;
  for (let i = 0; i < RARITIES.length; i++) {
    acc += RARITIES[i].chance;
    if (r < acc) return egg.pets[i];
  }
  return egg.pets[egg.pets.length - 1];
}

function ensurePetArrays(save) {
  if (!Array.isArray(save.pets)) save.pets = [];
  if (!Array.isArray(save.petsEquipped)) save.petsEquipped = [];
  if (!Array.isArray(save.petIndex)) save.petIndex = [];
  const maxUid = save.pets.reduce((m, p) => Math.max(m, p && Number.isInteger(p.uid) ? p.uid : 0), 0);
  // same clamp as migrateEconomy: never above MAX_UID
  save.nextPetUid = Math.max(int(save.nextPetUid, 1, 1, MAX_UID), Math.min(MAX_UID, maxUid + 1));
  // equipped = unique uids of pets that exist (a uid equipped twice would count twice in petBoost)
  const have = new Set(save.pets.map((p) => p && p.uid));
  const eq = [];
  for (const u of save.petsEquipped) if (have.has(u) && !eq.includes(u)) eq.push(u);
  save.petsEquipped = eq;
}

/**
 * The uid the next new pet would get, or null when none <= MAX_UID is free (the save is then
 * renumbered densely by migrateEconomy on the next load). `freed` = uids about to be removed.
 */
function peekUid(save, freed) {
  const uid = save.nextPetUid;
  if (!Number.isInteger(uid) || uid < 1 || uid > MAX_UID) return null;
  if (save.pets.some((p) => p && p.uid === uid && !(freed && freed.has(uid)))) return null;
  return uid;
}

function takeUid(save, uid) {
  save.nextPetUid = Math.min(MAX_UID, uid + 1);
  return uid;
}

/** Adds a pet; returns its result, or null when no uid is free (caller fails with 'full'). */
function addPet(save, id, golden) {
  ensurePetArrays(save);
  const free = peekUid(save);
  if (free === null) return null;
  const uid = takeUid(save, free);
  const pet = { uid, id, golden: !!golden };
  save.pets.push(pet);
  const isNew = !save.petIndex.includes(id);
  if (isNew) save.petIndex.push(id);
  let equipped = false;
  if (save.petsEquipped.length < petSlots(save)) {
    save.petsEquipped.push(uid);
    equipped = true;
  }
  return petResult(pet, isNew, equipped);
}

function petResult(pet, isNew, equipped) {
  const p = PET_BY_ID.get(pet.id);
  return { uid: pet.uid, id: pet.id, name: p.name, rarity: p.rarity, golden: pet.golden, boost: petBoostOf(pet), isNew, equipped };
}

/**
 * Hatches an egg. Spends the egg cost unless opts.free. New pets auto-equip into a free slot.
 * Returns { ok, pet: { uid, id, name, rarity, golden, boost, isNew, equipped }, cost }.
 */
export function hatchEgg(save, eggId, rng = Math.random, opts = {}) {
  const egg = EGG_BY_ID.get(eggId);
  if (!egg) return fail('unknown');
  const free = !!(opts && opts.free);
  if (!free && !eggUnlocked(save, eggId)) return fail('locked');
  ensurePetArrays(save);
  if (save.pets.length >= INV_MAX || peekUid(save) === null) return fail('full');
  if (!free && bolts(save) < egg.cost) return needFail(save, egg.cost);
  const id = rollEgg(eggId, rng);
  if (!free) spend(save, egg.cost);
  const pet = addPet(save, id, false);
  if (!pet) return fail('full'); // unreachable: checked above before spending
  return { ok: true, pet, cost: free ? 0 : egg.cost };
}

function findPet(save, uid) {
  return Array.isArray(save.pets) ? save.pets.find((p) => p && p.uid === uid) || null : null;
}

export function equipPet(save, uid) {
  ensurePetArrays(save);
  if (!findPet(save, uid)) return fail('unknown');
  if (save.petsEquipped.includes(uid)) return { ok: true, uid };
  if (save.petsEquipped.length >= petSlots(save)) return fail('slots');
  save.petsEquipped.push(uid);
  return { ok: true, uid };
}

export function unequipPet(save, uid) {
  ensurePetArrays(save);
  if (!findPet(save, uid)) return fail('unknown');
  save.petsEquipped = save.petsEquipped.filter((u) => u !== uid);
  return { ok: true, uid };
}

/** Equips the strongest pets into every slot. */
export function equipBest(save) {
  ensurePetArrays(save);
  const sorted = save.pets.slice().sort((a, b) => petBoostOf(b) - petBoostOf(a) || a.uid - b.uid);
  save.petsEquipped = sorted.slice(0, petSlots(save)).map((p) => p.uid);
  return { ok: true, equipped: save.petsEquipped.slice() };
}

export function petSellValue(pet) {
  const p = pet && PET_BY_ID.get(pet.id);
  if (!p) return 0;
  const egg = EGG_BY_ID.get(p.egg);
  return Math.round(egg.cost * SELL_FRACTION) * (pet.golden === true ? GOLDEN_SELL_MULT : 1);
}

export function sellPet(save, uid) {
  ensurePetArrays(save);
  const pet = findPet(save, uid);
  if (!pet) return fail('unknown');
  if (save.petsEquipped.includes(uid)) return fail('equipped');
  const value = petSellValue(pet);
  save.pets = save.pets.filter((p) => p !== pet);
  save.bolts = Math.min(MAX_BOLTS, bolts(save) + value);
  return { ok: true, uid, bolts: value };
}

/** Fuses 5 normal copies of `petId` into one golden pet (unequipped copies are used first). */
export function makeGolden(save, petId) {
  if (!PET_BY_ID.has(petId)) return fail('unknown');
  ensurePetArrays(save);
  const eq = new Set(save.petsEquipped);
  const copies = save.pets.filter((p) => p.id === petId && p.golden !== true);
  if (copies.length < GOLDEN_COPIES) return fail('notEnough', { have: copies.length });
  copies.sort((a, b) => (eq.has(a.uid) ? 1 : 0) - (eq.has(b.uid) ? 1 : 0) || a.uid - b.uid);
  const used = new Set(copies.slice(0, GOLDEN_COPIES).map((p) => p.uid));
  const free = peekUid(save, used);
  if (free === null) return fail('full');
  const hadEquipped = [...used].some((u) => eq.has(u));
  save.pets = save.pets.filter((p) => !used.has(p.uid));
  save.petsEquipped = save.petsEquipped.filter((u) => !used.has(u));
  const uid = takeUid(save, free);
  const pet = { uid, id: petId, golden: true };
  save.pets.push(pet);
  let equipped = false;
  if (hadEquipped && save.petsEquipped.length < petSlots(save)) {
    save.petsEquipped.push(uid);
    equipped = true;
  }
  return { ok: true, pet: petResult(pet, false, equipped), used: [...used] };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function ensureStyles(save) {
  if (!isObj(save.styles)) save.styles = { owned: [], ...STYLE_DEFAULTS };
  if (!Array.isArray(save.styles.owned)) save.styles.owned = [];
  for (const k of STYLE_KINDS) {
    if (typeof save.styles[k] !== 'string') save.styles[k] = STYLE_DEFAULTS[k];
  }
}

export function styleOwned(save, key) {
  const s = STYLE_BY_KEY.get(key);
  if (!s) return false;
  if (s.cost === 0) return true;
  return !!(save && isObj(save.styles) && Array.isArray(save.styles.owned) && save.styles.owned.includes(key));
}

export function styleEquipped(save, key) {
  const s = STYLE_BY_KEY.get(key);
  if (!s) return false;
  const cur = save && isObj(save.styles) ? save.styles[s.kind] : undefined;
  return (typeof cur === 'string' ? cur : STYLE_DEFAULTS[s.kind]) === s.id;
}

/** Buys a style and equips it straight away. */
export function buyStyle(save, key) {
  const s = STYLE_BY_KEY.get(key);
  if (!s) return fail('unknown');
  ensureStyles(save);
  if (styleOwned(save, key)) return fail('owned');
  if (bolts(save) < s.cost) return needFail(save, s.cost);
  spend(save, s.cost);
  save.styles.owned.push(key);
  save.styles[s.kind] = s.id;
  return { ok: true, key, cost: s.cost };
}

export function equipStyle(save, key) {
  const s = STYLE_BY_KEY.get(key);
  if (!s) return fail('unknown');
  ensureStyles(save);
  if (!styleOwned(save, key)) return fail('notOwned');
  save.styles[s.kind] = s.id;
  return { ok: true, key };
}

// ---------------------------------------------------------------------------
// Rebirth
// ---------------------------------------------------------------------------

export const REBIRTH_KEEPS = Object.freeze([
  'Your pets',
  'Your styles (belts, trails, themes)',
  'Your Auto-Drones',
  'Your level and the tables you know',
  'Your daily chest streak',
]);
export const REBIRTH_RESETS = Object.freeze([
  'Your bolts go back to 0',
  'Upgrades go back to level 0',
  'Your factory builds are packed away',
]);

export function canRebirth(save) {
  return buildsOf(save) >= BUILDS.length && rebirthsOf(save) < MAX_REBIRTHS;
}

/** Resets bolts/upgrades/builds; keeps everything else; +1 rebirth. */
export function applyRebirth(save) {
  if (!canRebirth(save)) return fail('locked');
  save.rebirths = rebirthsOf(save) + 1;
  save.bolts = 0;
  save.upgrades = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
  save.builds = 0;
  return { ok: true, rebirths: save.rebirths, mult: rebirthMult(save), slots: petSlots(save) };
}

// ---------------------------------------------------------------------------
// Daily chest
// ---------------------------------------------------------------------------

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isDateStr(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** The day before a YYYY-MM-DD date (null for a bad date). */
export function prevDateStr(s) {
  if (!isDateStr(s)) return null;
  const [y, mo, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d - 1));
  return dt.toISOString().slice(0, 10);
}

/** Local calendar date (device clock) as YYYY-MM-DD. */
export function localDateStr(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function dailyEgg(save) {
  return eggUnlocked(save, 'neon') ? 'neon' : 'basic';
}

/**
 * { claimable, day, streak, rewards: [{ day, bolts } | { day, egg }] }
 * `day` = the streak day you'd claim now (or the one claimed today when not claimable).
 */
export function dailyStatus(save, todayStr) {
  const d = isObj(save && save.daily) ? save.daily : {};
  const last = isDateStr(d.last) ? d.last : null;
  const streak = int(d.streak, 0, 0, 7);
  const mult = rebirthMult(save);
  const egg = dailyEgg(save);
  const rewards = DAILY_REWARDS.map((r, i) => (r === 'egg' ? { day: i + 1, egg } : { day: i + 1, bolts: Math.round(r * mult) }));
  if (!isDateStr(todayStr)) return { claimable: false, day: Math.max(1, streak), streak, rewards };
  // today must be strictly after the last claim (YYYY-MM-DD compares as a string): setting the
  // clock back and forth must not pay out the chest again
  if (last !== null && todayStr <= last) return { claimable: false, day: Math.max(1, streak), streak, rewards };
  const day = last !== null && last === prevDateStr(todayStr) && streak >= 1 ? (streak % 7) + 1 : 1;
  return { claimable: true, day, streak, rewards };
}

/**
 * A last-claim date in the future means the device clock was set ahead and then back. Treat it
 * as "claimed today" (streak reset) so the chest opens again on the next real day instead of
 * staying locked until that future date. Mutates save; returns true when it changed anything.
 */
export function clampDailyClock(save, todayStr) {
  if (!isDateStr(todayStr) || !isObj(save) || !isObj(save.daily)) return false;
  const last = isDateStr(save.daily.last) ? save.daily.last : null;
  if (last === null || last <= todayStr) return false;
  save.daily = { last: todayStr, streak: 0 };
  return true;
}

/**
 * Claims today's chest. Returns { ok, day, bolts?, pet? }. Day 7 hatches a free egg; if the
 * pet inventory is full it pays that egg's price in bolts instead.
 */
export function claimDaily(save, todayStr, rng = Math.random) {
  if (!isDateStr(todayStr)) return fail('badDate');
  const st = dailyStatus(save, todayStr);
  if (!st.claimable) return fail('claimed');
  save.daily = { last: todayStr, streak: st.day };
  const reward = st.rewards[st.day - 1];
  if (reward.egg) {
    const h = hatchEgg(save, reward.egg, rng, { free: true });
    if (h.ok) return { ok: true, day: st.day, pet: h.pet, egg: reward.egg };
    const b = earnBolts(save, EGG_BY_ID.get(reward.egg).cost);
    return { ok: true, day: st.day, bolts: b, egg: reward.egg, reason: 'full' };
  }
  const b = earnBolts(save, reward.bolts);
  return { ok: true, day: st.day, bolts: b };
}

// ---------------------------------------------------------------------------
// Next goal & shop view model
// ---------------------------------------------------------------------------

/**
 * Cheapest thing to save up for: { kind, id, label, cost, progress, tab } or null.
 * Candidates: the next Build item, the next level of each upgrade, and each unlocked egg while
 * you still have an empty pet slot or have never hatched from that egg. Ties: Build first.
 * When every Build item is owned, Rebirth (cost 0) is the goal.
 */
export function nextGoal(save) {
  const b = bolts(save);
  const mk = (kind, id, label, cost, tab) => ({ kind, id, label, cost, progress: cost <= 0 ? 1 : Math.min(1, b / cost), tab });
  if (canRebirth(save)) return mk('rebirth', 'rebirth', 'REBIRTH!', 0, 'rebirth');
  const cands = [];
  const n = buildsOf(save);
  if (n < BUILDS.length) cands.push(mk('build', BUILDS[n].id, BUILDS[n].name, buildCost(n, rebirthsOf(save)), 'build'));
  for (const u of UPGRADES) {
    const lvl = levelOf(save, u.id);
    const c = upgradeCost(u.id, lvl);
    if (c !== null) cands.push(mk('upgrade', u.id, `${u.name} Lv ${lvl + 1}`, c, 'upgrades'));
  }
  const pets = Array.isArray(save && save.pets) ? save.pets : [];
  const index = Array.isArray(save && save.petIndex) ? save.petIndex : [];
  const freeSlot = pets.length < petSlots(save);
  for (const egg of EGGS) {
    if (!eggUnlocked(save, egg.id) || pets.length >= INV_MAX) continue;
    const tried = egg.pets.some((id) => index.includes(id));
    if (freeSlot || !tried) cands.push(mk('egg', egg.id, egg.name, egg.cost, 'pets'));
  }
  let best = null;
  for (const c of cands) if (!best || c.cost < best.cost) best = c; // strict < keeps Build on ties
  return best;
}

/** Builds the shop view model (spec section 11). extras: { tab?, drones? }. */
export function shopView(save, extras = {}) {
  const b = bolts(save);
  const rb = rebirthsOf(save);
  const afford = (cost) => cost !== null && b >= cost;
  const need = (cost) => (cost === null ? 0 : Math.max(0, Math.ceil(cost - b)));

  const upgrades = UPGRADES.map((u) => {
    const level = levelOf(save, u.id);
    const cost = upgradeCost(u.id, level);
    return {
      id: u.id, name: u.name, desc: u.desc, level, max: u.max, cost,
      effectText: upgradeEffectText(u.id, level),
      nextEffectText: level < u.max ? upgradeEffectText(u.id, level + 1) : null,
      affordable: afford(cost), need: need(cost),
    };
  });

  const done = buildsOf(save);
  const build = {
    items: BUILDS.map((it, i) => {
      const cost = buildCost(i, rb);
      const state = i < done ? 'owned' : i === done ? 'next' : 'locked';
      return { id: it.id, name: it.name, cost, flat: it.flat, state, affordable: state === 'next' && afford(cost), need: state === 'next' ? need(cost) : 0 };
    }),
    done, total: BUILDS.length,
  };

  const petsArr = Array.isArray(save && save.pets) ? save.pets : [];
  const eqArr = Array.isArray(save && save.petsEquipped) ? save.petsEquipped : [];
  const eq = new Set(eqArr);
  const indexSet = new Set(Array.isArray(save && save.petIndex) ? save.petIndex : []);
  const invFull = petsArr.length >= INV_MAX;
  const eggs = EGGS.map((e) => {
    const unlocked = eggUnlocked(save, e.id);
    return { id: e.id, name: e.name, cost: e.cost, unlocked, unlockText: unlocked ? '' : e.unlockText, affordable: unlocked && !invFull && afford(e.cost), need: need(e.cost), odds: eggOdds(e.id) };
  });
  const inventory = petsArr
    .filter((p) => p && PET_BY_ID.has(p.id))
    .map((p) => {
      const info = PET_BY_ID.get(p.id);
      return { uid: p.uid, id: p.id, name: info.name, rarity: info.rarity, golden: p.golden === true, boost: petBoostOf(p), equipped: eq.has(p.uid), sellValue: petSellValue(p) };
    })
    .sort((x, y) => (y.equipped ? 1 : 0) - (x.equipped ? 1 : 0) || y.boost - x.boost || x.uid - y.uid);
  const counts = new Map();
  for (const p of petsArr) if (p && p.golden !== true && PET_BY_ID.has(p.id)) counts.set(p.id, (counts.get(p.id) || 0) + 1);
  const goldenReady = PETS.filter((p) => (counts.get(p.id) || 0) >= GOLDEN_COPIES).map((p) => ({ petId: p.id, name: p.name, have: counts.get(p.id) }));

  const style = STYLES.map((s) => {
    const owned = styleOwned(save, s.key);
    return { key: s.key, kind: s.kind, id: s.id, name: s.name, cost: s.cost, owned, equipped: styleEquipped(save, s.key), affordable: !owned && afford(s.cost), need: owned ? 0 : need(s.cost) };
  });

  const view = {
    bolts: b,
    rebirths: rb,
    mult: totalMult(save),
    upgrades,
    build,
    pets: {
      eggs,
      inventory,
      slots: petSlots(save),
      equippedCount: eqArr.length,
      invCount: petsArr.length,
      invMax: INV_MAX,
      goldenReady,
      index: PETS.map((p) => ({ id: p.id, name: p.name, rarity: p.rarity, egg: p.egg, found: indexSet.has(p.id) })),
    },
    style,
    drones: Array.isArray(extras && extras.drones) ? extras.drones : [],
    rebirth: {
      can: canRebirth(save),
      rebirths: rb,
      mult: rebirthMult(save),
      slots: petSlots(save),
      nextMult: 1 + REBIRTH_BONUS * Math.min(MAX_REBIRTHS, rb + 1),
      nextSlots: Math.min(MAX_SLOTS, BASE_SLOTS + rb + 1),
      buildsDone: done,
      buildsTotal: BUILDS.length,
      keeps: REBIRTH_KEEPS.slice(),
      resets: REBIRTH_RESETS.slice(),
    },
  };
  if (extras && typeof extras.tab === 'string') view.tab = extras.tab;
  return view;
}

export function upgradeEffectText(id, level) {
  switch (id) {
    case 'forge': return `+${20 * level}% bolts`;
    case 'belt': return `+${15 * level}% belt speed`;
    case 'magnet': return `${10 * level}% bolt bag chance`;
    case 'battery': return `+${3 * level}s overclock`;
    case 'combo': return `Combo up to +${50 + 10 * level}%`;
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// Save migration & sanitising
// ---------------------------------------------------------------------------

/**
 * Fills defaults for and sanitises every economy field of `save` (in place; returns it).
 * Saves without `econVersion` are migrated from the old cosmetics: owned.goldBelts -> belt:gold,
 * owned.rainbowTrails -> trail:rainbow (equipped if they were), owned.cyberCat -> an equipped
 * Cyber-Cat pet. Safe to call on hostile input and idempotent on its own output.
 */
export function migrateEconomy(save) {
  if (!isObj(save)) return save;
  const migrate = save.econVersion !== ECON_VERSION;

  // upgrades
  const up = {};
  for (const u of UPGRADES) up[u.id] = int(own(save.upgrades, u.id), 0, 0, u.max);
  save.upgrades = up;

  save.builds = int(save.builds, 0, 0, BUILDS.length);
  save.rebirths = int(save.rebirths, 0, 0, MAX_REBIRTHS);

  // pets
  let pets = [];
  const seen = new Set();
  let dup = false;
  if (Array.isArray(save.pets)) {
    for (const p of save.pets) {
      if (pets.length >= INV_MAX) break;
      if (!isObj(p)) continue;
      const id = own(p, 'id');
      const uid = own(p, 'uid');
      if (typeof id !== 'string' || !PET_BY_ID.has(id)) continue;
      if (typeof uid !== 'number' || !Number.isInteger(uid) || uid < 1 || uid > MAX_UID) continue;
      if (seen.has(uid)) dup = true;
      seen.add(uid);
      pets.push({ uid, id, golden: own(p, 'golden') === true });
    }
  }
  let rawEq = Array.isArray(save.petsEquipped) ? save.petsEquipped : [];
  const maxUid = pets.reduce((m, p) => Math.max(m, p.uid), 0);
  let next = Math.max(int(save.nextPetUid, 1, 1, MAX_UID), Math.min(MAX_UID, maxUid + 1));
  if (dup || maxUid >= MAX_UID || next >= MAX_UID) {
    // Renumber densely 1..n so uids are unique and new pets always get a free uid. An equipped
    // uid maps to the first pet that held it.
    const map = new Map();
    pets = pets.map((p, i) => {
      if (!map.has(p.uid)) map.set(p.uid, i + 1);
      return { uid: i + 1, id: p.id, golden: p.golden };
    });
    rawEq = rawEq.map((u) => map.get(u));
    seen.clear();
    for (const p of pets) seen.add(p.uid);
    next = pets.length + 1;
  }
  save.pets = pets;
  save.nextPetUid = next;

  const slots = petSlots(save);
  const eq = [];
  for (const u of rawEq) {
    if (eq.length >= slots) break;
    if (seen.has(u) && !eq.includes(u)) eq.push(u);
  }
  save.petsEquipped = eq;

  const idx = [];
  if (Array.isArray(save.petIndex)) {
    for (const id of save.petIndex) if (typeof id === 'string' && PET_BY_ID.has(id) && !idx.includes(id)) idx.push(id);
  }
  for (const p of pets) if (!idx.includes(p.id)) idx.push(p.id);
  save.petIndex = idx;

  // styles
  const rawStyles = isObj(save.styles) ? save.styles : {};
  const owned = [];
  const rawOwned = own(rawStyles, 'owned');
  if (Array.isArray(rawOwned)) {
    for (const k of rawOwned) {
      const s = typeof k === 'string' ? STYLE_BY_KEY.get(k) : null;
      if (s && s.cost > 0 && !owned.includes(k)) owned.push(k);
    }
  }
  const styles = { owned };
  for (const kind of STYLE_KINDS) {
    const v = own(rawStyles, kind);
    const key = `${kind}:${v}`;
    styles[kind] = typeof v === 'string' && STYLE_BY_KEY.has(key) && (STYLE_BY_KEY.get(key).cost === 0 || owned.includes(key)) ? v : STYLE_DEFAULTS[kind];
  }
  save.styles = styles;

  // daily
  const d = isObj(save.daily) ? save.daily : {};
  const last = isDateStr(own(d, 'last')) ? d.last : null;
  save.daily = { last, streak: last ? int(own(d, 'streak'), 0, 0, 7) : 0 };

  // stats
  const st = isObj(save.stats) ? save.stats : {};
  const tb = own(st, 'totalBolts');
  save.stats = { totalBolts: typeof tb === 'number' && Number.isFinite(tb) && tb > 0 ? Math.min(MAX_BOLTS, Math.floor(tb)) : 0 };

  if (migrate) migrateOldCosmetics(save);
  save.econVersion = ECON_VERSION;
  return save;
}

function migrateOldCosmetics(save) {
  const owned = isObj(save.owned) ? save.owned : {};
  const equipped = isObj(save.equipped) ? save.equipped : {};
  const has = (k) => own(owned, k) === true;
  const on = (k) => has(k) && own(equipped, k) === true;
  if (has('goldBelts') && !save.styles.owned.includes('belt:gold')) save.styles.owned.push('belt:gold');
  if (on('goldBelts')) save.styles.belt = 'gold';
  if (has('rainbowTrails') && !save.styles.owned.includes('trail:rainbow')) save.styles.owned.push('trail:rainbow');
  if (on('rainbowTrails')) save.styles.trail = 'rainbow';
  if (has('cyberCat') && !save.pets.some((p) => p.id === 'cyberCat') && save.pets.length < INV_MAX) {
    const free = peekUid(save);
    if (free === null) return;
    const uid = takeUid(save, free);
    save.pets.push({ uid, id: 'cyberCat', golden: false });
    if (save.petsEquipped.length < petSlots(save) && !save.petsEquipped.includes(uid)) save.petsEquipped.push(uid);
    if (!save.petIndex.includes('cyberCat')) save.petIndex.push('cyberCat');
  }
}
