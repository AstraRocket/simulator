import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const VENDORED = [
  '../web/src/engine/vendor/openrocket-engine.mjs',
  '../web/public/engine/openrocket-engine.wasm',
  '../web/public/engine/openrocket-engine.wasm-runtime.js',
];

const run = (cmd, args) => spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit' }).status === 0;
const node = (...args) => run(process.execPath, args);

const hashes = () =>
  VENDORED.map((f) =>
    createHash('sha256')
      .update(readFileSync(join(ROOT, f)))
      .digest('hex'),
  );

function rebuildMatches() {
  const before = hashes();
  if (!node('build-engine.mjs')) return false;
  const after = hashes();
  const changed = VENDORED.filter((_, i) => before[i] !== after[i]);
  for (const f of changed) console.error(`rebuilt differently: ${f}`);
  return changed.length === 0;
}

function upstream(key) {
  const text = readFileSync(new URL('extract/UPSTREAM', import.meta.url), 'utf8');
  return text.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, 'm'))?.[1];
}

function datesMatch() {
  const want = upstream('date');
  const ref = upstream('ref');
  const git = (fmt) =>
    execFileSync('git', ['-C', '.openrocket-src', 'log', '-1', `--format=${fmt}`, '--date=short', ref], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, TZ: 'UTC' },
    }).trim();
  const authored = git('%ad');
  const committed = git('%cd');
  if (want === authored || want === committed) {
    console.log(`date = ${want} matches the pinned commit.`);
    return true;
  }
  console.error(`UPSTREAM says date = ${want}; the pinned commit is authored ${authored}, committed ${committed}.`);
  return false;
}

const STEPS = [
  ['parity', () => node('test/parity/parity.mjs', '--expect-lines', '368')],
  ['committed', rebuildMatches],
  ['extract', () => node('extract/extract.mjs', '--check')],
  ['date', datesMatch],
  [
    'scorecards',
    () =>
      node('validation/score.mjs', '--check-floors') && node('validation/score.mjs', '--supersonic', '--check-floors'),
  ],
];

for (const [name, step] of STEPS) {
  console.log(`\n=== audit: ${name} ===`);
  if (!step()) {
    console.error(`\naudit: ${name} FAILED`);
    process.exit(1);
  }
}
console.log(`\naudit: all ${STEPS.length} engine checks passed.`);
