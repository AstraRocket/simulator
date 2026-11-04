// Privacy: a sandboxed frame's opaque origin sends `Origin: null`, no Referer, no cookies.
// Needs the service to answer `Access-Control-Allow-Origin: *`.

export interface AnonymousResponse {
  status: number;
  text: string;
}

export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Must stay shorter than the weather requests' own deadline. */
const FRAME_START_TIMEOUT_MS = 5_000;

const FRAME_SCRIPT = `
const MAX = ${MAX_RESPONSE_BYTES};
const running = new Map();
async function readCapped(res, ctl) {
  if (Number(res.headers.get('content-length')) > MAX) { ctl.abort(); return null; }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > MAX) { reader.cancel().catch(() => {}); ctl.abort(); return null; }
    parts.push(value);
  }
  const all = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}
addEventListener('message', async (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  if (!m || typeof m.id !== 'number') return;
  if (m.cancel) { running.get(m.id)?.abort(); return; }
  if (typeof m.url !== 'string' || !m.url.startsWith('https://')) {
    parent.postMessage({ id: m.id, error: 'refused' }, '*');
    return;
  }
  const ctl = new AbortController();
  running.set(m.id, ctl);
  try {
    const res = await fetch(m.url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl.signal });
    const text = await readCapped(res, ctl);
    if (text === null) parent.postMessage({ id: m.id, error: 'tooLarge' }, '*');
    else parent.postMessage({ id: m.id, status: res.status, text }, '*');
  } catch (err) {
    parent.postMessage({ id: m.id, error: ctl.signal.aborted ? 'aborted' : 'network' }, '*');
  } finally {
    running.delete(m.id);
  }
});
parent.postMessage({ ready: true }, '*');
`;

export class AnonymousFetchError extends Error {
  readonly kind: 'network' | 'aborted' | 'tooLarge';
  constructor(kind: 'network' | 'aborted' | 'tooLarge') {
    super(kind);
    this.name = 'AnonymousFetchError';
    this.kind = kind;
  }
}

let frame: { el: HTMLIFrameElement; ready: Promise<Window> } | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: AnonymousResponse) => void; reject: (e: Error) => void }>();

function onMessage(e: MessageEvent): void {
  if (!frame || e.source !== frame.el.contentWindow) return;
  const m = e.data as { id?: number; status?: number; text?: unknown; error?: string };
  if (typeof m?.id !== 'number') return;
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  if (typeof m.status === 'number') {
    const text = typeof m.text === 'string' ? m.text : '';
    // A string's length never exceeds its UTF-8 byte count, so this still enforces the cap.
    if (text.length > MAX_RESPONSE_BYTES) p.reject(new AnonymousFetchError('tooLarge'));
    else p.resolve({ status: m.status, text });
  } else {
    p.reject(
      new AnonymousFetchError(m.error === 'aborted' ? 'aborted' : m.error === 'tooLarge' ? 'tooLarge' : 'network'),
    );
  }
}

function frameWindow(): Promise<Window> {
  if (frame) return frame.ready;
  const el = document.createElement('iframe');
  // No allow-same-origin: that would give the frame the page's origin.
  el.setAttribute('sandbox', 'allow-scripts');
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  el.style.display = 'none';
  el.srcdoc = `<!doctype html><meta charset="utf-8"><script>${FRAME_SCRIPT}</script>`;
  const ready = new Promise<Window>((resolve, reject) => {
    const hello = (e: MessageEvent) => {
      if (e.source !== el.contentWindow || !(e.data as { ready?: boolean })?.ready) return;
      clearTimeout(timer);
      window.removeEventListener('message', hello);
      window.addEventListener('message', onMessage);
      resolve(el.contentWindow!);
    };
    const timer = setTimeout(() => {
      window.removeEventListener('message', hello);
      el.remove();
      if (frame?.el === el) frame = null;
      reject(new AnonymousFetchError('network'));
    }, FRAME_START_TIMEOUT_MS);
    window.addEventListener('message', hello);
  });
  // Avoids an unhandled rejection when every waiter has given up.
  ready.catch(() => {});
  frame = { el, ready };
  document.body.appendChild(el);
  return ready;
}

function untilReady(ready: Promise<Window>, signal: AbortSignal | undefined): Promise<Window> {
  if (!signal) return ready;
  return new Promise<Window>((resolve, reject) => {
    const onAbort = () => reject(new AnonymousFetchError('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    ready.then(
      (w) => {
        signal.removeEventListener('abort', onAbort);
        resolve(w);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e instanceof Error ? e : new AnonymousFetchError('network'));
      },
    );
  });
}

export async function anonymousGet(url: string, signal?: AbortSignal): Promise<AnonymousResponse> {
  if (signal?.aborted) throw new AnonymousFetchError('aborted');
  if (!url.startsWith('https://')) throw new AnonymousFetchError('network');
  const win = await untilReady(frameWindow(), signal);
  if (signal?.aborted) throw new AnonymousFetchError('aborted');
  const id = nextId++;
  return new Promise<AnonymousResponse>((resolve, reject) => {
    const onAbort = () => {
      win.postMessage({ id, cancel: true }, '*');
      pending.delete(id);
      reject(new AnonymousFetchError('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    pending.set(id, {
      resolve: (r) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(r);
      },
      reject: (e) => {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      },
    });
    // '*' because the frame's origin is opaque and has no name to target.
    win.postMessage({ id, url }, '*');
  });
}
