// Workbox keys the precache without `?v=<hash>`, so vite.config.ts must list `v` in `ignoreURLParametersMatching`.
// HOST must match the `astra-catalogs` worker rule's urlPattern.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { acknowledgeWip, servePreview, VITE, WEB } from './lib/previewCheck.mjs';
import { catalogHash, rowCount } from './lib/dataManifest.mjs';

/* global caches */

const DATA = resolve(WEB, 'public/data');
const OUT = 'dist-offline-data-check';
const OUT_HOSTED = 'dist-offline-data-check-hosted';
const PORT = 4183;
const URL_ = `http://localhost:${PORT}/`;
// Never reached: the harness answers it.
const HOST = 'https://cdn.jsdelivr.net/gh/astra-offline-check/catalogs@data/';
// Must match vite.config.ts `hostedCatalogs` and remoteData.ts `BUILD_ONLY`.
const HOSTED = ['motors', 'components'];
const IN_BUILD = ['materials', 'contributors'];
// Must match the cache names in vite.config.ts.
const CATALOG_CACHE = 'astra-catalogs';
const MAP_TILE_CACHE = 'astra-map-tiles-v2';
const NO_AGE_CACHES = [CATALOG_CACHE, MAP_TILE_CACHE];
// Must match services/storage/settings.ts; this .mjs cannot import TS.
const log = (...a) => console.log('[offline-data]', ...a);

function build(outDir, env = {}) {
  execFileSync(process.execPath, [VITE, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: WEB,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

const serve = (outDir) => servePreview(outDir, PORT, URL_);

async function openPage(context) {
  const page = await context.newPage();
  await acknowledgeWip(page);
  return page;
}

async function takeOver(page) {
  await page.goto(URL_);
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 60_000 });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
}

// Mirrors remoteData's fetch order and `?v=<hash>` URLs.
function readCatalogs(page, sources) {
  return page.evaluate(async (sources) => {
    const get = async (url, init) => {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };
    const out = {};
    for (const { base, only } of sources) {
      let manifest;
      try {
        manifest = await get(`${base}manifest.json`, { cache: 'no-cache' });
      } catch (e) {
        return { manifest: `${base}manifest.json: ${String(e)}` };
      }
      // The hashes are the string values; `catalogs` beside them is not a catalog.
      for (const name of only ?? Object.keys(manifest).filter((k) => typeof manifest[k] === 'string')) {
        const hash = manifest[name];
        if (!hash) {
          out[name] = { ok: false, error: `${base}manifest.json has no hash for it` };
          continue;
        }
        try {
          const body = await get(`${base}${name}.generated.json?v=${hash}`);
          // Mirrors lib/dataManifest.mjs `rowCount`, which the page cannot import.
          const arrays = Array.isArray(body) ? [body] : Object.values(body).filter(Array.isArray);
          const n = arrays.length === 1 ? arrays[0].length : Object.keys(body).length;
          out[name] = { ok: n > 0, hash, entries: n, error: n > 0 ? undefined : 'empty body' };
        } catch (e) {
          out[name] = { ok: false, hash, error: String(e).slice(0, 120) };
        }
      }
    }
    return { catalogs: out };
  }, sources);
}

function report(results, expected, served = {}) {
  if (results.manifest) throw new Error(`manifest.json is not available offline: ${results.manifest}`);
  const names = Object.keys(results.catalogs);
  const missing = expected.filter((n) => !names.includes(n));
  if (missing.length) {
    throw new Error(
      `manifest.json names ${names.length} catalog(s) (${names.join(', ')}); missing ${missing.join(', ')}`,
    );
  }
  for (const n of names) {
    const r = results.catalogs[n];
    log(` ${r.ok ? 'OK  ' : 'FAIL'} ${n}${r.ok ? ` (${r.entries} entries, v=${r.hash})` : `: ${r.error}`}`);
  }
  const broken = names.filter((n) => !results.catalogs[n].ok);
  if (broken.length) throw new Error(`unreachable offline: ${broken.join(', ')}`);
  for (const [n, want] of Object.entries(served)) {
    const r = results.catalogs[n];
    if (r.hash !== want.hash)
      throw new Error(`${n} was read under v=${r.hash}; the host's manifest names it at v=${want.hash}`);
    if (r.entries !== want.entries)
      throw new Error(`${n} loaded with ${r.entries} entries; the host's copy has ${want.entries}`);
  }
}

function ruleExpirations(outDir, cacheName) {
  const sw = readFileSync(resolve(WEB, outDir, 'sw.js'), 'utf8');
  const out = [];
  for (const m of sw.matchAll(new RegExp(`cacheName:\\s*["']${cacheName}["']`, 'g'))) {
    const rest = sw.slice(m.index);
    const end = rest.search(/registerRoute\(/);
    const rule = end < 0 ? rest : rest.slice(0, end);
    const plugin = rule.match(/ExpirationPlugin\(\{([^}]*)\}\)/);
    out.push(plugin ? plugin[1] : null);
  }
  if (!out.length) throw new Error(`${outDir}/sw.js has no ${cacheName} rule`);
  return out;
}

function checkNoAge(outDir) {
  for (const cacheName of NO_AGE_CACHES) {
    const expirations = ruleExpirations(outDir, cacheName);
    for (const expiration of expirations) {
      if (expiration && /maxAgeSeconds/.test(expiration))
        throw new Error(`a ${cacheName} rule expires entries by age (${expiration}); offline it is the only copy`);
    }
    if (!expirations.some((e) => e && /maxEntries/.test(e)))
      throw new Error(`no ${cacheName} rule caps its entries (${expirations.join('; ')})`);
    log(`OK: ${expirations.length} ${cacheName} rule(s), the cache capped and nothing expired by age`);
  }
}

function hostVersions() {
  const files = new Map(readdirSync(DATA).map((f) => [f, readFileSync(resolve(DATA, f))]));
  const entriesOf = (data) => rowCount(data) ?? Object.keys(data).length;
  const version = (name, manifest, bodies) => ({
    name,
    manifest,
    files: bodies,
    served: Object.fromEntries(
      HOSTED.map((n) => [n, { hash: manifest[n], entries: entriesOf(JSON.parse(bodies.get(`${n}.generated.json`))) }]),
    ),
  });
  const manifest = JSON.parse(files.get('manifest.json'));
  const refreshed = new Map(files);
  const manifestB = { ...manifest };
  for (const n of HOSTED) {
    const data = JSON.parse(files.get(`${n}.generated.json`));
    const rows = Array.isArray(data) ? null : Object.keys(data).find((k) => Array.isArray(data[k]));
    const next = Array.isArray(data)
      ? [...data, data[0]]
      : rows
        ? { ...data, [rows]: [...data[rows], data[rows][0]] }
        : { ...data, refreshed: true };
    manifestB[n] = catalogHash(next);
    refreshed.set(`${n}.generated.json`, Buffer.from(JSON.stringify(next)));
  }
  refreshed.set('manifest.json', Buffer.from(JSON.stringify(manifestB)));
  return { a: version('A', manifest, files), b: version('B', manifestB, refreshed) };
}

// ExpirationPlugin judges age by the Date header, so a year-old Date exposes any `maxAgeSeconds`.
function ageCatalogCache(page) {
  return page.evaluate(async (cacheName) => {
    const cache = await caches.open(cacheName);
    const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toUTCString();
    const keys = await cache.keys();
    for (const req of keys) {
      const res = await cache.match(req);
      if (!res) continue;
      const headers = new Headers(res.headers);
      headers.set('date', old);
      await cache.put(req, new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers }));
    }
    return keys.length;
  }, CATALOG_CACHE);
}

function precached(outDir) {
  const sw = readFileSync(resolve(WEB, outDir, 'sw.js'), 'utf8');
  const urls = new Set();
  // Quote style varies with the minifier.
  for (const m of sw.matchAll(/url:\s*["']([^"']+)["']/g)) urls.add(m[1]);
  // A list this short means the pattern no longer matches the generated file.
  if (urls.size < 10) throw new Error(`could not read the precache list from ${outDir}/sw.js`);
  return urls;
}

async function bundledPass(browser) {
  log('layout 1: no data host, every catalog precached');
  log('building');
  build(OUT);
  const server = await serve(OUT);
  const context = await browser.newContext();
  try {
    const page = await openPage(context);
    log('install the worker and let it take the page');
    await takeOver(page);

    await context.setOffline(true);
    log('network off');

    report(await readCatalogs(page, [{ base: 'data/' }]), [...HOSTED, ...IN_BUILD]);
    log('OK: every runtime catalog loads with the network off, cache-buster and all');
  } finally {
    await context.close();
    server.kill();
  }
}

async function hostedPass(browser) {
  log(`layout 2: data host ${HOST}`);
  log('building');
  build(OUT_HOSTED, { VITE_DATA_BASE: HOST });

  const list = precached(OUT_HOSTED);
  for (const n of HOSTED) {
    if (list.has(`data/${n}.generated.json`)) throw new Error(`a data-host build precaches data/${n}.generated.json`);
    if (existsSync(resolve(WEB, OUT_HOSTED, `data/${n}.generated.json`)))
      throw new Error(`a data-host build ships data/${n}.generated.json in ${OUT_HOSTED}`);
  }
  for (const n of IN_BUILD) {
    if (!list.has(`data/${n}.generated.json`))
      throw new Error(`a data-host build does not precache data/${n}.generated.json`);
  }

  checkNoAge(OUT_HOSTED);

  const { a: A, b: B } = hostVersions();
  const server = await serve(OUT_HOSTED);
  const context = await browser.newContext();
  let answered = 0;
  const answerHost = (version) =>
    context.route(`${HOST}**`, (route) => {
      const file = new URL(route.request().url()).pathname.split('/').pop();
      const body = version.files.get(file);
      if (!body) return route.fulfill({ status: 404, body: 'not found' });
      answered++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body,
      });
    });
  const wanted = (version) => [
    `${HOST}manifest.json`,
    ...HOSTED.map((n) => `${HOST}${n}.generated.json?v=${encodeURIComponent(version.manifest[n])}`),
  ];

  async function waitForCache(page, version) {
    const want = wanted(version);
    const cached = () =>
      page.evaluate(async (cacheName) => {
        if (!(await caches.has(cacheName))) return [];
        return (await (await caches.open(cacheName)).keys()).map((r) => r.url);
      }, CATALOG_CACHE);
    // Polled from here: waitForFunction takes a returned promise as truthy.
    let have = [];
    for (let i = 0; i < 120 && !want.every((u) => have.includes(u)); i++) {
      await new Promise((r) => setTimeout(r, 500));
      have = await cached();
    }
    const missing = want.filter((u) => !have.includes(u));
    if (missing.length) {
      throw new Error(
        `the ${CATALOG_CACHE} cache never held ${missing.join(', ')} (host answered ${answered} request(s); cache has: ${have.join(', ') || 'nothing'})`,
      );
    }
  }

  async function readOffline(page, version) {
    log(`date ${await ageCatalogCache(page)} cached catalog entries a year back`);
    await context.unrouteAll({ behavior: 'ignoreErrors' });
    await context.setOffline(true);
    log('network off; reopen the app');
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
    report(
      await readCatalogs(page, [
        { base: HOST, only: HOSTED },
        { base: 'data/', only: IN_BUILD },
      ]),
      [...HOSTED, ...IN_BUILD],
      version.served,
    );
  }

  try {
    await answerHost(A);
    const page = await openPage(context);
    // Uncontrolled page: the app must store the catalogs itself.
    log('first visit: let the worker install, with the page left uncontrolled');
    await page.goto(URL_);
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 60_000 });
    if (await page.evaluate(() => !!navigator.serviceWorker.controller))
      throw new Error('the first visit is controlled by the worker, so it no longer checks an uncontrolled page');
    log('wait for the background fetch to fill the catalog cache');
    await waitForCache(page, A);
    await readOffline(page, A);
    log('OK: one online visit leaves the hosted catalogs readable offline');

    await context.setOffline(false);
    await answerHost(A);
    await page.evaluate((cacheName) => caches.delete(cacheName), CATALOG_CACHE);
    log('controlled visit: empty the catalog cache and reopen the app online');
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
    await waitForCache(page, A);
    await readOffline(page, A);
    log('OK: the hosted catalogs load offline from the runtime cache, the others from the precache');

    await context.setOffline(false);
    await answerHost(B);
    log('refresh: the host now serves manifest B and catalogs B; one online visit, then offline');
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
    await waitForCache(page, B);
    await readOffline(page, B);
    log('OK: one online visit after a catalog refresh leaves the refreshed catalogs readable offline');
  } finally {
    await context.close();
    server.kill();
  }
}

async function main() {
  const browser = await chromium.launch();
  try {
    await bundledPass(browser);
    await hostedPass(browser);
  } finally {
    await browser.close();
    rmSync(resolve(WEB, OUT), { recursive: true, force: true });
    rmSync(resolve(WEB, OUT_HOSTED), { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`[offline-data] ${e.message}`);
  process.exit(1);
});
