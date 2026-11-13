// Balance simulation shared by tests/economy.test.mjs (spec section 12). Not a test file itself.
import * as E from '../src/game/economy.js';
import { mulberry32 } from '../src/render/util.js';

/**
 * Player: 80% first-try, 20% critical, 15% overclocked, target = a*b with a,b in 1..10 (mean ~30),
 * always taps the golden bolt bag, greedily buys nextGoal() whenever affordable, equips best pets.
 */
export function simulate(seed, maxOrders = 600) {
  const rng = mulberry32(seed);
  const save = E.migrateEconomy({ bolts: 0 });
  let streak = 0;
  const out = { purchases: [], firstPurchase: null, firstEgg: null, rebirths: [], gaps: [] };
  for (let n = 1; n <= maxOrders; n++) {
    const firstTry = rng() < 0.8;
    const critical = firstTry && rng() < 0.25;
    const overclocked = rng() < 0.15;
    const a = 1 + Math.floor(rng() * 10);
    const b = 1 + Math.floor(rng() * 10);
    streak = firstTry ? streak + 1 : 0;
    const pay = E.orderPayout(save, { target: a * b, critical, overclocked, streak, isPractice: false });
    E.earnBolts(save, pay);
    if (rng() < E.magnetChance(save)) E.earnBolts(save, E.magnetReward(pay));
    for (let guard = 0; guard < 30; guard++) {
      const g = E.nextGoal(save);
      if (!g || save.bolts < g.cost) break;
      let r;
      if (g.kind === 'build') r = E.buyBuild(save, g.id);
      else if (g.kind === 'upgrade') r = E.buyUpgrade(save, g.id);
      else if (g.kind === 'egg') {
        r = E.hatchEgg(save, g.id, rng);
        if (r.ok) {
          E.equipBest(save);
          if (out.firstEgg === null) out.firstEgg = n;
        }
      } else if (g.kind === 'rebirth') {
        r = E.applyRebirth(save);
        if (r.ok) out.rebirths.push(n);
      }
      if (!r || !r.ok) break;
      if (g.kind !== 'rebirth') {
        if (out.firstPurchase === null) out.firstPurchase = n;
        out.purchases.push(n);
      }
    }
    if (out.rebirths.length >= 2) break;
  }
  // Longest gap between purchases (orders without buying anything) through order 60.
  let prev = 0;
  let maxGap = 0;
  for (const p of out.purchases.filter((x) => x <= 60).concat([61])) {
    maxGap = Math.max(maxGap, p - prev);
    prev = p;
  }
  out.maxGap60 = maxGap;
  out.save = save;
  return out;
}
