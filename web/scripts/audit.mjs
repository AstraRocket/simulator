// Usage: npm run audit [-- --jar <OpenRocket.jar>]. The last three steps need a JDK.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseBuild } from './lib/openrocketJava.mjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const VITEST = join(WEB, 'node_modules/vitest/vitest.mjs');
// Through the npm that launched this one: `npm.cmd` cannot be spawned without a shell.
const npmRun = (script) => run(process.execPath, [process.env.npm_execpath ?? 'npm', 'run', script]);
const work = mkdtempSync(join(tmpdir(), 'web-audit-'));
const samples = join(work, 'samples');

const run = (cmd, args, env = {}) =>
  spawnSync(cmd, args, { cwd: WEB, stdio: 'inherit', env: { ...process.env, ...env } }).status === 0;

const filesIn = (dir, ext, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) filesIn(full, ext, out);
    else if (entry.endsWith(ext)) out.push(full);
  }
  return out;
};

const passthrough = process.argv.slice(2);

const STEPS = [
  ['format', () => npmRun('format:check')],
  ['spell', () => npmRun('spell')],
  ['knip', () => npmRun('knip')],
  ['dupes', () => npmRun('dupes')],
  ['coverage', () => run(process.execPath, [VITEST, 'run', '--coverage'])],
  ['repo', () => run(process.execPath, [VITEST, 'run', 'tests/repo'], { REPO_CHECKS: '1' })],
  [
    'samples',
    () =>
      run(process.execPath, [VITEST, 'run', 'tests/services/files/orkDesktopSamples.test.ts'], {
        ORK_SAMPLES_DIR: samples,
      }),
  ],
  [
    'desktop',
    () =>
      run(process.execPath, [
        'scripts/check-ork-opens.mjs',
        ...passthrough,
        ...filesIn(samples, '.ork'),
        ...filesIn(samples, '.rkt'),
      ]),
  ],
  ['fields', () => run(process.execPath, ['scripts/check-desktop-fields.mjs', ...passthrough, samples])],
  [
    'helpers',
    () =>
      run('javac', [
        '-cp',
        chooseBuild().cp,
        '-d',
        join(work, 'classes'),
        ...filesIn(join(WEB, 'scripts'), '.java'),
        join(WEB, '../engine-java/src/api/java/api/ComponentFields.java'),
      ]),
  ],
];

let failed = null;
for (const [name, step] of STEPS) {
  console.log(`\n=== audit: ${name} ===`);
  if (!step()) {
    failed = name;
    break;
  }
}
rmSync(work, { recursive: true, force: true });
if (failed) {
  console.error(`\naudit: ${failed} FAILED`);
  process.exit(1);
}
console.log(`\naudit: all ${STEPS.length} web checks passed.`);
