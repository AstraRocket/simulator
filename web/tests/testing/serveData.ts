import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';
import { DATA_DIR } from './dataDir';

// The reply has only `json()`, no `body`, so `readJson` takes its non-streaming path.
export function serveData(): void {
  vi.stubGlobal('fetch', (input: unknown) => {
    const url = String(typeof input === 'object' && input && 'url' in input ? (input as { url: string }).url : input);
    // Strip the ?v=<hash> cache-buster; BASE_URL is not a real origin here.
    const file = url.split('?')[0]!.split('/').pop()!;
    let text: string;
    try {
      text = readFileSync(join(DATA_DIR, file), 'utf8');
    } catch {
      return Promise.resolve({ ok: false, status: 404, headers: new Headers(), json: () => Promise.resolve({}) });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve(JSON.parse(text)),
    });
  });
}
