import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineBuild } from './openrocketJava.mjs';

export const WEB = fileURLToPath(new URL('../..', import.meta.url));
const VITEST = join(WEB, 'node_modules/vitest/vitest.mjs');

export const run = (cmd, args, env = {}, cwd = WEB) =>
  spawnSync(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } }).status === 0;

// Through the npm that launched this one: `npm.cmd` cannot be spawned without a shell.
export const npmRun = (script, cwd = WEB) =>
  run(process.execPath, [process.env.npm_execpath ?? 'npm', 'run', script], {}, cwd);

const filesIn = (dir, ext, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) filesIn(full, ext, out);
    else if (entry.endsWith(ext)) out.push(full);
  }
  return out;
};

/** The checks CI does not run. `work` is an empty scratch folder the caller removes. */
export const auditSteps = (work) => {
  const samples = join(work, 'samples');
  return [
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
          ...filesIn(samples, '.ork'),
          ...filesIn(samples, '.rkt'),
        ]),
    ],
    ['fields', () => run(process.execPath, ['scripts/check-desktop-fields.mjs', samples])],
    [
      'helpers',
      () =>
        run('javac', [
          '-cp',
          engineBuild().cp,
          '-d',
          join(work, 'classes'),
          ...filesIn(join(WEB, 'scripts'), '.java'),
          join(WEB, '../engine-java/src/api/java/api/ComponentFields.java'),
        ]),
    ],
  ];
};
