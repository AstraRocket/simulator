import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { provision } from './provision.mjs';
import { gradleArgv, javaExe } from '../gradle-exec.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = join(here, '..');
const repoRoot = join(engineRoot, '..');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const fail = (m) => {
  console.error(`reference: ${m}`);
  process.exit(1);
};

const fixtureDir = join(here, 'fixtures');
const named = opt('--fixture', null);
const fixturePaths = named
  ? [resolve(named)]
  : readdirSync(fixtureDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(fixtureDir, f));
if (fixturePaths.length === 0) fail(`no fixtures in ${fixtureDir}`);
// Upstream apogee varies about 6e-8 relative run to run, so the tolerance sits above that.
const ALTITUDE_REL_TOL = Number(opt('--altitude-tol', '1e-5'));
/** Seconds. */
const TIME_ABS_TOL = Number(opt('--time-tol', '1e-6'));

const referenceLines = (fixturePath) => {
  provision();
  // Not gradlew.bat via `shell: true`: the fixture path can contain spaces.
  let out;
  try {
    out = execFileSync(
      javaExe(),
      gradleArgv(engineRoot, [
        '-p', 'reference',
        'reference',
        '--console=plain',
        '-q',
        `-PrefArgs=${fixturePath}`,
      ]),
      { cwd: engineRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (e) {
    console.error(e.stdout || '');
    console.error(e.stderr || '');
    fail('the upstream reference run failed (see above)');
  }
  // Gradle -q still prints javac notes; results are the prefixed lines only.
  const lines = out.split(/\r?\n/).filter((l) => l.startsWith('staged.'));
  if (lines.length === 0) fail('the upstream reference produced no result lines');
  return lines;
};

const shippedLines = async (fixturePath) => {
  // Silence TeaVM's stdout sinks.
  globalThis.$rt_putStdoutCustom ??= () => {};
  globalThis.$rt_putStderrCustom ??= () => {};
  const engine = await import(
    pathToFileURL(join(repoRoot, 'web', 'src', 'engine', 'vendor', 'openrocket-engine.mjs')).href
  );

  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const handle = engine.buildRocket(JSON.stringify(fixture.design));

  for (const m of fixture.motors ?? []) {
    engine.setMotorById(
      handle,
      m.mount,
      m.designation,
      m.diameter,
      m.length,
      m.times,
      m.thrusts,
      m.masses,
      m.cgX,
      m.ejectionDelay,
    );
  }
  for (const ig of fixture.ignition ?? []) {
    engine.setMotorIgnitionById(handle, ig.mount, ig.event, ig.delay);
  }

  const result = JSON.parse(engine.simulateJson(handle, JSON.stringify(fixture.options)));
  const branches = result.branches;
  if (!Array.isArray(branches)) fail('the shipped engine returned no branches');

  const lines = [`staged.branches|${branches.length}|${branches.map((b) => b.name).join('|')}`];
  branches.forEach((b, i) => {
    const events = (b.events ?? [])
      .map((e) => (e.source == null ? e.type : `${e.type}@${e.source}`))
      .join('|');
    lines.push(`staged.b${i}.events|${events}`);

    // From the series, as the reference computes it, not a summary field.
    const altitude = b.series?.altitude ?? [];
    let maxAltitude = 0;
    for (const v of altitude) {
      if (typeof v === 'number' && Number.isFinite(v) && v > maxAltitude) maxAltitude = v;
    }
    const separation = (b.events ?? []).find((e) => e.type === 'STAGE_SEPARATION');
    lines.push(`staged.b${i}|${maxAltitude}|${separation ? separation.time : NaN}`);
  });
  return lines;
};

const keyOf = (line) => line.slice(0, line.indexOf('|'));

const numeric = (line) => {
  const parts = line.split('|');
  return { maxAltitude: Number(parts[1]), separation: Number(parts[2]) };
};

const close = (a, b, relTol) => {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  const scale = Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
  return Math.abs(a - b) / scale <= relTol;
};

const closeAbs = (a, b, absTol) => {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= absTol;
};

const compareFixture = async (fixturePath) => {
  const label = basename(fixturePath);
  const reference = referenceLines(fixturePath);
  const shipped = await shippedLines(fixturePath);

  if (flag('--show')) {
    console.log(`--- ${label}: pristine upstream ---`);
    reference.forEach((l) => console.log(l));
    console.log(`--- ${label}: shipped engine ---`);
    shipped.forEach((l) => console.log(l));
    console.log('---');
  }

  const refByKey = new Map(reference.map((l) => [keyOf(l), l]));
  const shipByKey = new Map(shipped.map((l) => [keyOf(l), l]));
  const failures = [];

  // Shipped engine emits "[InnerTube.InnerTube]" for unnamed parts (Application.getTranslator); fail, don't normalize.
  for (const [key, line] of shipByKey) {
    if (!key.endsWith('.events')) continue;
    const unnamed = [...new Set(line.match(/@\[[^\]]+\]/g) ?? [])].map((u) => u.slice(1));
    if (unnamed.length > 0) {
      failures.push(
        `${key}: event source(s) ${unnamed.join(', ')} are untranslated machine keys,`
          + ' which means the fixture did not name those components.'
          + ' Give each one a "name" - comparing a default component name across the two'
          + ' sides tests the translator, not the flight.',
      );
    }
  }

  for (const [key, refLine] of refByKey) {
    const shipLine = shipByKey.get(key);
    if (shipLine === undefined) {
      failures.push(`${key}: upstream produced this line and the shipped engine did not`);
      continue;
    }
    if (!/^staged\.b\d+$/.test(key)) {
      if (refLine !== shipLine) {
        failures.push(`${key}: exact mismatch
    upstream: ${refLine}
    shipped:  ${shipLine}`);
      }
      continue;
    }
    const r = numeric(refLine);
    const sh = numeric(shipLine);
    if (!close(r.maxAltitude, sh.maxAltitude, ALTITUDE_REL_TOL)) {
      const rel = Math.abs(r.maxAltitude - sh.maxAltitude) / Math.max(Math.abs(r.maxAltitude), 1e-300);
      failures.push(
        `${key}: apogee ${r.maxAltitude} vs ${sh.maxAltitude}`
          + ` (${rel.toExponential(2)} relative, tolerance ${ALTITUDE_REL_TOL})`,
      );
    }
    if (!closeAbs(r.separation, sh.separation, TIME_ABS_TOL)) {
      failures.push(
        `${key}: separation time ${r.separation} vs ${sh.separation} (tolerance ${TIME_ABS_TOL} s)`,
      );
    }
  }

  for (const key of shipByKey.keys()) {
    if (!refByKey.has(key)) {
      failures.push(`${key}: the shipped engine produced this line and upstream did not`);
    }
  }

  return { label, lines: refByKey.size, failures };
};

let failed = 0;
for (const fixturePath of fixturePaths) {
  const { label, lines, failures } = await compareFixture(fixturePath);
  if (failures.length > 0) {
    failed += 1;
    console.error(`
reference: ${label} - ${failures.length} disagreement(s) with pristine upstream:
`);
    failures.forEach((f) => console.error(`  ${f}`));
    console.error('');
  } else {
    console.log(`reference: ${label} - agrees with pristine upstream on ${lines} line(s)`);
  }
}

if (failed > 0) {
  console.error(`reference: ${failed} of ${fixturePaths.length} fixture(s) disagree`);
  process.exit(1);
}
console.log(
  `reference: ${fixturePaths.length} fixture(s) agree`
    + ` (apogee within ${ALTITUDE_REL_TOL} relative, event sequences exact)`,
);
