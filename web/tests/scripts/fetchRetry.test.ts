import { describe, it, expect, vi, afterEach } from 'vitest';
// @ts-expect-error - a plain .mjs build script helper, no types
import { fetchRetry } from '../../scripts/lib/fetchRetry.mjs';

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

  it('sends through fetchImpl instead of the global fetch when given one', async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const fetchImpl = vi.fn().mockResolvedValueOnce(reply(503)).mockResolvedValueOnce(reply(200));
    const res = await fetchRetry('https://example.test/search.json', {}, { ...opts, fetchImpl });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('gives up after the last delay and returns the failing answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(503));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchRetry('https://example.test/search.json', {}, opts);
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
