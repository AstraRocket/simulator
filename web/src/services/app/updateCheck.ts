/** Ten minutes: the Pages CDN caches `sw.js` for 600 s regardless of cache-busting. */
export const UPDATE_POLL_MS = 10 * 60_000;

/** Floor between checks, so event triggers (tab focus, online) cannot become a poll loop. */
export const UPDATE_MIN_GAP_MS = 5 * 60_000;

export const UPDATE_SNOOZE_MS = 2 * 60 * 60_000;

export function dueForCheck(last: number | null, now: number, gap: number = UPDATE_MIN_GAP_MS): boolean {
  return last === null || now - last >= gap;
}

export function snoozeUntil(now: number, ms: number = UPDATE_SNOOZE_MS): number {
  return now + ms;
}

export const UPDATE_APPLY_HIDDEN_MS = 30_000;

/** With `registerType: 'prompt'` and `clientsClaim` off, an unaccepted worker waits for the tab's life. */
export function readyToApplyHidden(
  waiting: boolean,
  hiddenSince: number | null,
  busy: boolean,
  now: number,
  after: number = UPDATE_APPLY_HIDDEN_MS,
): boolean {
  if (!waiting || busy || hiddenSince === null) return false;
  return now - hiddenSince >= after;
}
