import { KeyedError } from '../../i18n/keyedError';

/**
 * Reading a response body with byte-level progress.
 *
 * `res.json()` / `res.arrayBuffer()` resolve only once the whole transfer is
 * done, which tells the user nothing during the two multi-megabyte downloads
 * this app makes: the WASM engine at boot and the motor catalog. On a slow
 * link that is precisely when "still downloading" needs to be distinguishable
 * from "stuck".
 */

/** Bytes transferred so far, and the total when the host declared one. */
export type TransferProgress = { loaded: number; total: number | null };

/** A response's content-length, or null when it declares none or an unusable one
 *  (absent behind chunked transfer encoding, so the UI must cope either way). */
export function declaredLength(res: Response): number | null {
  const n = Number(res.headers.get('content-length'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Drain a body stream to a single buffer, reporting progress as chunks arrive.
 * Reports once up front with `loaded: 0`, so a caller can show a bar before the
 * first chunk lands.
 *
 * `maxBytes` is enforced against bytes actually received rather than the
 * declared length, so a host that omits or misstates content-length cannot slip
 * past the cap.
 */
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
      // Cancel, do not merely abandon. Dropping the reader leaves the transfer
      // in flight, so the cap would bound the buffer we keep and not the bytes
      // the network moves, and the refused response would go on downloading
      // after the caller has given up on it. `cancel` can itself
      // reject (a stream already errored by the network), and that must not
      // mask the reason we are here.
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

/** How a caller words each way a staged fetch fails. */
export interface StagedFetchErrors {
  /** A non-2xx reply. */
  http: (status: number) => Error;
  /** A reply over the size cap, declared or streamed. */
  tooLarge: () => Error;
  /** Anything else, or anything above as thrown, with whether a budget ran out. */
  fail: (e: unknown, timedOut: boolean) => Error;
}

/**
 * fetch and JSON with staged abort timeouts and a size cap, so a hung or
 * oversized host response cannot stall a picker or exhaust memory on parse.
 *
 * The first budget (`ttfbMs`) covers the time to first byte; once headers are
 * in the host is alive, and the body gets its own (`bodyMs`). A single budget
 * spanning both would cut off a slow download. The cap is held on the bytes
 * received, not just a declared length, since a chunked reply declares none.
 * Any failure aborts the body, so an error page or an oversized reply does not
 * go on downloading after it is reported. Worker-safe: no i18n, the caller
 * words its errors.
 */
export async function fetchJsonStaged<T>(
  url: string,
  init: RequestInit,
  budget: { ttfbMs: number; bodyMs: number; maxBytes: number; onProgress?: (p: TransferProgress) => void },
  errors: StagedFetchErrors,
): Promise<T> {
  const ctrl = new AbortController();
  // Set only by a budget running out, so the failure can tell a timeout from
  // the abort done on any other failure.
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
    // Awaited, not returned: `finally` runs at the `return`, so returning the
    // unawaited read would clear the body timer before the body is read.
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
