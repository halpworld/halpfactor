# Shop & progression redesign (tycoon style)

Audience: an 8-year-old who plays Roblox tycoons / simulators. He expects:
**upgrades with levels**, a factory that **visibly grows** as you buy things, **pets from eggs** with
rarities and boosts, **rebirth** for a permanent multiplier, a **daily reward**, big numbers (1.2K, 3.4M),
and always a clear **next thing to save up for**.

Hard rule: **every bolt is earned by solving math.** No idle income, no real money, nothing to buy
with anything but in-game bolts. Eggs show their odds on the egg card.

---------------------------------------------------------------------------------------------------

## 1. Payout per delivered order (economy.js `orderPayout`)

```
base   = 10 + round(target / 6)                 // bigger products pay more (10..34)
base  += buildFlat(save)                          // sum of `flat` for every Build item owned
mult   = 1
mult  *= isPractice ? 1.5 : 1                     // practice orders are labelled "BOSS ORDER"
mult  *= critical   ? 1.5 : 1                     // < 3 s, first try (existing rule)
mult  *= 1 + comboBonus(streak, save)             // +10% per consecutive first-try order, cap 50% (+10%/Combo Chip lvl)
mult  *= overclocked ? 2 : 1
mult  *= 1 + 0.20 * upgrades.forge
mult  *= 1 + petBoost(save)                        // sum of equipped pet boosts
mult  *= rebirthMult(save)                         // 1 + 0.5 * rebirths
payout = max(1, round(base * mult))
```

`streak` = consecutive orders whose calibration was correct on the first try (auto/tutorial orders do
not break or extend it). A wrong first answer resets it to 0. Not persisted.

## 2. Upgrades tab (levelled; kept until rebirth)

cost(level) = round(baseCost * 1.6^level), where level = current level (0-based).

| id | name | effect per level | max | baseCost |
|---|---|---|---|---|
| forge   | Forge Power       | +20% bolts per order                          | 10 | 40 |
| belt    | Turbo Belts       | belt speed +15%                               | 5  | 30 |
| magnet  | Bolt Magnet       | +10% chance a golden bolt bag pops out of a delivery; tap it (4 s) for +50% of that order's payout | 5 | 60 |
| battery | Overclock Battery | overclock lasts +3 s                           | 4  | 80 |
| combo   | Combo Chip        | combo cap +10%                                 | 5  | 100 |

## 3. Build tab (sequential — you must buy them in order; kept until rebirth)

Each item appears in the factory scene when bought and adds a flat bonus to every order's base.

| # | id | name | cost | flat |
|---|---|---|---|---|
| 1 | sign      | Neon Sign         | 25    | +2  |
| 2 | lights    | Party Lights      | 60    | +3  |
| 3 | arm       | Robot Arm         | 120   | +4  |
| 4 | steam     | Steam Generator   | 250   | +6  |
| 5 | belt2     | Second Belt Line  | 450   | +8  |
| 6 | lift      | Hover-Lift        | 800   | +11 |
| 7 | reactor   | Plasma Reactor    | 2000  | +15 |
| 8 | trophies  | Trophy Wall       | 4500  | +20 |
| 9 | rocket    | Rocket Pad        | 8000  | +28 |
| 10| statue    | Golden Robot Statue | 16000 | +40 |

Build costs scale with rebirths: round(cost × (1 + 0.5·rebirths)). (Payouts scale faster via the rebirth multiplier
and pets, so later loops are still a bit quicker.)

## 4. Pets tab

Eggs (bought with bolts, odds printed on the card):

| id | name | cost | unlock |
|---|---|---|---|
| basic  | Robo Egg   | 60   | always |
| neon   | Neon Egg   | 600  | Build item #5 owned, or ≥ 1 rebirth |
| galaxy | Galaxy Egg | 2500 | ≥ 1 rebirth |

Each egg has 5 pets, one per rarity. Odds for every egg: Common 60 / Uncommon 25 / Rare 10 / Epic 4 / Legendary 1.

| egg | Common | Uncommon | Rare | Epic | Legendary |
|---|---|---|---|---|---|
| basic  | Bolt Bug    | Gear Pup      | Spark Mouse | Turbo Turtle   | Cyber-Cat |
| neon   | Neon Slime  | Magnet Monkey | Laser Fox   | Robo Owl       | Plasma Dragon |
| galaxy | Star Blob   | Comet Bunny   | Orbit Octo  | Nebula Narwhal | Galaxy Phoenix |

Boost (bolt multiplier, additive with other pets): Common 5%, Uncommon 10%, Rare 20%, Epic 40%,
Legendary 80% — ×2 for neon-egg pets, ×4 for galaxy-egg pets.
**Golden** pets: 5 identical normal pets → 1 golden (×3 boost of the normal one). Golden is a flag on the pet.

- Equip slots: 3, +1 per rebirth, max 6. Equipped pets float around the factory.
- Inventory cap 60. Hatching with a full inventory is refused with a toast.
- Sell: refunds 20% of the egg cost (golden: 5× that). Equipped pets can't be sold.
- "Equip best" button.
- Pet Index: 15 slots; undiscovered ones show as "?" silhouettes. Discovered = ever hatched.

## 5. Style tab (permanent — kept through rebirth)

| kind | id | name | cost |
|---|---|---|---|
| belt  | steel | Steel (default) | 0 |
| belt  | gold  | Golden Belts | 150 |
| belt  | candy | Candy Stripe | 400 |
| belt  | lava  | Lava Belts   | 900 |
| trail | none  | No Trail (default) | 0 |
| trail | rainbow | Rainbow Trails | 250 |
| trail | sparkle | Star Sparkle | 500 |
| trail | fire  | Fire Trail | 1000 |
| theme | neon  | Neon Lab (default) | 0 |
| theme | lava  | Lava Forge   | 1500 |
| theme | ice   | Ice Station  | 2500 |
| theme | candy | Candy Factory | 4000 |
| theme | space | Deep Space   | 6000 |

One of each kind is equipped. Style ids are written `kind:id` (e.g. `belt:gold`).

## 6. Drones tab — unchanged behaviour (existing drone rules, mastery gate, equip toggle).

## 7. Rebirth tab

- Available when all 10 Build items are owned.
- Resets: bolts → 0, upgrades → 0, builds → 0.
- Keeps: pets, styles, drones, mastery, level, settings, daily streak.
- Gives: rebirths +1 → permanent ×(1 + 0.5·rebirths) bolts, +1 pet slot (max 6), a star badge in the
  HUD, unlocks the Galaxy Egg at rebirth 1.
- Requires a confirm dialog that lists what is kept and what resets, in kid words.

## 8. Daily chest

Local calendar date (YYYY-MM-DD from the device clock). Claim once per day. If the last claim was
yesterday, streak +1 (wraps after day 7 back to day 1); otherwise streak = 1.
Rewards by day: 50, 75, 100, 150, 200, 300, **free Robo Egg hatch** (day 7; Neon Egg if unlocked).
Bolt rewards are × rebirthMult. Shown as a popup on game start (after tutorial is done) when
claimable; also reachable from a chest button in the HUD that glows when claimable.

## 9. HUD

- Bolt counter uses `formatBolts` (src/core/format.js).
- "Next goal" bar under the bolt counter: label + progress (bolts / cost, capped 1) of the cheapest
  item not yet owned among {next Build item, next level of each upgrade, next unlocked egg}. Ties: Build
  first. When ≥ 1, it pulses "READY!". Tapping it opens the shop on that tab.
- Star badge with rebirth count when > 0.
- Daily chest button (glows when claimable).

## 10. Save (save.js — new fields; sanitised on load)

```
upgrades: { forge, belt, magnet, battery, combo }   // ints, clamped to [0, max]
builds: int                                          // count of Build items owned (0..10)
rebirths: int                                        // 0..99
pets: [{ uid: int, id: string, golden: bool }]       // id must be in PETS; ≤ 60; uids unique
petsEquipped: [uid]                                  // ⊆ pets uids, ≤ slots(rebirths)
petIndex: [id]                                       // discovered pet ids
nextPetUid: int
styles: { owned: ['belt:gold', ...], belt: 'steel', trail: 'none', theme: 'neon' }  // equipped must be owned or default
daily: { last: 'YYYY-MM-DD' | null, streak: 0..7 }
stats.totalBolts: number                              // lifetime earned
```

Migration from the old save: `owned.goldBelts` → `styles.owned` has `belt:gold` (equipped if it was
enabled); `owned.rainbowTrails` → `trail:rainbow` (equipped if enabled); `owned.cyberCat` → a Cyber-Cat
pet in `pets`, equipped, in `petIndex`. Old drone fields unchanged. Unknown ids are dropped.

## 11. Module contract

### `src/game/economy.js` (Engine; pure, no DOM, unit-tested)
Exports catalogs `UPGRADES`, `BUILDS`, `EGGS`, `PETS`, `RARITIES`, `STYLES`, and pure functions:
`upgradeCost(id, lvl)`, `buildCost(index, rebirths)`, `petBoost(save)`, `rebirthMult(save)`,
`petSlots(save)`, `orderPayout(save, order)`, `rollEgg(eggId, rng)`, `canRebirth(save)`,
`applyRebirth(save)`, `dailyStatus(save, todayStr)`, `claimDaily(save, todayStr)`,
`nextGoal(save)`, `shopView(save, extras)`, and mutation helpers that take the save and return
`{ ok, reason?, ... }`: `buyUpgrade`, `buyBuild`, `hatchEgg(save, eggId, rng)` → `{ ok, pet }`,
`equipPet`, `unequipPet`, `equipBest`, `sellPet`, `makeGolden(save, petId)`, `buyStyle`, `equipStyle`.

### `src/render/pets.js` (Engine)
`drawPet(ctx, petId, x, y, size, t, golden = false)` — procedural, centred at (x, y), `size` = height in px,
`t` = seconds for idle animation. Must work on any 2D context (the UI draws portraits on small canvases).
`PET_COLORS[petId]` → main colour (for UI accents).

### Shop view model (Engine builds it with `shopView`, UI renders it, UI never computes prices)
```
{
  bolts, rebirths, mult, tab?,                 // tab: tab to open on
  upgrades: [{ id, name, desc, level, max, cost|null, effectText, nextEffectText, affordable }],
  build:    { items: [{ id, name, cost, flat, state: 'owned'|'next'|'locked', affordable }], done, total },
  pets: {
    eggs: [{ id, name, cost, unlocked, unlockText, affordable, odds: [{ petId, name, rarity, chance, boost }] }],
    inventory: [{ uid, id, name, rarity, golden, boost, equipped, sellValue }],
    slots, equippedCount, invCount, invMax,
    goldenReady: [{ petId, name, have }],      // pets with ≥5 normal copies
    index: [{ id, name, rarity, egg, found }],
  },
  style: [{ key: 'belt:gold', kind, id, name, cost, owned, equipped, affordable }],
  drones: [ ...existing drone item objects... ],
  rebirth: { can, rebirths, mult, slots, nextMult, nextSlots, buildsDone, buildsTotal, keeps: [..], resets: [..] },
}
```
`rebirth.mult` / `rebirth.nextMult` are the rebirth-only multiplier now / after the next rebirth
(not `view.mult`, which is the total). Show `rebirth.mult ➜ rebirth.nextMult`, and promise a new pet
slot only when `rebirth.nextSlots > rebirth.slots` (slots are capped).

### UI facade additions (`src/ui/ui.js`)
- `openShop(view, onAction)`, `refreshShop(view)` (keeps current tab/scroll), `closeShop()`.
- `onAction(action)` is synchronous and returns `{ ok, reason?, pet? }`. Actions:
  `{type:'upgrade', id}`, `{type:'build', id}`, `{type:'hatch', egg}`, `{type:'equipPet', uid}`,
  `{type:'unequipPet', uid}`, `{type:'equipBest'}`, `{type:'sellPet', uid}`, `{type:'golden', petId}`,
  `{type:'style', key, action:'buy'|'equip'}`, `{type:'drone', id, action}` (existing semantics),
  `{type:'rebirth'}` (only sent after the UI confirm dialog).
  After a successful action the engine calls `refreshShop(view)`.
- Hatch flow: UI sends `hatch`, gets `{ok, pet:{id,name,rarity,golden,boost,isNew}}`, then plays the egg
  animation (wobble → crack → reveal with rarity colour, "NEW!" tag) over the shop. Legendary gets extra
  fanfare. Tap to continue.
- `showDailyReward({ day, streak, rewards:[{day, bolts|egg}], claimable }, onClaim)` → onClaim returns
  `{ ok, bolts?, pet? }`.
- `setHud({... , boltsText, goal: {label, cost, progress, tab} | null, rebirths, dailyReady })`.
- Events: `ui:openShop` payload may be `{ tab }`; new `ui:openDaily`.

### Shop UI (UI; `src/ui/shop.js` and helpers)
Tabs across the top with icons: **Upgrades · Build · Pets · Style · Drones · Rebirth**. Badge dot on a
tab with something affordable. Big chunky buttons (≥ 64 px), bright rarity colours
(Common grey, Uncommon green, Rare blue, Epic purple, Legendary gold with shimmer). Every price uses
`formatBolts`. Not affordable → button shows "Need 120 more". Everything reacts on pointerdown via the
existing helpers; no text inputs (never summon the keyboard).

## 12. Balance targets (verified by tests/economy.test.mjs simulation)

Simulate a player who answers 80% first-try, 20% critical, 15% overclocked, mean target 30, and greedily
buys the cheapest goal. Assert:
- first purchase by order 3;
- a purchase at least every 5 orders through the first 60 orders;
- first egg by order 15;
- first rebirth between order 80 and 220;
- second rebirth faster than the first.
