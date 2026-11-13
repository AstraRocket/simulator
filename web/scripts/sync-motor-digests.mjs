// Copied, not computed: the digest is an MD5 over desktop's own samples, which our curves do not match.
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGED_MOTORS, writeFileAtomic } from './lib/catalogStaging.mjs';
import { writeDataManifest } from './lib/dataManifest.mjs';
import { digestChanges, goneSection, motorProblems } from './lib/digestCoverage.mjs';
import { digestKey } from './lib/motorDigestKey.mjs';
import { motorRowKey } from './lib/motorRowKey.mjs';
import { rankEntries } from './lib/digestRank.mjs';
import { engineBuild, runDumper } from './lib/openrocketJava.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CATALOG = resolve(HERE, '../public/data/motors.generated.json');
const JAVA_SRC = resolve(HERE, 'motor-digests/MotorDump.java');

const LENGTH_TOLERANCE_MM = 2;

function dump(cp) {
  const index = new Map();
  for (const [
    ,
    allNames,
    designation,
    commonName,
    diameter,
    length,
    delays,
    impulse,
    burn,
    maxThrust,
    launchMass,
    digest,
  ] of runDumper({
    cp,
    javaSrc: JAVA_SRC,
    className: 'MotorDump',
  })) {
    const entry = {
      digest,
      delays: delays ? delays.split(',').map((d) => (d === 'P' ? 'P' : Number(d))) : [],
      lengthMm: Number(length) * 1000,
      impulse: Number(impulse),
      burn: Number(burn),
      maxThrust: Number(maxThrust),
      launchMass: Number(launchMass),
    };
    // A thrustcurve.org row may carry either the full code ("D24T") or the common name ("D24").
    for (const name of allNames.split('|')) {
      for (const d of new Set([designation, commonName])) {
        const k = digestKey(name, d, Number(diameter) * 1000);
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(entry);
      }
    }
  }
  return index;
}

const DIAMETER_REACH_MM = 1;

// The nearest diameter within a millimeter: thrustcurve.org states Apogee's micro motors at 10.5 mm, the build at 11.
function entriesAt(index, row) {
  for (let tenths = 0; tenths <= DIAMETER_REACH_MM * 10; tenths++) {
    for (const d of new Set([row.diameter - tenths / 10, row.diameter + tenths / 10])) {
      const found = index.get(digestKey(row.manufacturer, row.designation, d));
      if (found) return found;
    }
  }
  return undefined;
}

// Length only chooses among one name's entries: the build's database and thrustcurve.org record cases differently.
function entriesFor(index, row) {
  const found = entriesAt(index, row);
  if (!found) return null;
  if (row.length == null) return rankEntries(found, row);
  const gap = (e) => Math.abs(e.lengthMm - row.length);
  const close = found.filter((e) => gap(e) <= LENGTH_TOLERANCE_MM);
  if (close.length) return rankEntries(close, row);
  const nearest = Math.min(...found.map(gap));
  return rankEntries(
    found.filter((e) => gap(e) === nearest),
    row,
  );
}

const digestState = (m) => ({ key: motorRowKey(m), digested: Boolean(m.digests?.length) });

function main() {
  const { cp, label } = engineBuild();
  console.log(`reading motors from ${label}`);
  console.log('dumping motors:');
  const index = dump(cp);

  const previous = existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, 'utf8')) : null;
  const staged = existsSync(STAGED_MOTORS);
  const catalog = staged ? JSON.parse(readFileSync(STAGED_MOTORS, 'utf8')) : previous;
  if (!catalog) throw new Error(`nothing to add digests to: no ${STAGED_MOTORS} and no ${CATALOG}`);
  console.log(`catalog: ${staged ? 'staged by sync-motors' : CATALOG}`);
  // Before the loop edits `catalog`, which is `previous` itself when nothing is staged.
  const baseline = (Array.isArray(previous) ? previous : catalog).map(digestState);
  const before = baseline.filter((m) => m.digested).length;
  let hit = 0;
  let ambiguous = 0;
  for (const row of catalog) {
    const entries = entriesFor(index, row);
    if (entries) {
      row.digests = entries;
      hit++;
      if (entries.length > 1) ambiguous++;
    } else {
      delete row.digests;
    }
  }
  const { lost, gone } = digestChanges(baseline, catalog.map(digestState));
  const goneText = goneSection('Motors', gone);
  if (goneText) {
    console.log(goneText);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${goneText}\n`);
  }
  // A motor the build's database does not hold has no digest to give; only a lost match is a fault.
  const notInBuild = new Set(catalog.filter((row) => !entriesAt(index, row)).map(motorRowKey));
  const dropped = lost.filter((k) => notInBuild.has(k));
  if (dropped.length) {
    const text = `Not in this build's motor database, so no digest: ${dropped.join(', ')}`;
    console.log(text);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  }
  const unmatched = lost.filter((k) => !notInBuild.has(k));
  if (unmatched.length) {
    throw new Error(
      `refusing to write: ${unmatched.length} motors still in the catalog lost their digests (${unmatched.join(', ')}). Nothing written.`,
    );
  }
  const problems = motorProblems(catalog);
  if (problems.length) throw new Error(`refusing to write: ${problems.join('; ')}. Nothing written.`);
  writeFileAtomic(CATALOG, `${JSON.stringify(catalog)}\n`);
  writeDataManifest(dirname(CATALOG));
  rmSync(STAGED_MOTORS, { force: true });
  console.log(
    `digests: ${hit} of ${catalog.length} catalog motors (was ${before}), ${ambiguous} needing the delay to choose`,
  );
}

main();
