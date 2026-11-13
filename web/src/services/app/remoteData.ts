import { type TransferProgress, fetchJsonStaged } from './fetchProgress';
import { errorReason, KeyedError } from '../../i18n/keyedError';
import { isRecord } from './numbers';

const LOCAL_BASE = `${import.meta.env.BASE_URL}data/`;

/** Blank is unset: an empty string would normalize to '/' and fetch the server root. */
const configured = import.meta.env.VITE_DATA_BASE?.trim();
const REMOTE_BASE = configured ? configured.replace(/\/*$/, '/') : undefined;

export const hasDataHost = (): boolean => REMOTE_BASE !== undefined && REMOTE_BASE !== LOCAL_BASE;

const TTFB_TIMEOUT_MS = 8_000;
const BODY_TIMEOUT_MS = 60_000;
const MAX_CATALOG_BYTES = 32 * 1024 * 1024;

export type CatalogProgress = TransferProgress;

export function progressPercent(p: CatalogProgress | null | undefined): number | null {
  return p?.total ? Math.min(100, Math.round((p.loaded / p.total) * 100)) : null;
}

export class HttpError extends KeyedError {
  constructor(readonly status: number) {
    super('errors.remote.http', { status });
    this.name = 'HttpError';
  }
}

export function fetchFailure(e: unknown, timedOut: boolean): KeyedError {
  if (e instanceof KeyedError) return e;
  if (timedOut) return new KeyedError('errors.remote.timeout');
  if (e instanceof SyntaxError) return new KeyedError('errors.remote.badShape');
  return new KeyedError('errors.remote.network');
}

function fetchJson<T>(
  url: string,
  ttfbMs: number,
  opts?: RequestInit,
  onProgress?: (p: CatalogProgress) => void,
): Promise<T> {
  return fetchJsonStaged<T>(
    url,
    opts ?? {},
    { ttfbMs, bodyMs: BODY_TIMEOUT_MS, maxBytes: MAX_CATALOG_BYTES, onProgress },
    {
      http: (status) => new HttpError(status),
      tooLarge: () => new KeyedError('errors.remote.tooLarge'),
      fail: fetchFailure,
    },
  );
}

const progressListeners = new Map<string, Set<(p: CatalogProgress) => void>>();
const lastProgress = new Map<string, CatalogProgress>();

export function subscribeCatalogProgress(name: string, cb: (p: CatalogProgress) => void): () => void {
  let set = progressListeners.get(name);
  if (!set) progressListeners.set(name, (set = new Set()));
  set.add(cb);
  const last = lastProgress.get(name);
  if (last) cb(last);
  return () => {
    set.delete(cb);
  };
}

function reportProgress(name: string, p: CatalogProgress): void {
  lastProgress.set(name, p);
  for (const cb of progressListeners.get(name) ?? []) cb(p);
}

export function manifestEntries(body: unknown): Record<string, string> {
  if (!isRecord(body)) return {};
  const out: Record<string, string> = {};
  for (const [name, hash] of Object.entries(body)) if (typeof hash === 'string' && hash) out[name] = hash;
  return out;
}

export interface CatalogInfo {
  updated: string;
  count?: number;
}

export function manifestCatalogs(body: unknown): Record<string, CatalogInfo> {
  const raw = (body as { catalogs?: unknown } | null)?.catalogs;
  if (!isRecord(raw)) return {};
  const out: Record<string, CatalogInfo> = {};
  for (const [name, v] of Object.entries(raw)) {
    const { updated, count } = (v ?? {}) as { updated?: unknown; count?: unknown };
    if (typeof updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(updated)) continue;
    out[name] = Number.isInteger(count) && (count as number) >= 0 ? { updated, count: count as number } : { updated };
  }
  return out;
}

interface Manifest {
  hashes: Record<string, string>;
  catalogs: Record<string, CatalogInfo>;
}

const manifestP = new Map<string, Promise<Manifest>>();
function manifest(base: string): Promise<Manifest> {
  let p = manifestP.get(base);
  if (!p) {
    // Only a 404's empty answer is kept; caching a transient failure pins stale catalogs.
    p = fetchJson<unknown>(`${base}manifest.json`, TTFB_TIMEOUT_MS, { cache: 'no-cache' }).then(
      (body) => ({ hashes: manifestEntries(body), catalogs: manifestCatalogs(body) }),
      (e: unknown) => {
        if (!(e instanceof HttpError && e.status === 404)) manifestP.delete(base);
        return { hashes: {}, catalogs: {} };
      },
    );
    manifestP.set(base, p);
  }
  return p;
}

const catalogP = new Map<string, Promise<unknown>>();

const CATALOG_FAILED_KEY = {
  motors: 'errors.remote.motors',
  components: 'errors.remote.components',
  materials: 'errors.remote.materials',
  contributors: 'errors.remote.contributors',
} as const;

export type CatalogName = keyof typeof CATALOG_FAILED_KEY;

/** The data-host sync does not regenerate these, so a host copy can be older than the build's. */
const BUILD_ONLY: ReadonlySet<CatalogName> = new Set(['materials', 'contributors']);

const baseFor = (name: CatalogName): string => (BUILD_ONLY.has(name) || !REMOTE_BASE ? LOCAL_BASE : REMOTE_BASE);

async function catalogUrl(name: CatalogName): Promise<string> {
  const base = baseFor(name);
  const hash = (await manifest(base)).hashes[name];
  return `${base}${name}.generated.json` + (hash ? `?v=${encodeURIComponent(hash)}` : '');
}

export async function catalogHash(name: CatalogName): Promise<string | undefined> {
  return (await manifest(baseFor(name))).hashes[name];
}

export async function catalogInfo(name: CatalogName): Promise<CatalogInfo | undefined> {
  return (await manifest(baseFor(name))).catalogs[name];
}

/** These are the SW cache keys: its `astra-catalogs` rules match the whole URL, query included. */
export async function dataHostUrls(names: readonly CatalogName[]): Promise<string[]> {
  if (!hasDataHost() || !REMOTE_BASE) return [];
  return [`${REMOTE_BASE}manifest.json`, ...(await Promise.all(names.map(catalogUrl)))];
}

export function fetchCatalog<T>(name: CatalogName, valid?: (v: unknown) => boolean): Promise<T> {
  let p = catalogP.get(name) as Promise<T> | undefined;
  if (!p) {
    p = (async () => {
      try {
        const body = await fetchJson<T>(await catalogUrl(name), TTFB_TIMEOUT_MS, undefined, (p) =>
          reportProgress(name, p),
        );
        if (valid && !valid(body)) throw new KeyedError('errors.remote.badShape');
        return body;
      } catch (e) {
        lastProgress.delete(name);
        throw new KeyedError(CATALOG_FAILED_KEY[name], { reason: errorReason(e) });
      }
    })();
    p.catch(() => catalogP.delete(name));
    catalogP.set(name, p);
  }
  return p;
}
