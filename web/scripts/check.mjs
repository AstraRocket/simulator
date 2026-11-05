// Usage: npm run check, for every test and check in the project, then one table. `npm run test:<step>` runs one step.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditSteps, npmRun, run, WEB } from './lib/checkSteps.mjs';
import { engineBuildProblem } from './lib/openrocketJava.mjs';

const VITE = join(WEB, 'node_modules/vite/bin/vite.js');
const work = mkdtempSync(join(tmpdir(), 'web-check-'));
const audit = Object.fromEntries(auditSteps(work));

// `desktop` saves the sample files it then opens, so those three cannot run apart.
const STEPS = {
  types: [() => npmRun('typecheck')],
  lint: [() => npmRun('lint')],
  build: [() => run(process.execPath, [VITE, 'build'])],
  docs: [() => npmRun('typecheck', join(WEB, '../website'))],
  format: [audit.format],
  spell: [audit.spell],
  knip: [audit.knip],
  dupes: [audit.dupes],
  unit: [() => npmRun('test')],
  repo: [audit.repo],
  desktop: [audit.samples, audit.desktop, audit.fields],
  helpers: [audit.helpers],
  // Every e2e spec, and the offline and service worker checks.
  e2e: [() => npmRun('e2e:sections')],
  engine: [() => npmRun('audit', join(WEB, '../engine-java'))],
};
const NEEDS_OPENROCKET = ['desktop', 'helpers'];

const chosen = process.argv.slice(2);
const names = chosen.length ? chosen : Object.keys(STEPS);
const unknown = names.filter((n) => !STEPS[n]);
if (unknown.length) {
  console.error(`No step named ${unknown.join(', ')}. The steps: ${Object.keys(STEPS).join(', ')}.`);
  process.exit(2);
}

const problem = names.some((n) => NEEDS_OPENROCKET.includes(n)) && engineBuildProblem();
if (problem) {
  console.error(`${problem}\n\nBuild it, then run this again:\n  npm run openrocket:build`);
  process.exit(2);
}

// Every step runs, so one failure cannot hide the next.
const results = names.map((name) => {
  console.log(`\n=== check: ${name} ===`);
  const start = Date.now();
  let passed = false;
  try {
    passed = STEPS[name].every((part) => part());
  } catch (e) {
    console.error(e);
  }
  return { name, passed, seconds: Math.round((Date.now() - start) / 1000) };
});
rmSync(work, { recursive: true, force: true });

console.log('\n=== check: results ===');
for (const { name, passed, seconds } of results) {
  console.log(`${passed ? 'pass' : 'FAIL'}  ${name.padEnd(18)} ${String(seconds).padStart(5)} s`);
}
const failed = results.filter((r) => !r.passed);
console.log(failed.length ? `\n${failed.length} of ${results.length} FAILED` : `\nall ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
