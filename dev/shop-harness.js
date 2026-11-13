import { Shop } from '../src/ui/shop.js';
import { DailyChest } from '../src/ui/daily.js';
const root = document.getElementById('ui');
const synth = new Proxy({}, { get: (_, k) => (...a) => { (window.__snd ||= []).push(k); } });
const shop = new Shop(root, { synth });
const daily = new DailyChest(root, { synth, hatch: shop.hatch });
const R = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const pets = ['bolt-bot', 'cat', 'drone-pup', 'gear-gator', 'owl', 'fox', 'robo-rex', 'phoenix', 'dragon', 'unicorn', 'bee', 'crab', 'ghost', 'ufo', 'star'];
const mk = (i) => ({ id: pets[i], name: pets[i].replace(/-/g, ' '), rarity: R[Math.min(4, Math.floor(i / 3))] });
const odds = (n) => [0, 1, 2].map((k) => ({ petId: pets[n + k], name: pets[n + k], rarity: R[Math.min(4, k + n / 3)], chance: [0.7, 0.25, 0.05][k], boost: 0.05 * (k + 1) * (n + 1) }));
const S = {
  bolts: 5400, rebirths: 1, mult: 1.5, can: false, golden: true, full: false,
  ups: [
    { id: 'forge', name: 'Bolt Forge', desc: 'More bolts per order', level: 3, max: 10, cost: 800, effectText: '+30%', nextEffectText: '+40%' },
    { id: 'belt', name: 'Fast Belt', desc: 'Orders arrive faster', level: 5, max: 10, cost: 9000, effectText: '-25% wait', nextEffectText: '-30% wait' },
    { id: 'magnet', name: 'Magnet', desc: 'Drops pull in', level: 10, max: 10, cost: null, effectText: '+100%', nextEffectText: '' },
    { id: 'battery', name: 'Battery', desc: 'Drones last longer', level: 0, max: 5, cost: 1200000, effectText: 'none', nextEffectText: '+10%' },
  ],
};
function view() {
  const b = S.bolts;
  const inv = [];
  for (let i = 0; i < (S.full ? 60 : 13); i++) inv.push({ uid: i + 1, ...mk(i % 15), golden: i === 4, boost: 0.04 * (1 + i % 7), equipped: i < 3, sellValue: 100 * (i + 1) });
  return {
    bolts: b, rebirths: 1, mult: 1.5,
    upgrades: S.ups.map((u) => ({ ...u, affordable: u.cost != null && b >= u.cost })),
    build: { done: 3, total: 6, items: ['Lamp', 'Crane', 'Vent', 'Tower', 'Dome', 'Reactor'].map((n, i) => ({ id: 'b' + i, name: n, cost: 500 * Math.pow(6, i), flat: 5 * (i + 1), state: i < 3 ? 'owned' : i === 3 ? 'next' : 'locked', affordable: i === 3 && b >= 500 * 216 })) },
    pets: {
      eggs: [
        { id: 'basic', name: 'Basic Egg', cost: 500, unlocked: true, affordable: b >= 500, odds: odds(0) },
        { id: 'neon', name: 'Neon Egg', cost: 20000, unlocked: true, affordable: b >= 20000, odds: odds(3) },
        { id: 'galaxy', name: 'Galaxy Egg', cost: 1500000, unlocked: false, unlockText: 'Reach level 20', affordable: false, odds: odds(6) },
      ],
      inventory: inv, slots: 4, equippedCount: 3, invCount: inv.length, invMax: 60,
      goldenReady: S.golden ? [{ petId: 'cat', name: 'cat', have: 5 }] : [],
      index: pets.map((p, i) => ({ ...mk(i), egg: 'basic', found: i < 9 })),
    },
    style: [
      { key: 'belt:gold', kind: 'belt', id: 'gold', name: 'Gold Belt', cost: 0, owned: true, equipped: true, affordable: true },
      { key: 'belt:neon', kind: 'belt', id: 'neon', name: 'Neon Belt', cost: 3000, owned: false, equipped: false, affordable: true },
      { key: 'belt:magma', kind: 'belt', id: 'magma', name: 'Magma Belt', cost: 900000, owned: false, equipped: false, affordable: false },
      { key: 'trail:rainbow', kind: 'trail', id: 'rainbow', name: 'Rainbow', cost: 100, owned: true, equipped: false, affordable: true },
      { key: 'theme:space', kind: 'theme', id: 'space', name: 'Space', cost: 4000, owned: false, equipped: false, affordable: true },
    ],
    drones: [
      { id: 'drone1', name: 'Helper x1', desc: 'Delivers for you', cost: 2000, kind: 'drone', owned: true, equipped: true, locked: false },
      { id: 'drone2', name: 'Helper x2', desc: 'Twice as fast', cost: 9000, kind: 'drone', owned: false, equipped: false, locked: false },
      { id: 'drone3', name: 'Helper x3', desc: 'Triple', cost: 99000, kind: 'drone', owned: false, equipped: false, locked: true, lockReason: 'Master the 7s' },
    ],
    rebirth: { can: S.can, rebirths: 1, nextMult: 2, nextSlots: 5, buildsDone: S.can ? 6 : 3, buildsTotal: 6, keeps: ['Pets', 'Skins', 'Mastery'], resets: ['Bolts', 'Upgrades', 'Factory builds'] },
  };
}
const log = [];
window.__log = log;
function act(a) {
  log.push(a);
  if (a.type === 'upgrade') { const u = S.ups.find((x) => x.id === a.id); if (S.bolts < u.cost) return { ok: false, reason: 'poor' }; S.bolts -= u.cost; u.level++; }
  if (a.type === 'hatch') { if (S.full) return { ok: false, reason: 'full' }; S.bolts -= 500; const i = a.egg === 'basic' ? 0 : a.egg === 'neon' ? 7 : 13; return { ok: true, pet: { ...mk(i), golden: false, boost: 0.5, isNew: true } }; }
  if (a.type === 'rebirth') { S.can = false; }
  shop.refresh(view());
  return { ok: true };
}
window.daily = daily; window.shop = shop; window.S = S; window.view = view; window.act = act;
const bar = document.getElementById('bar');
const btn = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.onclick = f; bar.appendChild(b); };
btn('Open', () => shop.open(view(), act));
for (const t of ['upgrades', 'build', 'pets', 'style', 'drones', 'rebirth']) btn(t, () => shop.open({ ...view(), tab: t }, act));
btn('Poor', () => { S.bolts = 3; shop.refresh(view()); });
btn('Rich', () => { S.bolts = 5e7; shop.refresh(view()); });
btn('Full inv', () => { S.full = !S.full; shop.refresh(view()); });
btn('Can rebirth', () => { S.can = !S.can; shop.refresh(view()); });
const hp = (r, g) => () => shop.hatch.play({ ...mk(r), golden: !!g, boost: 0.8, isNew: true }, { egg: 'neon' });
btn('Hatch common', hp(0)); btn('Hatch epic', hp(10)); btn('Hatch legend', hp(13, 1));
const dd = (day, claimable) => () => daily.show({ day, streak: day, rewards: [1, 2, 3, 4, 5, 6, 7].map((d) => d === 7 ? { day: d, egg: 'neon' } : { day: d, bolts: 100 * d }), claimable }, () => ({ ok: true, bolts: 100 * day }));
btn('Daily 3', dd(3, true)); btn('Daily wait', dd(3, false)); btn('Daily 7 egg', () => daily.show({ day: 7, streak: 7, rewards: [1, 2, 3, 4, 5, 6, 7].map((d) => d === 7 ? { day: d, egg: 'neon' } : { day: d, bolts: 100 * d }), claimable: true }, () => ({ ok: true, pet: { ...mk(13), golden: false, boost: 1, isNew: false } })));
shop.open(view(), act);
