// The preview server and first-visit setup the offline and update-flow checks share.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB = fileURLToPath(new URL('../..', import.meta.url));
export const VITE = resolve(WEB, 'node_modules/vite/bin/vite.js');
const SETTINGS_KEY = 'astrarocket:settings:v1';

/** `vite preview` of `outDir`, resolved once `url` answers. */
export async function servePreview(outDir, port, url) {
  const child = spawn(process.execPath, [VITE, 'preview', '--outDir', outDir, '--port', String(port), '--strictPort'], {
    cwd: WEB,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return child;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error('preview server did not come up');
}

/** Marks the work-in-progress notice read, so it does not cover the page. */
export function acknowledgeWip(page) {
  return page.addInitScript((key) => {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(key) || '{}') ?? {};
    } catch {
      // a corrupt blob; the app discards it too, so start clean
    }
    try {
      localStorage.setItem(key, JSON.stringify({ ...stored, wipAcknowledged: true }));
    } catch {
      // about:blank has no storage; the real navigation runs this again
    }
  }, SETTINGS_KEY);
}
