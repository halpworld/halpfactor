// Service worker: offline-first with stale-while-revalidate for the app shell.
// - install: precache the app shell, each file individually (one 404 never fails the install)
// - fetch:   same-origin GET only. Shell files are served from cache immediately and
//            refreshed in the background, so fixes reach players on the next launch even
//            without a CACHE_VERSION bump. Only SHELL paths are ever written to the cache,
//            under normalised keys; navigations to the app root are stored as 'index.html'.
//            Redirected / non-basic / non-200 responses are never cached.
//            'index.html' is fetched from the directory URL ('./'): many static servers
//            redirect /index.html -> /, and a redirected response handed to a navigation is
//            a network error in browsers. Any redirected response a navigation would still
//            receive is rebuilt into a fresh, non-redirected Response first.
// - navigations fall back to the cached index.html when offline
// - activate: delete old caches
// tests/sw-shell.test.mjs checks that SHELL lists every shipped file.

const CACHE_VERSION = 'v5';
const CACHE_NAME = `robofactor-${CACHE_VERSION}`;

const SHELL = [
  'index.html',
  'manifest.json',
  'css/shop.css',
  'css/ui.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'src/audio.js',
  'src/core/events.js',
  'src/core/format.js',
  'src/core/save.js',
  'src/core/theme.js',
  'src/game/belt.js',
  'src/game/boss.js',
  'src/game/critters.js',
  'src/game/economy.js',
  'src/game/floaters.js',
  'src/game/game.js',
  'src/game/input.js',
  'src/game/layout.js',
  'src/game/machines.js',
  'src/game/rules.js',
  'src/main.js',
  'src/math/engine.js',
  'src/math/mastery.js',
  'src/math/worker.js',
  'src/render/background.js',
  'src/render/builds.js',
  'src/render/items.js',
  'src/render/particles.js',
  'src/render/pets.js',
  'src/render/renderer.js',
  'src/render/sprites.js',
  'src/render/themes.js',
  'src/render/util.js',
  'src/ui/blueprint.js',
  'src/ui/daily.js',
  'src/ui/dom.js',
  'src/ui/foremanLog.js',
  'src/ui/hatch.js',
  'src/ui/hud.js',
  'src/ui/icons.js',
  'src/ui/icons2.js',
  'src/ui/keypad.js',
  'src/ui/petart.js',
  'src/ui/prompts.js',
  'src/ui/shop.js',
  'src/ui/toast.js',
  'src/ui/tutorial.js',
  'src/ui/ui.js',
];
const SHELL_SET = new Set(SHELL);
// Directory the worker (and app) lives in, e.g. '/' or '/robofactor/'.
const BASE_URL = new URL('./', self.location.href); // == the registration scope ('./')
const BASE = BASE_URL.pathname;

/**
 * The one URL a shell key is ever fetched from (no query, no fragment, no client headers).
 * index.html is fetched as the directory itself so servers that redirect /index.html -> /
 * never give us a redirected response.
 */
function canonicalUrl(key) {
  if (key === 'index.html') return BASE_URL.href;
  return new URL(key, BASE_URL).href;
}

/** A navigation must never be answered with a redirected response: copy it into a fresh one. */
function unredirect(res) {
  if (!res || !res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** Cache key for a same-origin URL, or null when it is not a shell file. */
function shellKey(url) {
  if (url.origin !== self.location.origin) return null;
  if (!url.pathname.startsWith(BASE)) return null;
  const rel = url.pathname.slice(BASE.length);
  if (rel === '' || rel === 'index.html') return 'index.html';
  return SHELL_SET.has(rel) ? rel : null;
}

function cacheable(res) {
  return !!res && res.ok && res.status === 200 && res.type === 'basic' && !res.redirected;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const res = await fetch(canonicalUrl(url), { cache: 'reload' });
            if (cacheable(res)) await cache.put(url, res);
          } catch (_) {
            /* ignore: runtime caching will pick it up later */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('robofactor-') && k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === 'navigate';
  const key = shellKey(url);
  if (!key && !isNav) return; // not ours: plain network, never cached
  event.respondWith(handle(event, req, key, isNav));
});

async function offlineFallback(cache, isNav) {
  if (isNav) {
    const shell = await cache.match('index.html');
    if (shell) return shell;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
}

async function handle(event, req, key, isNav) {
  const cache = await caches.open(CACHE_NAME);
  if (!key) {
    // A navigation outside the shell (e.g. a dev page): network, offline -> app.
    try {
      return unredirect(await fetch(req));
    } catch (_) {
      return offlineFallback(cache, true);
    }
  }
  const cached = await cache.match(key);
  // Anything that may be cache.put() is fetched from its canonical URL, never from `req`:
  // otherwise `src/main.js?x` (or a navigation with a query) would be stored under the
  // clean key. The canonical fetch is a fresh same-origin GET, so no-cache is always allowed.
  const network = fetch(canonicalUrl(key), { cache: 'no-cache' })
    .then(async (res) => {
      if (cacheable(res)) await cache.put(key, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (cached) {
    // Stale-while-revalidate: answer now, refresh in the background.
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  if (!res) return offlineFallback(cache, isNav);
  return isNav ? unredirect(res) : res;
}
