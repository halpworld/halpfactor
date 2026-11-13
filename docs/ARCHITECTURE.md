# Robo-Factor: Overclocked — Architecture & Module Contracts

This file is the binding contract between modules. If you need to change a public API
listed here, do not silently change it: report it to the team lead.

## Ground rules

- **Zero dependencies, zero build step, zero CDN.** Plain ES2020 modules loaded by
  `index.html` via `<script type="module" src="src/main.js">`. Everything must work offline
  once cached by the service worker. No external fonts.
- Target: iPad Safari (iPadOS 16+), landscape. Also must run in desktop Chrome/Safari for dev.
- Rendering: **Canvas2D** with additive glow sprites, pre-rendered gradients, scanline/vignette
  overlay, screen shake. Keep per-frame allocations low; no `shadowBlur` in hot loops (pre-render
  glow into offscreen canvases instead).
- **Never** create `<input>`, `<textarea>`, `contenteditable` or anything that can summon the iOS
  keyboard. All number entry goes through the custom keypad.
- All touch handling via Pointer Events. Buttons react on `pointerdown` (not `click`) — with one
  exception: controls inside scrollable drawers (Shop, Foreman's Log) act on a short **tap**
  (`pointerup` on the same pointer after < 12 px of movement, `onTap` in `src/ui/dom.js`) so that
  scrolling a drawer with a finger that lands on a button never triggers it. Everything else
  (keypad, prompt buttons, HUD buttons, drawer close buttons) uses `pointerdown` (`onPress`).
- Persist only to `localStorage`, always inside try/catch (private mode can throw). The game
  must run (without persistence) if storage is unavailable.
- Never use `innerHTML` with non-constant strings; build DOM with `textContent`/`createElement`.
- Serve locally with: `python3 -m http.server 8173` from the repo root, open http://localhost:8173

## Shared files (already written by the lead — do not change their exports)

- `src/core/events.js` — `Emitter` class and shared `bus` singleton.
- `src/core/theme.js` — `COLORS`, `FONT`, `WORLD` (logical size 1366×1024).
- `index.html` — shell: `<canvas id="game">`, `<div id="ui">`, links `css/ui.css`, loads `src/main.js`.

## Logical coordinate system

The game world is a fixed logical canvas `WORLD.W = 1366`, `WORLD.H = 1024`, scaled uniformly to
fit the viewport (letterboxed with the background colour). The renderer exposes
`worldToScreen(x, y)` / `screenToWorld(x, y)` (screen = CSS pixels of the viewport).
The DOM overlay `#ui` covers the full viewport (CSS pixels), above the canvas.

World layout (logical px):
- HUD strip (DOM, drawn by UI): top 0..84.
- Raw Material Dispensers: left, x ≈ 24..250, 12 crates in 2 columns × 6 rows (values 1..12).
- Multiplier Forges: centre, x ≈ 320..940, 4 columns × 3 rows labelled ×1..×12.
- Loading Dock + Boss Robot: right, x ≈ 990..1366.
- Factory floor strip for the Cyber-Cat: bottom y ≈ 930..1010.

---

## Module: Audio — `src/audio.js` (owner: Systems)

```js
export class Synth {
  constructor()
  unlock()              // call from inside a user gesture (pointerdown). Creates/resumes the
                        // AudioContext. Idempotent. Also call on visibilitychange→visible.
  suspend()             // page hidden
  get sfxOn(); setSfx(on)
  get ambientOn(); setAmbient(on)   // toggleable synth-wave factory hum (pads + soft pulse)
  click()               // tactile UI button click
  keyTap(digit)         // keypad key; pitch varies slightly by digit 0..9
  backspace()
  hiss()                // hydraulic hiss: belt wired / machine placed
  correct(streak = 0)   // ascending arpeggio, brighter with streak (0..5)
  wrong()               // gentle "bonk" buzzer — never harsh/scary (8-year-old audience)
  jam()                 // steam-vent burst + low buzz
  smoke()               // comical sputter/pop
  surgeStart()          // rising whoosh + sparkle
  surgeEnd()
  tick(urgent=false)    // countdown tick
  coin()                // single gold-bolt blip (rate-limit internally)
  deliver()             // item thunks into the cargo hatch (rate-limit internally)
  bossArrive()          // servo/robot motif
  bossHappy()           // happy robot chirp
  levelUp()
  purchase()
  uiOpen(); uiClose()
  meow()                // robo-cat electronic meow
}
```
Every method must be safe to call at any time (before unlock, while muted, rapidly): never throw,
never stack unbounded voices. Master compressor/limiter on the output.

## Module: Save — `src/core/save.js` (owner: Systems)

```js
export const SAVE_KEY = 'robofactor.save.v1';
export function defaultSave()  // returns a fresh object:
// { version:1, bolts:0, level:1, ordersCompleted:0, streak:0, tutorialDone:false,
//   // economy fields (shape owned by src/game/economy.js, see docs/SHOP_DESIGN.md):
//   upgrades:{...all 0}, builds:0, rebirths:0, pets:[], nextPetUid:1, petsEquipped:[], petIndex:[],
//   styles:{ owned:[], belt:'steel', trail:'none', theme:'neon' }, daily:{ last:null, streak:0 },
//   stats:{ totalBolts:0 }, econVersion:1,
//   drones:  { },                  // e.g. { "2": true, "5": true } — tables with an Auto-Drone (owned)
//   dronesEquipped: { },           // e.g. { "2": true } — owned drones currently switched on.
//                                  // Missing in old saves → every owned drone is on. Only owned
//                                  // drones can be on (sanitised on load).
//   settings:{ autoCurriculum:true, enabledTables:DEFAULT_TABLES, sfx:true, ambient:true } }
export function loadSave(storage = safeLocalStorage())  // validates & merges with defaults; never throws
export function writeSave(save, storage = safeLocalStorage())  // never throws
export function safeLocalStorage()  // returns localStorage or an in-memory shim if unavailable
```
`loadSave` must sanitise everything (types, ranges, table numbers 1..12, bolts finite 0..1e15).
Economy fields are sanitised by `migrateEconomy` (src/game/economy.js), run on every load. The old
`owned`/`equipped` cosmetics (goldBelts / rainbowTrails / cyberCat) are migrated once — only when the
raw save has no `econVersion` — into `styles` (gold belt, rainbow trail) and a Cyber-Cat pet; the
legacy keys are no longer written. The migration is idempotent (a sold cat is never re-added).

## Module: Math engine (owner: Systems)

### `src/math/mastery.js` — pure, no DOM, importable in a Worker and in Node tests
```js
export const ALL_TABLES = [1,2,3,4,5,6,7,8,9,10,11,12];
export const CURRICULUM = [[1,2,5,10],[3],[4],[6],[9],[11],[7],[8],[12]]; // level n unlocks first n groups
export function factKey(a, b)                 // "7x8"
export const DEFAULT_TABLES = [1,2,5,10];     // starting tables AND the one fallback for an empty/invalid list
                                              // (save.js, game.js and foremanLog.js import it)
export const MASTERED_SCORE = 0.95, MASTERED_MS = 2500; // isMastered thresholds (Foreman's Log imports them)
export function unlockedTables(level, settings) // autoCurriculum ? CURRICULUM-based : settings.enabledTables (fallback DEFAULT_TABLES if empty)
export class MasteryTracker {
  constructor(serialized?)                     // tolerant of garbage input; keys normalised ("07x8" → "7x8",
                                              // clash keeps the record with more attempts); a negative /
                                              // NaN avg is treated as unknown (5000 ms), never as 0
  record(a, b, { correct, responseTimeMs, now })
  get(a, b)  // { attempts, correct, avgResponseTimeMs, masteryScore, lastSeen, recentErrors }
  tableMastery(t)                               // 0..1 for table t (facts t×1..t×12, both orders)
  isMastered(a, b)                              // masteryScore >= 0.95 AND avgResponseTimeMs < 2500
  serialize()                                   // plain JSON-able object
}
export function pickFact(tracker, tables, { rng = Math.random, now = Date.now(), recentKeys = [] } = {})
// -> { a, b, isPractice }   a ∈ tables (the "table" factor), b ∈ 1..12, order randomly swapped.
// Weighting: much heavier when avgResponseTimeMs > 4000 or recentErrors > 0, heavier for unseen /
// long-unseen facts (spacing), lighter for mastered facts, and avoids recentKeys.
// isPractice = true when the fact was chosen because it is weak (slow or recent error).
```
`masteryScore` (0..1) formula is the owner's choice but must be documented in the file and:
reach ≥ 0.95 only after ≥ 3 attempts, high accuracy, and a fast average; drop after errors.
`avgResponseTimeMs` is an exponential moving average over recorded attempts.

### `src/math/worker.js` — module Web Worker hosting a MasteryTracker
Messages in: `{type:'init', data}`, `{type:'record', a,b,correct,responseTimeMs,now}`,
`{type:'next', id, kind:'order'|'surge', tables, recentKeys}`, `{type:'snapshot', id}`, `{type:'reset'}`.
Messages out: `{type:'state', data}` (after every record/reset, so main can persist),
`{type:'next', id, a, b, isPractice}`, `{type:'snapshot', id, facts, tableMastery}`.

### `src/math/engine.js` — main-thread facade
```js
export const MASTERY_KEY = 'robofactor.mastery.v1';
export class MathEngine {
  static async create({ storage })   // starts the module worker; if Worker creation fails or does not
                                      // answer within 1500 ms, falls back to an in-thread tracker.
  record(a, b, correct, responseTimeMs)   // fire-and-forget, persisted automatically
  async nextOrder(level, settings)        // -> { a, b, target: a*b, isPractice }
  async nextSurge(level, settings)        // -> { a, b, isPractice }
  async snapshot()   // -> { facts: { [key]: stats }, tableMastery: number[13] } (index 1..12 used)
  tableMasteryCached(t)                   // sync, last known value 0..1
  reset()                                 // wipes mastery (Foreman's Log "reset")
}
```
Tests: `tests/mastery.test.mjs` runnable with `node --test tests/` (Node 18, no deps).

## Module: PWA shell (owner: Systems)
- `manifest.json` (name, short_name "Robo-Factor", display "fullscreen", orientation "landscape",
  background/theme colour from theme, icons 192/512 PNG + maskable).
- `icons/` PNG icons (192, 512, 180 apple-touch-icon) generated by a committed zero-dependency script
  `tools/make-icons.mjs` (Node, writes PNG via zlib) — a stylised neon robot/gear glyph.
- `sw.js` (CACHE_VERSION 'v4'): versioned precache of the full app shell (SHELL lists every file
  under src/, css/, icons/ plus index.html and manifest.json — checked by tests/sw-shell.test.mjs).
  Shell files are served stale-while-revalidate; only SHELL paths are ever cached, under normalised
  keys (navigations to the app root → 'index.html'), and they are always (re)fetched from their
  canonical URL (`new URL(key, <sw dir>)`, cache:'no-cache'), never from the incoming request, so
  a query string can't poison a clean key. Redirected / non-basic / non-200 responses are never
  cached. Offline navigations fall back to the cached index.html. Old caches deleted on activate.
  The app-root key 'index.html' is fetched from the sw directory URL ('./'), not '/index.html', so
  hosts that redirect index.html → / never yield a redirected response; any redirected response that
  would answer a navigation is rebuilt (`unredirect`) because Safari refuses redirected navigation
  responses from a service worker.
- Registration lives in `src/main.js` (owner: Engine) — `navigator.serviceWorker.register('./sw.js')`
  only when `location.protocol` is http(s).

---

## Module: UI — `src/ui/*.js` + `css/ui.css` (owner: UI)

DOM overlays inside `#ui`. Sci-fi chunky look: beveled metal panels, neon edges, glowing digits,
big touch targets (≥ 64 px). All animations CSS transform/opacity only. Everything must be
legible for an 8-year-old (big numbers, few words).

```js
import { UI } from './ui/ui.js';
const ui = new UI(document.getElementById('ui'), { synth, bus });

ui.setHud({ bolts, level, ordersCompleted, overclock:bool, overclockRemainingMs, sfxOn, ambientOn })

// Calibration Lock (Mode 1 ignition). Shows "a × b = ?" + keypad, anchored near `anchor`
// (screen CSS px, may be null → centred). On a wrong entry: wrong() sound, show the Array
// Blueprint for a×b (rows of glowing blocks counting up: 7, 14, 21 …) and keep the lock open
// until the correct product is entered. "Cancel" button allowed.
// autoSolve:true (Auto-Drone): digits type themselves with a drone flourish; resolves ~1.2 s later.
ui.promptCalibration({ a, b, anchor, getAnchor?, autoSolve=false })
  -> Promise<{ cancelled:bool, answered:bool, firstTryCorrect:bool, responseTimeMs:number }>
  // answered = at least one answer was submitted. responseTimeMs = time to FIRST submitted answer
  // (0 when cancelled before any submission — never the time the prompt was open).
  // Game records a cancelled prompt only when answered && !firstTryCorrect (src/game/rules.js).
  // getAnchor (optional, both prompts): () => {x,y} screen px, re-read on resize/rotate.

// Overclock Surge (Mode 2). Urgent red/cyan popup "a × b = ?" with a 4 s countdown ring.
// Correct within the limit → resolves inTime:true. Wrong → emits bus 'ui:surgeWrong' {a,b}
// (game puffs black smoke), shows Array Blueprint, child must enter the right answer to clear the jam.
// Time running out → countdown turns grey ("Clear the jam!"), still requires the answer.
ui.promptSurge({ a, b, timeLimitMs = 4000, anchor, getAnchor? })
  // Both prompts: the clock (surge countdown and responseTimeMs) pauses while the tab is hidden,
  // in portrait, or (defensively) while a drawer is open.
  -> Promise<{ firstTryCorrect:bool, inTime:bool, responseTimeMs:number }>

ui.showToast(text, { kind:'info'|'good'|'warn', ms=1800 })
ui.showLevelUp(level, newTables /* number[] */)       // big celebratory banner, auto-dismisses
ui.showTutorial({ text, target /* {x,y,w,h} screen px | null */, step, total })  // dims everything
ui.hideTutorial()                                       // except a pulsing spotlight on target;
                                                        // must NOT block pointer events on target
ui.openShop(items, bolts, onAction)   // -> bool. Ignored (false) while a prompt is open. side drawer. items: [{ id, name, desc, cost, kind:'cosmetic'|'drone',
                                      //   owned, equipped, locked, lockReason }]
                                      // onAction(id, 'buy'|'equip'|'unequip') ; game calls ui.refreshShop(items, bolts)
                                      // Drones, like cosmetics, show EQUIP/UNEQUIP once owned.
                                      // After a buy/equip/unequip the card ignores taps for 450 ms.
ui.refreshShop(items, bolts)
ui.closeShop()
ui.openForemanLog({ facts, tableMastery, settings, autoTables? }, { onSettingsChange(settings), onReset() })
  // -> bool. Ignored (false) while a prompt is open (the game also re-checks after its async snapshot).
  // autoTables: tables the auto curriculum unlocks at the current level; switching Auto off
  // seeds enabledTables from it (not from the stale saved manual list).
  // 12×12 heatmap: rows/cols 1..12, cell colour dark-red (needs practice) → neon-green (mastered,
  // < 2.5 s); grey = never seen. Tap a cell → detail (attempts, accuracy, avg time).
  // Stage selector: "Auto curriculum" toggle + 12 table toggles. Reset progress (two-step confirm).
ui.isBlocking()   // true while any modal/prompt/drawer is open (game ignores world taps then)
ui.isPromptOpen() // true while a calibration/surge prompt is open
```
HUD (top strip): game logo "ROBO-FACTOR" (long-press 2 s → emits `ui:foremanRequest`;
this is the secret parent entrance — no visible hint beyond a subtle progress ring while held),
gold-bolt counter (animated count-up), level badge, overclock timer bar, Shop button
(`ui:openShop`), SFX toggle (`ui:toggleSfx`), ambient music toggle (`ui:toggleAmbient`).

## Bus events

UI → game: `ui:openShop {tab?}`, `ui:openDaily`, `ui:foremanRequest`, `ui:toggleSfx`, `ui:toggleAmbient`,
`ui:surgeWrong {a,b}`, `ui:calibrationWrong {a,b}`.
Game → anyone: `game:bolts {bolts, delta, x, y}` (x,y screen px where bolts came from, for fly-to-counter).

---

## Module: Engine / World / Rendering — `src/main.js`, `src/game/*.js`, `src/render/*.js` (owner: Engine)

Owns the game loop, world simulation (fixed timestep 1/120 s, rendered every rAF), Canvas2D
renderer, particles, belts, machines, bosses, cat, drones, input on the canvas, and wiring all
modules together in `src/main.js`.

### Gameplay rules (authoritative)

**Boss orders.** A Boss Robot rolls in to the dock (procedural body; name & part type from
lists, e.g. "Captain Sprocket needs 56 Plasma Cores"). Target = a×b from `engine.nextOrder`.
Practice orders (`isPractice`) show a gold "BOSS ORDER ★ +bonus" tag.

**Mode 1 — Blueprint Wiring.** Player picks a dispenser A (tap, or drag from it) then a forge B
(tap, or release over it). A Bézier belt animates in (hiss). Forge → amber; `ui.promptCalibration`.
- Cancelled → belt retracts. Not recorded unless a wrong answer was already submitted.
- Ignited and `A×B === target` → forge green, items flow dispenser→forge→boss (visual count
  ~8–12 items, not literally 56), boss eyes light up / mouth opens per delivery, floating `+56!`,
  bolts awarded via `earnBolts(save, orderPayout(save, {target, isPractice, critical, overclocked,
  streak}))` (src/game/economy.js; floater uses `formatBolts`, plus "COMBO xN" for streaks ≥ 2),
  "CRITICAL EFFICIENCY!" if first try and fast. With the Bolt Magnet upgrade a bolt bag may pop out
  (`magnetChance`); it is tappable for 4 s (hit radius ≥ 60 world px, placed right of the forges so it
  never steals wiring taps) and pays `magnetReward`. Boss leaves happily, next boss arrives.
- Ignited but `A×B !== target` → forge sputters, friendly toast "7 × 6 makes 42 — the boss needs 56!",
  belt fizzles out, retry. After 2 mismatches on one order, gently pulse one valid dispenser as a hint.
- Any factorisation is accepted (24 = 3×8 = 4×6 = 2×12 …).
- Mastery: record the calibration fact (A,B) with firstTryCorrect & responseTimeMs. Not recorded when
  auto-solved by a drone.

**Mode 2 — Overclock Surge.** While a delivery is flowing, roughly every 2–3 orders (and never during
the tutorial) the belt jams red (jam sound) or the boss goes "TURBO MODE". Fact from `engine.nextSurge`;
`ui.promptSurge`. Result: inTime && firstTryCorrect → OVERCLOCK for 12 s (belts neon cyan, sparks,
items 3× speed, 2× bolts, surge sound, screen flash). Otherwise jam clears normally. Record the fact
(only with a real result and responseTimeMs > 0 — `surgeRecord` in src/game/rules.js). A surge due
while a drawer is open is **deferred, never dropped**: `surgeGate` (src/game/rules.js) returns 'hold'
and the delivery freezes at the trigger point (no cargo movement, no finishing) until the drawer
closes, then the surge fires.
`ui:surgeWrong` → black smoke puffs from the machine + `synth.smoke()`.

**Auto-Drones.** If `save.drones[t] && save.dronesEquipped[t]` (owned and switched on — the Shop
offers EQUIP/UNEQUIP for owned drones, and buying one switches it on) and the calibration fact
involves table t, a little drone flies
from the dock to the forge and the calibration runs with `autoSolve:true`. Drones are purchasable only
when `engine.tableMasteryCached(t) >= 0.95`.

**Shop.** Catalogue, prices and rules live in src/game/economy.js (pure, reason codes) — see
docs/SHOP_DESIGN.md. game.js builds the view with `shopView` (+ `drones`, old item shape, id
`drone-<t>`, 120 each, locked until mastery ≥ 95 %) and handles `onAction` synchronously, returning
`{ok, reason?, pet?}`; economy reasons are mapped by `shopReason` (bolts → 'poor'; other codes →
friendly text). After every action it saves, updates the HUD and calls `ui.refreshShop(view)`.
Tabs: upgrades, builds (drawn in free space by src/render/builds.js), pets (eggs/hatch/equip/sell/
golden; equipped pets float over the floor via src/render/pets.js), styles (belt skins steel/gold/
candy/lava, trails none/rainbow/sparkle/fire, themes neon/lava/ice/candy/space via
src/render/themes.js), drones, rebirth. The Cyber-Cat critter walks the floor while the cyberCat pet
is equipped. HUD gets `boltsText`, `goal` (`nextGoal`), `rebirths`, `dailyReady`.

**Daily reward.** After the tutorial, once per session at the 'await' phase, `ui.showDailyReward(
status, onClaim)` is shown if `dailyStatus(...).claimable`; if the UI refuses (prompt open) it is
retried at the next 'await'. `ui:openDaily` opens it on demand. `onClaim` returns
`{ok, day, bolts?, pet?, egg?}`.

**Levels.** Level-up every 5 completed orders (`ui.showLevelUp` with newly unlocked tables if auto
curriculum). Save after every order and every purchase.

**Tutorial (first launch, `!save.tutorialDone`).** Fixed first order 10 (2×5):
1 point at boss "This boss needs 10 parts!" → 2 "Tap the 2 crate" → 3 "Now tap the ×5 forge" →
4 calibration explains "2 × 5 = ? Punch it in!" → 5 "Great! Watch it go!". Then `tutorialDone = true`.

**Lifecycle.** Pause sim + `synth.suspend()` on `visibilitychange` hidden; resume on visible. Handle
resize/orientation. Show a "Rotate your iPad" overlay in portrait. First pointerdown anywhere unlocks audio.

### Visual requirements
Neon cyberpunk factory: deep-navy background with parallax grid, pipes, blinking lights; Bézier belts
with flowing chevrons (golden / rainbow trails when equipped, cyan when overclocked); glowing geometric
items (plasma cubes, laser batteries, quantum gears) that rotate; machines squash-and-stretch per cycle,
spinning gears, steam particles, status light (green running, amber needs calibration, red jammed, cyan
overclocked); expressive multi-part boss robots (eyes light up, mouth opens, cargo hatch), floating
numbers; screen shake; scanline/vignette overlay; particles pooled.
