import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error - a plain .mjs build script helper, no types
import { httpsFetch, USER_AGENT, MAX_RESPONSE_BYTES } from '../../scripts/lib/thrustcurveHttps.mjs';

/**
 * thrustcurve.org challenges Node's fetch but answers node:https sending only
 * the headers it needs, so the motor sync talks to it through this transport.
 * The socket boundary is injected: nothing here connects.
 */
const URL_OK = 'https://www.thrustcurve.org/api/v1/search.json';

type Reply = { status?: number; headers?: Record<string, string>; chunks?: (string | Buffer)[] };

function fakeRequest(reply: Reply = {}) {
  const calls: { target: URL; options: any; body: unknown }[] = [];
  const request = vi.fn((target: URL, options: any, onResponse: (res: any) => void) => {
    const req = Object.assign(new EventEmitter(), {
      destroy: vi.fn(),
      end: (body: unknown) => {
        calls.push({ target, options, body });
        const res = Object.assign(new EventEmitter(), {
          statusCode: reply.status ?? 200,
          headers: reply.headers ?? { 'content-type': 'application/json' },
        });
        onResponse(res);
        for (const c of reply.chunks ?? ['{"ok":true}']) res.emit('data', Buffer.from(c));
        res.emit('end');
      },
    });
    return req;
  });
  return { request, calls };
}

describe('httpsFetch', () => {
  it('sends only the given headers, a User-Agent and Content-Length, on a fresh connection', async () => {
    const { request, calls } = fakeRequest();
    const body = JSON.stringify({ availability: 'all' });
    await httpsFetch(URL_OK, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, request);
    expect(calls).toHaveLength(1);
    const { options } = calls[0];
    expect(options.method).toBe('POST');
    expect(options.agent).toBe(false);
    expect(options.headers).toEqual({
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
      'content-length': String(Buffer.byteLength(body)),
    });
    expect(calls[0].body).toBe(body);
  });

  it('answers like fetch: ok, status, headers and a JSON body', async () => {
    const { request } = fakeRequest({ chunks: ['{"results":', '[1,2]}'] });
    const res = await httpsFetch(URL_OK, {}, request);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ results: [1, 2] });
  });

  it('passes a challenge through for the caller to see', async () => {
    const { request } = fakeRequest({
      status: 403,
      headers: { 'cf-mitigated': 'challenge' },
      chunks: ['Just a moment...'],
    });
    const res = await httpsFetch(URL_OK, {}, request);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.headers.get('cf-mitigated')).toBe('challenge');
  });

  it('refuses any host but www.thrustcurve.org, and plain http', () => {
    const { request } = fakeRequest();
    expect(() => httpsFetch('https://example.test/api', {}, request)).toThrow(/only sends to/);
    expect(() => httpsFetch('http://www.thrustcurve.org/api', {}, request)).toThrow(/only sends to/);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a compressed answer it did not ask for', async () => {
    const { request } = fakeRequest({ headers: { 'content-encoding': 'gzip' } });
    await expect(httpsFetch(URL_OK, {}, request)).rejects.toThrow(/Content-Encoding gzip/);
  });

  it('rejects an answer over the size cap', async () => {
    const big = Buffer.alloc(MAX_RESPONSE_BYTES + 1);
    const { request } = fakeRequest({ chunks: [big] });
    await expect(httpsFetch(URL_OK, {}, request)).rejects.toThrow(/over/);
  });

  it('rejects when the request fails', async () => {
    const request = vi.fn(() => {
      const req = Object.assign(new EventEmitter(), {
        destroy: vi.fn(),
        end: () => queueMicrotask(() => req.emit('error', new Error('ECONNRESET'))),
      });
      return req;
    });
    await expect(httpsFetch(URL_OK, {}, request)).rejects.toThrow('ECONNRESET');
  });
});
