import { KeyedError } from '../../i18n/keyedError';

export type TransferProgress = { loaded: number; total: number | null };

export function declaredLength(res: Response): number | null {
  const n = Number(res.headers.get('content-length'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `maxBytes` is checked on bytes received, since content-length can lie. */
export async function readStreamWithProgress(
  body: ReadableStream<Uint8Array>,
  total: number | null,
  onProgress: (p: TransferProgress) => void,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress({ loaded, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    if (loaded > maxBytes) {
      // Cancel, or it keeps downloading; a rejecting `cancel` must not mask this error.
      await reader.cancel().catch(() => {});
      throw new KeyedError('errors.remote.tooLarge');
    }
    onProgress({ loaded, total });
  }
  const buf = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  return buf;
}

export interface StagedFetchErrors {
  http: (status: number) => Error;
  tooLarge: () => Error;
  fail: (e: unknown, timedOut: boolean) => Error;
}

/** Worker-safe: no i18n here, the caller words its errors. */
export async function fetchJsonStaged<T>(
  url: string,
  init: RequestInit,
  budget: { ttfbMs: number; bodyMs: number; maxBytes: number; onProgress?: (p: TransferProgress) => void },
  errors: StagedFetchErrors,
): Promise<T> {
  const ctrl = new AbortController();
  let timedOut = false;
  const expire = () => {
    timedOut = true;
    ctrl.abort();
  };
  let timer = setTimeout(expire, budget.ttfbMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(timer);
    timer = setTimeout(expire, budget.bodyMs);
    if (!res.ok) throw errors.http(res.status);
    const len = declaredLength(res);
    if (len !== null && len > budget.maxBytes) throw errors.tooLarge();
    // Awaited: `finally` would otherwise clear the body timer before the body is read.
    if (!res.body) return (await res.json()) as T;
    let bytes: Uint8Array;
    try {
      bytes = await readStreamWithProgress(res.body, len, budget.onProgress ?? (() => {}), budget.maxBytes);
    } catch (e) {
      throw e instanceof KeyedError && e.key === 'errors.remote.tooLarge' ? errors.tooLarge() : e;
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch (e) {
    ctrl.abort();
    throw errors.fail(e, timedOut);
  } finally {
    clearTimeout(timer);
  }
}
