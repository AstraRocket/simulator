// sync-components refuses `.orc` files that differ from the release jar's, so bump the commit with the release.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DATABASE } from './lib/openrocketRelease.mjs';

const DIR = fileURLToPath(new URL('../openrocket-database', import.meta.url));

const git = (...args) => execFileSync('git', args, { stdio: 'inherit' });

if (existsSync(DIR)) {
  git('-C', DIR, 'remote', 'set-url', 'origin', DATABASE.url);
  git('-C', DIR, 'fetch', 'origin');
} else {
  git('clone', DATABASE.url, DIR);
}
git('-C', DIR, 'checkout', '--quiet', DATABASE.ref);
console.log(`openrocket-database at ${DATABASE.ref.slice(0, 7)} in ${DIR}`);
