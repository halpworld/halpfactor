// Robo-Factor: Overclocked — app entry. Wires every module together.
import { bus } from './core/events.js';
import { Synth } from './audio.js';
import { MathEngine } from './math/engine.js';
import { loadSave, writeSave, safeLocalStorage } from './core/save.js';
import { unlockedTables } from './math/mastery.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';

// Keep running no matter what: log, never throw out of global handlers.
window.addEventListener('error', (e) => {
  console.error('[robofactor] uncaught error', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[robofactor] unhandled rejection', e.reason);
  e.preventDefault();
});

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[robofactor] SW registration failed', err));
  });
}

function boot() {
  const canvas = document.getElementById('game');
  const uiHost = document.getElementById('ui');
  const storage = safeLocalStorage();
  const save = loadSave(storage);
  const synth = new Synth();
  const engine = MathEngine.create({ storage });
  const ui = new UI(uiHost, { synth, bus });
  const game = new Game({
    canvas,
    ui,
    synth,
    engine,
    save,
    bus,
    writeSave: (s) => writeSave(s, storage),
    unlockedTables,
  });
  game.start();
  // Flush mastery data when the app is backgrounded (iPad kills PWAs freely).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      engine.then((e) => e && typeof e.flush === 'function' && e.flush()).catch(() => {});
      writeSave(save, storage);
    }
  });
  return game;
}

registerServiceWorker();
try {
  boot();
} catch (err) {
  console.error('[robofactor] boot failed', err);
}
