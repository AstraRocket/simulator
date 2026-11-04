// Staged names carry a hash of the checkout, since the OS temp directory is shared by every worktree.
import { createHash } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECKOUT = fileURLToPath(new URL('../..', import.meta.url));

// Case-folded on Windows so one checkout reached two ways stages to one file.
export function stagedPath(catalog, checkout = CHECKOUT) {
  const path = resolve(checkout);
  const key = createHash('sha256')
    .update(process.platform === 'win32' ? path.toLowerCase() : path)
    .digest('hex')
    .slice(0, 12);
  return join(tmpdir(), `astrarocket-${key}-${catalog}.staged.json`);
}

export const STAGED_COMPONENTS = stagedPath('components');

export const STAGED_MOTORS = stagedPath('motors');

export function writeFileAtomic(path, text) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
