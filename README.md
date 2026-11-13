<h1 align="center">Halpfactor</h1>

<p align="center">
  <strong>Robo-Factor: Overclocked — a neon robot-factory tycoon where the times tables are the machinery.</strong><br>
  Built for kids who know how tycoon games work: earn bolts, buy upgrades, hatch pets, build out the
  factory, rebirth — and master the 1–12 times tables along the way.
</p>

<p align="center">
  <a href="https://github.com/halpworld/halpfactor/actions/workflows/pages.yml"><img alt="Test and deploy" src="https://github.com/halpworld/halpfactor/actions/workflows/pages.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg"></a>
  <img alt="Platform: iPad / Web (PWA)" src="https://img.shields.io/badge/platform-iPad%20%7C%20Web%20(PWA)-lightgrey">
  <img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen">
</p>

<p align="center">
  <a href="https://halpworld.github.io/halpfactor/"><b>Play in your browser</b></a> ·
  <a href="#how-to-play">How to play</a> ·
  <a href="#the-shop">The shop</a> ·
  <a href="#run-it-locally">Run it locally</a> ·
  <a href="#contributing">Contributing</a>
</p>

## About

Boss robots roll up to your loading dock with orders like *"Captain Sprocket needs 56 Plasma
Cores"*. You wire a raw-material dispenser (1–12) into a multiplier forge (×1–×12) whose product
matches the order. Get it right and the factory roars to life, the boss pays out in bolts, and you
spend them in a tycoon-style shop.

Behind the scenes a mastery tracker watches which facts are fast, slow or shaky and steers new
orders toward the ones that need practice. Wrong answers are never punished — the forge sputters,
explains what went wrong ("7 × 6 makes 42 — the boss needs 56!") and lets you try again.

It is designed for an iPad held in landscape: big touch targets, no keyboard ever, works fully
offline once installed to the Home Screen.

## How to play

1. Read the boss's order (the number on the dock).
2. Tap a dispenser on the left, then a forge in the middle — any pair that multiplies to the
   target works (24 = 3×8 = 4×6 = 2×12).
3. Confirm, and watch the goods flow to the boss.
4. Answer correctly in a row to build a **combo**; fast first-try answers can be **CRITICAL**.

## The shop

| Tab | What you get |
|---|---|
| **Upgrades** | Permanent boosts that say exactly what they do (+20% bolts, bolt magnet …). |
| **Build** | Ten factory pieces, bought in order, that appear in the factory with a build-in animation. |
| **Pets** | Three eggs, fifteen pets, five rarities. Equip your best pets for a bolt boost; combine five identical pets into a golden one (×3). Undiscovered pets show as silhouettes in the index. |
| **Styles** | Belt skins, trails and factory themes (neon, lava, ice, candy, space). |
| **Drones** | Helpers that deliver orders for you — unlocked by answering quickly. |
| **Rebirth** | Reset bolts, upgrades and builds for a permanent multiplier and an extra pet slot. Pets and styles are kept. |

There's also a 7-day daily chest (day 7 is a free egg) and a goal pill in the HUD that always
points at the next thing worth buying.

## Run it locally

No build step and no dependencies — just static files.

```bash
python3 -m http.server 8173
```

Then open <http://localhost:8173>. Run the tests with Node 18+:

```bash
node --test tests/
```

`dev/` contains standalone harnesses for the engine, UI and shop that are handy while developing;
they are not part of the deployed game.

## Deploying

Every push to `main` runs the tests and publishes the game to GitHub Pages via
[`.github/workflows/pages.yml`](.github/workflows/pages.yml). Only `index.html`, `manifest.json`,
`sw.js`, `css/`, `src/` and `icons/` are shipped. To host it elsewhere, serve those same files over
HTTPS. When changing any shipped file, bump `CACHE_VERSION` in `sw.js` so installed copies update.

## Project layout

```
index.html, manifest.json, sw.js   PWA shell and offline cache
src/core      save, events, theme, formatting
src/math      mastery tracker (runs in a Web Worker)
src/game      game loop, rules, economy
src/render    Canvas2D factory, belts, pets, builds, themes
src/ui        DOM overlays: HUD, shop, hatch, daily chest, prompts
css/          UI styles
tests/        node:test suites
docs/         architecture and shop design
```

## Contributing

Issues and pull requests are welcome. Please keep the ground rules from
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): no dependencies or build step, no text inputs (the
iPad keyboard must never appear), and `node --test tests/` must pass.

## License

[Apache 2.0](LICENSE)
