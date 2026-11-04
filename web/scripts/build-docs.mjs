// The docs' assets are absolute paths, so DOCS_BASE_URL must derive from the app's PAGES_BASE.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const website = fileURLToPath(new URL('../../website/', import.meta.url));
// No shell (it splits an --out-dir with a space), and Windows will not spawn npx.cmd without one.
const core = createRequire(join(website, 'package.json')).resolve('@docusaurus/core/package.json');
const cli = join(dirname(core), 'bin', 'docusaurus.mjs');
const outDir = fileURLToPath(new URL('../public/docs', import.meta.url));

// Mirrors vite.config.ts.
const appBase = (process.env.PAGES_BASE || '/').replace(/\/*$/, '/');

const { status, error } = spawnSync(process.execPath, [cli, 'build', '--out-dir', outDir], {
  cwd: website,
  stdio: 'inherit',
  env: { ...process.env, DOCS_BASE_URL: `${appBase}docs/` },
});

if (error) throw error;
process.exit(status ?? 1);
