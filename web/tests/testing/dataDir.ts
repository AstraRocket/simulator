import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Not `import.meta.url` (an http URL under jsdom) nor bare `process.cwd()` (wherever vitest ran).
function findDataDir(): string {
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, 'public', 'data');
    if (existsSync(join(candidate, 'materials.generated.json'))) return candidate;
    const up = dirname(dir);
    if (up === dir) throw new Error('could not find public/data - run `npm run sync:materials`');
    dir = up;
  }
}

export const DATA_DIR = findDataDir();

export function readData<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
}
