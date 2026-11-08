#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET_COMPLETE, writeStdoutSync } from './stdout-sync.mjs';
import { gradleArgv, javaExe } from '../../gradle-exec.mjs';

const say = (line) => writeStdoutSync(line + '\n');

const wantJs = process.argv.includes('--js');
const wantWasm = process.argv.includes('--wasm');
const targets = wantJs === wantWasm ? ['js', 'wasm'] : wantJs ? ['js'] : ['wasm'];
const writeGolden = process.argv.includes('--golden');
const expectLinesAt = process.argv.indexOf('--expect-lines');
const expectLines = expectLinesAt === -1 ? null : Number(process.argv[expectLinesAt + 1]);
if (expectLines !== null && !(Number.isInteger(expectLines) && expectLines > 0)) {
  console.error(`parity: --expect-lines needs a positive whole number, got ${process.argv[expectLinesAt + 1]}`);
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = resolve(here, '..', '..');
const gradleEnv = { ...process.env };
if (process.env.JAVA_HOME && !existsSync(process.env.JAVA_HOME)) delete gradleEnv.JAVA_HOME;

// No daemon in CI: it holds the stdio pipe open and hangs the step. Must be the
// flag, since gradle.properties (daemon=true) outranks GRADLE_OPTS.
const NO_DAEMON = process.env.CI ? ['--no-daemon'] : [];

const gradle = (args) =>
  execFileSync(javaExe(gradleEnv), gradleArgv(engineRoot, args, gradleEnv), {
    cwd: engineRoot,
    env: gradleEnv,
    encoding: 'utf8',
  });

// Check the shipped binary: TeaVM links by reachability, so a harness build would differ.
console.error(`parity: building and vendoring the engine (${targets.join(' + ')}) …`);
execFileSync(process.execPath, [join(engineRoot, 'build-engine.mjs'), ...targets.map((t) => `--${t}`)], {
  cwd: engineRoot,
  env: gradleEnv,
  stdio: ['ignore', process.stderr, 'inherit'],
});
console.error('parity: running JVM reference (parityJvm) …');
const jvmRaw = gradle(['parityJvm', '--quiet', '--console=plain', ...NO_DAEMON]);

const webRoot = resolve(engineRoot, '..', 'web');
const jsPath = join(webRoot, 'src', 'engine', 'vendor', 'openrocket-engine.mjs');
const wasmPath = join(webRoot, 'public', 'engine', 'openrocket-engine.wasm');
const wasmRuntimePath = join(webRoot, 'public', 'engine', 'openrocket-engine.wasm-runtime.js');
const runnerPath = join(here, 'run-target.mjs');

const TARGET_TIMEOUT_MS = 2 * 60 * 1000;

// In a child because loading WASM-GC on Linux makes a process unexitable; the child
// is SIGKILLed, so success is the TARGET_COMPLETE sentinel, not the exit status.
function runTarget(target) {
  const needed = target === 'wasm' ? [wasmPath, wasmRuntimePath] : [jsPath];
  for (const p of needed) {
    if (!existsSync(p)) {
      console.error(`parity: TeaVM output missing: ${p}`);
      process.exit(1);
    }
  }

  const r = spawnSync(process.execPath, [runnerPath, target], {
    cwd: engineRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: TARGET_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });

  if (r.stderr) process.stderr.write(r.stderr);

  const lines = (r.stdout ?? '').split(/\r?\n/);
  const end = lines.lastIndexOf(TARGET_COMPLETE);
  if (end !== -1) return lines.slice(0, end).join('\n');

  if (r.error && r.error.code === 'ETIMEDOUT') {
    console.error(`parity: the ${target} target produced no result within ${TARGET_TIMEOUT_MS / 1000}s.`);
  } else if (r.error) {
    console.error(`parity: could not run the ${target} target: ${r.error.message}`);
  } else if (r.signal) {
    console.error(`parity: the ${target} target died on ${r.signal} before finishing.`);
  } else {
    console.error(`parity: the ${target} target exited ${r.status} without finishing.`);
  }
  process.exit(1);
}

const norm = (s) => s.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
const jvm = norm(jvmRaw);

if (!jvm.length) {
  console.error('PARITY FAILURE: the JVM reference produced no output at all.');
  console.error('  Nothing was compared. This is a harness or build failure, not a pass.');
  process.exit(1);
}

const REL_TOL_DEFAULT = 1e-13;
// A ~1e-15 Math difference can flip an adaptive RK4 step choice, so 1e-9 fails; apogee drift reaches 1.9e-3.
const REL_TOL_FLIGHT = 5e-3;
const ABS_TOL_FLIGHT = 1e-4;
const REL_TOL_TURBULENT = 1e-2;  // gusty wind
const ABS_SLACK_SERIESLENS = 5;  // gusty flights differ in sample count (about 1% of 539)

const GOLDEN_TOL_SCALE = 0.6; // 5e-3 -> 3e-3, 1e-2 -> 6e-3

function linesMatch(a, b, forGolden = false) {
  if (a === b) return 'exact';
  if (a === undefined || b === undefined) return false;
  const fa = a.split('|');
  const fb = b.split('|');
  if (fa.length !== fb.length || fa[0] !== fb[0]) return false;
  const isFlight = fa[0].startsWith('flight.');
  if (forGolden && !isFlight) return false;
  const isTurbulent = fa[0].startsWith('flight.conditions');
  const isSeriesLens = fa[0] === 'flight.conditions.serieslens';
  const scale = forGolden ? GOLDEN_TOL_SCALE : 1;
  const relTol = (isTurbulent ? REL_TOL_TURBULENT : isFlight ? REL_TOL_FLIGHT : REL_TOL_DEFAULT) * scale;
  const absTol = isSeriesLens ? ABS_SLACK_SERIESLENS : isFlight ? ABS_TOL_FLIGHT * scale : 0;
  let ulp = false;
  for (let i = 1; i < fa.length; i++) {
    if (fa[i] === fb[i]) continue;
    const na = Number(fa[i]);
    const nb = Number(fb[i]);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
    const absDiff = Math.abs(na - nb);
    const denom = Math.max(Math.abs(na), Math.abs(nb));
    if (absDiff > absTol && absDiff / denom > relTol) return false;
    ulp = true;
  }
  return ulp ? 'ulp' : false;
}

const label = targets.length > 1 ? (t) => ` [${t}]` : () => '';
for (const target of targets) {
  const out = norm(runTarget(target));
  let failures = 0;
  let ulpLines = 0;
  let exactLines = 0;
  const n = Math.max(jvm.length, out.length);
  if (n === 0) {
    console.error(`PARITY FAILURE${label(target)}: no output from either side.`);
    process.exit(1);
  }
  for (let i = 0; i < n; i++) {
    const m = linesMatch(jvm[i], out[i]);
    if (m === 'exact') exactLines++;
    else if (m === 'ulp') ulpLines++;
    else {
      if (failures < 10) {
        console.error(`DIFF${label(target)} line ${i + 1}:\n  jvm: ${jvm[i] ?? '<missing>'}\n  ${target.padEnd(3)}: ${out[i] ?? '<missing>'}`);
      }
      failures++;
    }
  }

  if (failures) {
    console.error(`\nPARITY FAILURE${label(target)}: ${failures} mismatched line(s) of ${n}.`);
    process.exit(1);
  }
  say(`parity ok${label(target)}: ${n} lines (${exactLines} bit-identical, ${ulpLines} within ULP tolerance)`);
}

// An exception thrown identically on every platform compares as ok.
const exceptions = jvm.filter((l) => l.includes('EXCEPTION:'));
if (exceptions.length) {
  console.error(`PARITY FAILURE: ${exceptions.length} scenario(s) threw instead of flying:`);
  exceptions.slice(0, 10).forEach((l) => console.error(`  ${l}`));
  process.exit(1);
}

const goldenPath = join(here, 'golden.txt');
const GOLDEN_MAGIC = '# golden v1';

const goldenDigest = (lines) => createHash('sha256').update(lines.join('\n') + '\n').digest('hex');

const readGolden = () => {
  const all = readFileSync(goldenPath, 'utf8').split(/\r?\n/).map((l) => l.trimEnd());
  return {
    header: all.find((l) => l.startsWith(GOLDEN_MAGIC)) ?? null,
    data: all.filter((l) => l && !l.startsWith('#')),
  };
};

const compareGolden = (golden, what) => {
  let moved = 0;
  let banded = 0;
  const gn = Math.max(golden.length, jvm.length);
  for (let i = 0; i < gn; i++) {
    const m = linesMatch(golden[i], jvm[i], true);
    if (m === 'ulp') banded++;
    if (!m) {
      if (moved < 10) {
        console.error(`${what} line ${i + 1}:`);
        console.error(`  expected: ${golden[i] ?? '<missing>'}`);
        console.error(`  actual  : ${jvm[i] ?? '<missing>'}`);
      }
      moved++;
    }
  }
  return { moved, gn, banded };
};

const platform = () => {
  // `java -version` writes to stderr.
  const r = spawnSync(javaExe(gradleEnv), ['-version'], { encoding: 'utf8' });
  const java = `${r.stderr ?? ''}${r.stdout ?? ''}`.split(/\r?\n/)[0] || 'unknown';
  return `${process.platform}-${process.arch} ${java.trim().replace(/\s+/g, '_')}`;
};

if (writeGolden) {
  if (existsSync(goldenPath)) {
    const { data } = readGolden();
    const { moved, gn } = compareGolden(data, 'GOLDEN MOVED');
    say(moved
      ? `parity: --golden is overwriting ${moved} moved value(s) of ${gn}. Be ready to say why they moved.`
      : 'parity: --golden rewrote an unchanged golden (no values moved).');
  }
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: engineRoot, encoding: 'utf8' }).trim();
  } catch { /* no git */ }
  const header = [
    `${GOLDEN_MAGIC} sha256=${goldenDigest(jvm)} lines=${jvm.length} generated=${new Date().toISOString()} commit=${commit}`,
    `# recorded on: ${platform()}`,
    '# The JVM reference output, recorded deliberately with `npm run parity:golden`.',
    '# parity.mjs re-verifies the sha256 above on every run, so a hand-edited value',
    '# here fails the gate instead of quietly becoming the new truth.',
    '',
  ].join('\n');
  writeFileSync(goldenPath, `${header}${jvm.join('\n')}\n`);
  say(`parity: wrote ${jvm.length} golden line(s) -> test/parity/golden.txt`);
} else if (!existsSync(goldenPath)) {
  console.error('PARITY FAILURE: test/parity/golden.txt is missing.');
  console.error('  The physics gate cannot run. If this is a first-time setup, create it');
  console.error('  with `npm run parity:golden`; otherwise restore it, because deleting it');
  console.error('  is indistinguishable from switching the gate off.');
  process.exit(1);
} else {
  const { header, data } = readGolden();
  if (!header) {
    console.error('PARITY FAILURE: golden.txt has no provenance header.');
    console.error('  Re-record it with `npm run parity:golden`.');
    process.exit(1);
  }
  const claimed = /sha256=([0-9a-f]{64})/.exec(header);
  if (!claimed) {
    console.error(`PARITY FAILURE: golden.txt header carries no sha256:\n  ${header}`);
    process.exit(1);
  }
  const actual = goldenDigest(data);
  if (actual !== claimed[1]) {
    console.error('PARITY FAILURE: golden.txt does not match its own sha256.');
    console.error(`  header: ${claimed[1]}`);
    console.error(`  actual: ${actual}`);
    console.error('  The file was edited by hand. Re-record it with `npm run parity:golden`');
    console.error('  so the change is a deliberate, reviewable regeneration.');
    process.exit(1);
  }
  if (expectLines !== null && data.length !== expectLines) {
    console.error(`GOLDEN FAILURE: expected ${expectLines} reference value(s), golden.txt holds ${data.length}.`);
    console.error('  The set of checked values changed shape. If that was deliberate, update');
    console.error('  --expect-lines in engine-java/audit.mjs and say why in review.');
    process.exit(1);
  }
  const { moved, gn, banded } = compareGolden(data, 'GOLDEN');
  if (moved) {
    console.error(`GOLDEN FAILURE: ${moved} value(s) of ${gn} moved.`);
    console.error('The physics changed. If that was deliberate, re-run with --golden; the');
    console.error('moved values are listed above, so the reason for each can be checked.');
    process.exit(1);
  }
  say(`golden ok: ${data.length} reference value(s) unchanged (${data.length - banded} bit-identical, ${banded} flight line(s) within tolerance)`);
  if (banded) {
    const rec = readFileSync(goldenPath, 'utf8').match(/^# recorded on: (.*)$/m);
    say(`  the golden was recorded on ${rec ? rec[1] : 'an unrecorded platform'}; this run is ${platform()}`);
  }
}

// Never load a TeaVM target here: after WASM-GC loads on Linux only a signal exits.
process.exit(0);
