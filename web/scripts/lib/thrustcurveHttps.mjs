// A fetch-shaped transport for thrustcurve.org built on node:https.
//
// thrustcurve.org went behind Cloudflare on 2026-10-27. Node's built-in fetch
// (undici) draws a Cloudflare challenge on its first request, while node:https
// sending only Host + User-Agent, with no ALPN, gets HTTP 200; adding undici's
// headers and ALPN brings the challenge back (found in the mmrocket-sim review,
// 2026-10-29, where the site's operator approved the approach for that client).
// So this sends only the headers it is given plus Content-Length, opens a fresh
// connection per request, and asks for no compression.

import https from 'node:https';

export const USER_AGENT = 'astrarocket-sync-motors';
export const DEADLINE_MS = 120_000;
/** A full search or a 100-motor download batch fits well inside this. */
export const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;

export function httpsFetch(url, init = {}, request = https.request) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.host !== 'www.thrustcurve.org')
    throw new Error(`httpsFetch only sends to https://www.thrustcurve.org, not ${target.origin}`);
  if (init.body !== undefined && typeof init.body !== 'string') throw new TypeError('httpsFetch needs a string body');

  const headers = new Headers(init.headers);
  if (!headers.has('user-agent')) headers.set('user-agent', USER_AGENT);
  if (init.body !== undefined) headers.set('content-length', String(Buffer.byteLength(init.body, 'utf8')));

  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const fail = (err) => {
      done(reject, err);
      req?.destroy();
    };
    const timer = setTimeout(
      () => fail(new Error(`${url}: no complete answer within ${DEADLINE_MS / 1000} s`)),
      DEADLINE_MS,
    );

    try {
      req = request(
        target,
        { method: init.method ?? 'GET', headers: Object.fromEntries(headers), agent: false },
        (res) => {
          const encoding = res.headers['content-encoding']?.trim().toLowerCase();
          if (encoding && encoding !== 'identity') {
            fail(new Error(`${url}: unexpected Content-Encoding ${encoding}`));
            return;
          }
          const chunks = [];
          let bytes = 0;
          res.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > MAX_RESPONSE_BYTES) fail(new Error(`${url}: answer is over ${MAX_RESPONSE_BYTES} bytes`));
            else chunks.push(chunk);
          });
          res.on('error', fail);
          res.on('aborted', () => fail(new Error(`${url}: answer cut off`)));
          res.on('end', () => {
            const text = Buffer.concat(chunks, bytes).toString('utf8');
            done(resolve, {
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              headers: new Headers(res.headers),
              text: async () => text,
              json: async () => JSON.parse(text),
            });
          });
        },
      );
      req.on('error', fail);
      req.end(init.body);
    } catch (err) {
      fail(err);
    }
  });
}
