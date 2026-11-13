import { finiteOr } from './numbers';
// The CDN can serve an older sw.js as waiting, so only a higher build id than the
// active worker's (not the page's) is taken up; otherwise it can reload-loop.

/** A worker that does not know the question never answers. */
const ASK_TIMEOUT_MS = 3_000;

export function askBuild(sw: ServiceWorker, timeoutMs: number = ASK_TIMEOUT_MS): Promise<number | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      clearTimeout(timer);
      const build = (event.data as { build?: unknown } | null)?.build;
      resolve(finiteOr(build, null));
    };
    sw.postMessage({ type: 'GET_BUILD' }, [channel.port2]);
  });
}

/** A silent active build predates the question, so any answering waiting build is newer. */
export function isNewerBuild(waiting: number | null, active: number | null): boolean {
  if (waiting === null) return false;
  return active === null || waiting > active;
}

/** A silent active worker is asked twice: it may just be slow to wake. */
export async function waitingIsNewer(reg: ServiceWorkerRegistration | null | undefined): Promise<boolean> {
  if (!reg?.waiting) return false;
  const [waiting, first] = await Promise.all([askBuild(reg.waiting), reg.active ? askBuild(reg.active) : null]);
  const active = first === null && waiting !== null && reg.active ? await askBuild(reg.active) : first;
  return isNewerBuild(waiting, active);
}
