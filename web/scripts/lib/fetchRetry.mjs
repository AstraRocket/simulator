// Retry a request while the server says it is unavailable.
//
// ThrustCurve.org answers 503 during short outages, which would otherwise fail
// a scheduled catalog sync outright. A 429 or 5xx, or a request that never reached
// the server, is tried again after each delay in turn; any other status is
// returned to the caller at once, since asking again cannot change it.

const RETRY_DELAYS_MS = [15_000, 60_000, 180_000];

const retryable = (status) => status === 429 || status >= 500;

export async function fetchRetry(url, init, { delays = RETRY_DELAYS_MS, sleep, log = console.log } = {}) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= delays.length) throw err;
      log(`  ${url}: ${err.message}; retrying in ${delays[attempt] / 1000} s`);
      await wait(delays[attempt]);
      continue;
    }
    if (!retryable(res.status) || attempt >= delays.length) return res;
    log(`  ${url}: HTTP ${res.status}; retrying in ${delays[attempt] / 1000} s`);
    await wait(delays[attempt]);
  }
}
