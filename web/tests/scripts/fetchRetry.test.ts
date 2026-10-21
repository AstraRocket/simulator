import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error - a plain .mjs build script helper, no types
import { fetchRetry } from '../../scripts/lib/fetchRetry.mjs';

/**
 * The motor catalog sync calls ThrustCurve.org, which answers 503 during short
 * outages. A transient 429 or 5xx, or a request that never reached the server,
 * is retried; a status asking again cannot change is returned at once.
 */
const opts = { delays: [1, 2, 3], sleep: async () => {}, log: () => {} };
const reply = (status: number) => new Response('{}', { status });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRetry', () => {
  it('retries a 503 and returns the answer once the server is back', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(200));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchRetry('https://example.test/search.json', {}, opts);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a request that never reached the server', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(reply(200));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchRetry('https://example.test/search.json', {}, opts);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns a 4xx other than 429 without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(400));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchRetry('https://example.test/search.json', {}, opts);
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last delay and returns the failing answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(503));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchRetry('https://example.test/search.json', {}, opts);
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
