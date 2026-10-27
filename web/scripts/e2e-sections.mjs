#!/usr/bin/env node
/**
 * Runs the end-to-end suite one section at a time (SECTIONS in
 * lib/e2eSectionList.mjs), reports each section as it finishes, and ends with the
 * whole run in one table and every failure listed. After the Playwright
 * sections come the STEPS, the offline and update checks, which make their own
 * builds; each reports the same way.
 *
 *   npm run e2e:sections                        every section and step
 *   npm run e2e:sections -- --skip a11y         all but the axe scans
 *   npm run e2e:sections -- --skip update       all but the update flow check
 *   npm run e2e:sections -- --only aero,motors  just those
 *   npm run e2e:sections -- --list              the sections and their specs
 *
 * Anything after a bare `--` goes to Playwright (`-- --workers 8`).
 *
 * The app is built once and served once for every section (E2E_SERVED tells
 * playwright.config.ts not to start its own), at below-normal priority, which
 * the build, the server, Playwright and its browsers all inherit.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { constants, setPriority } from 'node:os';
import { dirname, join } from 'node:path';
import { SECTIONS, STEPS } from './lib/e2eSectionList.mjs';

const PORT = 5180;
const URL = `http://localhost:${PORT}`;
const require = createRequire(import.meta.url);
// Run by this same node, with no shell: Windows refuses to spawn npx.cmd
// without one, and a shell joins arguments unquoted.
const playwright = require.resolve('@playwright/test/cli');
// Its bin is not in the package's exports, so it is found beside package.json.
const vite = join(dirname(require.resolve('vite/package.json')), 'bin/vite.js');

const args = process.argv.slice(2);
const dash = args.indexOf('--');
const ours = dash < 0 ? args : args.slice(0, dash);
const passThrough = dash < 0 ? [] : args.slice(dash + 1);
const listOf = (flag) => {
  const i = ours.indexOf(flag);
  return i < 0 ? null : (ours[i + 1] ?? '').split(',').filter(Boolean);
};
const sectionNames = Object.keys(SECTIONS);
const names = [...sectionNames, ...Object.keys(STEPS)];

if (ours.includes('--list')) {
  for (const name of sectionNames) console.log(`${name} (${SECTIONS[name].length}): ${SECTIONS[name].join(', ')}`);
  for (const [name, file] of Object.entries(STEPS)) console.log(`${name} (step): scripts/${file}`);
  process.exit(0);
}

const only = listOf('--only');
const skip = listOf('--skip') ?? [];
for (const n of [...(only ?? []), ...skip]) {
  if (!names.includes(n)) {
    console.error(`No section "${n}". Sections: ${names.join(', ')}`);
    process.exit(2);
  }
}
const picked = names.filter((n) => (only ? only.includes(n) : true) && !skip.includes(n));
const left = names.filter((n) => !picked.includes(n));
const chosen = picked.filter((n) => n in SECTIONS);
const steps = picked.filter((n) => n in STEPS);

if (!process.env.CI) {
  try {
    setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // Not permitted here; the run goes on at normal priority.
  }
}

const portBusy = async () => {
  try {
    await fetch(URL);
    return true;
  } catch {
    return false;
  }
};
if (chosen.length && (await portBusy())) {
  console.error(`Port ${PORT} is already serving. Another end-to-end run is probably going; wait for it to finish.`);
  process.exit(2);
}

let server = null;
const stopServer = () => {
  if (server && !server.killed) server.kill();
};
process.on('exit', stopServer);
process.on('SIGINT', () => process.exit(130));

if (chosen.length) {
  console.log('Building the app…');
  const build = spawnSync(process.execPath, [vite, 'build'], { encoding: 'utf8' });
  if (build.status !== 0) {
    process.stdout.write(build.stdout ?? '');
    process.stderr.write(build.stderr ?? '');
    process.exit(build.status ?? 1);
  }

  server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  for (let tries = 0; !(await portBusy()); tries++) {
    if (tries > 120 || server.exitCode !== null) {
      console.error('The preview server did not start.');
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const fmtTime = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

/** Every test in a Playwright JSON report, with its spec's place. */
function testsOf(report) {
  const out = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        out.push({ status: t.status, where: `${spec.file}:${spec.line}`, title: spec.title, project: t.projectName });
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of report.suites ?? []) walk(s);
  return out;
}

const results = [];
for (const name of chosen) {
  const specs = SECTIONS[name];
  console.log(`\n━━ ${name} (${specs.length} spec${specs.length === 1 ? '' : 's'}) ━━`);
  const json = `test-results/${name}.json`;
  rmSync(json, { force: true });
  const started = Date.now();
  const run = spawnSync(
    process.execPath,
    [
      playwright,
      'test',
      ...specs.map((s) => `e2e/${s}.spec.ts`),
      '--reporter=line,json',
      `--output=test-results/${name}`,
      ...passThrough,
    ],
    { stdio: 'inherit', env: { ...process.env, E2E_SERVED: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: json } },
  );
  const ms = Date.now() - started;
  let tests = [];
  try {
    tests = testsOf(JSON.parse(readFileSync(json, 'utf8')));
  } catch {
    // No report: Playwright stopped before it wrote one. Counted as a failure below.
  }
  const count = (status) => tests.filter((t) => t.status === status).length;
  const r = {
    name,
    passed: count('expected'),
    failed: count('unexpected'),
    flaky: count('flaky'),
    skipped: count('skipped'),
    ms,
    failures: tests.filter((t) => t.status === 'unexpected'),
    broke: run.status !== 0 && tests.length === 0,
  };
  results.push(r);
  const verdict = r.broke
    ? 'did not run (see the output above)'
    : `${r.passed} passed, ${r.failed} failed, ${r.flaky} flaky, ${r.skipped} skipped`;
  console.log(`\n${r.failed || r.broke ? '✘' : '✓'} ${name}: ${verdict} in ${fmtTime(ms)}`);
  for (const f of r.failures) console.log(`    ✘ ${f.where} ${f.title} [${f.project}]`);
}

stopServer();

for (const name of steps) {
  console.log(`\n━━ ${name} (step: scripts/${STEPS[name]}) ━━`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [`scripts/${STEPS[name]}`], { stdio: 'inherit' });
  const ms = Date.now() - started;
  const ok = run.status === 0;
  results.push({
    name,
    passed: ok ? 1 : 0,
    failed: ok ? 0 : 1,
    flaky: 0,
    skipped: 0,
    ms,
    failures: ok
      ? []
      : [{ where: `scripts/${STEPS[name]}`, title: 'the check failed (see its output above)', project: 'step' }],
    broke: false,
  });
  console.log(`\n${ok ? '✓' : '✘'} ${name}: ${ok ? 'passed' : 'failed'} in ${fmtTime(ms)}`);
}

const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);
const width = Math.max(7, ...results.map((r) => r.name.length));
console.log('\n━━ Overall ━━');
console.log(
  `${pad('Section', width)}  ${padL('Passed', 6)}  ${padL('Failed', 6)}  ${padL('Flaky', 5)}  ${padL('Skipped', 7)}  Time`,
);
for (const r of results) {
  const failed = r.broke ? 'n/a' : r.failed;
  console.log(
    `${pad(r.name, width)}  ${padL(r.passed, 6)}  ${padL(failed, 6)}  ${padL(r.flaky, 5)}  ${padL(r.skipped, 7)}  ${fmtTime(r.ms)}`,
  );
}
const sum = (k) => results.reduce((a, r) => a + r[k], 0);
console.log(
  `${pad('Total', width)}  ${padL(sum('passed'), 6)}  ${padL(sum('failed'), 6)}  ${padL(sum('flaky'), 5)}  ${padL(sum('skipped'), 7)}  ${fmtTime(sum('ms'))}`,
);
if (left.length) console.log(`Not run: ${left.join(', ')}`);

const failures = results.flatMap((r) => r.failures.map((f) => ({ ...f, section: r.name })));
const broke = results.filter((r) => r.broke);
if (failures.length || broke.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f.section}: ${f.where} ${f.title} [${f.project}]`);
  for (const r of broke) console.log(`  ${r.name}: the section did not run`);
  console.log('\nEach section keeps its traces and error context under test-results/<section>/.');
}
process.exit(failures.length || broke.length ? 1 : 0);
