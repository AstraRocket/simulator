import { dataHostUrls, hasDataHost, type CatalogName } from './remoteData';

/** Must match the service worker's runtime cache name (vite.config.ts). */
const CATALOG_CACHE = 'astra-catalogs';

/** Uses the catalogs' own loaders, not `fetchCatalog`: the first caller's shape check is memoized. */
export function warmCatalogs(): void {
  if (!hasDataHost()) return;
  const warm = () => {
    const loads: [CatalogName, Promise<unknown>][] = [
      ['motors', import('../motors/motorDb').then((m) => m.loadCatalog())],
      ['components', import('../parts/componentDb').then((m) => m.loadCatalog())],
    ];
    for (const [name, load] of loads) {
      void load.then(() => keepForOffline(name)).catch(() => {});
    }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 10_000 });
  else setTimeout(warm, 2_000);
}

/** The first visit is never worker-controlled; cache under exact URLs and only 200s, as the SW rules expect. */
async function keepForOffline(name: CatalogName): Promise<void> {
  const sw = navigator.serviceWorker as ServiceWorkerContainer | undefined;
  if (!sw || sw.controller || typeof caches === 'undefined') return;
  await sw.ready;
  if (sw.controller) return;
  const cache = await caches.open(CATALOG_CACHE);
  for (const url of await dataHostUrls([name])) {
    const res = await fetch(url, { cache: 'force-cache' });
    if (res.status === 200) await cache.put(url, res);
  }
}
