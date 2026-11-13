import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(relative(ROOT, p).split('\\').join('/'));
  }
  return out;
}

function shellFromSw() {
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(src);
  assert.ok(m, 'SHELL array not found in sw.js');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

test('sw.js SHELL lists exactly the shipped files', () => {
  const shell = shellFromSw();
  assert.equal(new Set(shell).size, shell.length, 'duplicate SHELL entries');
  const expected = ['index.html', 'manifest.json', ...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'css')), ...walk(join(ROOT, 'icons'))].sort();
  assert.deepEqual([...shell].sort(), expected);
});

test('sw.js cache version bumped and keys normalised', () => {
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.match(src, /const CACHE_VERSION = 'v5'/);
  assert.ok(!shellFromSw().includes('./'), "navigations are stored under 'index.html', not './'");
  assert.match(src, /redirected/);
});

// Run sw.js in a VM with mocked caches/fetch and check what is fetched and stored.
async function loadSw({ redirectIndex = false, offline = false } = {}) {
  const { runInNewContext } = await import('node:vm');
  const ORIGIN = 'http://localhost:9999', LOC = ORIGIN + '/app/sw.js';
  const store = new Map();
  const abs = (k) => new URL(typeof k === 'string' ? k : k.url, LOC).href;
  const cache = { put: async (k, r) => void store.set(abs(k), r), match: async (k) => store.get(abs(k)) };
  const fetched = [];
  // redirectIndex: the server answers /app/index.html via a redirect to /app/ (like many static
  // servers do), so fetch() follows it and returns a response with redirected === true.
  const res = (url) => {
    const redirected = redirectIndex && url.endsWith('/index.html');
    return { ok: true, status: 200, statusText: 'OK', headers: {}, type: 'basic', redirected, url: redirected ? url.replace(/index\.html$/, '') : url, body: 'net:' + url, clone() { return this; } };
  };
  const L = {};
  const self = { location: new URL(LOC), registration: { scope: ORIGIN + '/app/' }, addEventListener: (t, f) => { L[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  runInNewContext(readFileSync(join(ROOT, 'sw.js'), 'utf8'), {
    self, URL, Promise, Set, console,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async (r, o) => { const u = abs(r); fetched.push({ url: u, cache: o && o.cache }); if (offline) throw new TypeError('offline'); return res(u); },
    Request: class { constructor(u, o = {}) { this.url = abs(u); Object.assign(this, o); } },
    Response: class { constructor(b, o) { this.body = b; Object.assign(this, o); } },
  });
  const go = async (url, mode = 'cors') => {
    let p = null; const bg = [];
    L.fetch({ request: { method: 'GET', url, mode }, respondWith: (x) => { p = x; }, waitUntil: (x) => bg.push(x) });
    const r = p ? await p : null;
    await Promise.all(bg);
    return r;
  };
  return { ORIGIN, store, fetched, go, L };
}

test('sw.js fetches shell files only from their canonical URL (query never stored under the clean key)', async () => {
  const { ORIGIN, store, fetched, go } = await loadSw();
  await go(ORIGIN + '/app/src/main.js?evil=1');
  assert.equal(fetched.length, 1);
  assert.equal(fetched[0].url, ORIGIN + '/app/src/main.js');
  assert.equal(fetched[0].cache, 'no-cache');
  assert.equal(store.get(ORIGIN + '/app/src/main.js').url, ORIGIN + '/app/src/main.js');
  assert.ok(![...store.keys()].some((k) => k.includes('?')));
  // a navigation with a query is revalidated from the canonical index.html
  fetched.length = 0;
  await go(ORIGIN + '/app/?utm=x', 'navigate');
  assert.equal(fetched[0].url, ORIGIN + '/app/');
  // non-shell requests are not handled (plain network, never cached)
  fetched.length = 0;
  assert.equal(await go(ORIGIN + '/app/other.json'), null);
  assert.equal(store.has(ORIGIN + '/app/other.json'), false);
});

test('sw.js never answers a navigation with a redirected response', async () => {
  // index.html is fetched from the directory URL, so even a server that redirects
  // /index.html -> / gives a plain response that is cached and served.
  const a = await loadSw({ redirectIndex: true });
  const r1 = await a.go(a.ORIGIN + '/app/', 'navigate');
  assert.equal(a.fetched[0].url, a.ORIGIN + '/app/');
  assert.equal(r1.redirected, false);
  assert.ok(a.store.has(a.ORIGIN + '/app/index.html'), 'index.html cached under its key');
  // a direct navigation to /app/index.html is answered from the same canonical fetch
  const b = await loadSw({ redirectIndex: true });
  const r2 = await b.go(b.ORIGIN + '/app/index.html', 'navigate');
  assert.equal(b.fetched[0].url, b.ORIGIN + '/app/');
  assert.equal(r2.redirected, false);
  // install precaches index.html from './' too
  const c = await loadSw({ redirectIndex: true });
  const waits = [];
  c.L.install({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.ok(c.fetched.some((f) => f.url === c.ORIGIN + '/app/' && f.cache === 'reload'));
  assert.ok(!c.fetched.some((f) => f.url.endsWith('/index.html')));
  assert.equal(c.store.get(c.ORIGIN + '/app/index.html').redirected, false);
});

test('sw.js rebuilds a redirected navigation response for non-shell pages', async () => {
  const { runInNewContext } = await import('node:vm');
  const ORIGIN = 'http://localhost:9999', LOC = ORIGIN + '/app/sw.js';
  const L = {};
  const self = { location: new URL(LOC), addEventListener: (t, f) => { L[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const red = { ok: true, status: 200, statusText: 'OK', headers: { h: 1 }, type: 'basic', redirected: true, url: ORIGIN + '/app/dev/x/', body: 'B' };
  runInNewContext(readFileSync(join(ROOT, 'sw.js'), 'utf8'), {
    self, URL, Promise, Set, console,
    caches: { open: async () => ({ match: async () => undefined, put: async () => {} }), keys: async () => [], delete: async () => true },
    fetch: async () => red,
    Response: class { constructor(b, o) { this.body = b; this.redirected = false; Object.assign(this, o); } },
  });
  let p = null;
  L.fetch({ request: { method: 'GET', url: ORIGIN + '/app/dev/x', mode: 'navigate' }, respondWith: (x) => { p = x; }, waitUntil: () => {} });
  const r = await p;
  assert.equal(r.redirected, false);
  assert.equal(r.body, 'B');
  assert.equal(r.status, 200);
});

test('sw.js offline navigation still falls back to the cached index.html', async () => {
  const a = await loadSw({ offline: true });
  a.store.set(a.ORIGIN + '/app/index.html', { body: 'cached-shell' });
  const r = await a.go(a.ORIGIN + '/app/some/deep/link', 'navigate');
  assert.equal(r.body, 'cached-shell');
  const r2 = await a.go(a.ORIGIN + '/app/?q=1', 'navigate');
  assert.equal(r2.body, 'cached-shell');
});
