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
import { chooseBuild, runDumper } from './lib/openrocketJava.mjs';

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

function entriesFor(index, row) {
  const found = index.get(digestKey(row.manufacturer, row.designation, row.diameter));
  if (!found) return null;
  const fits =
    row.length == null ? found : found.filter((e) => Math.abs(e.lengthMm - row.length) <= LENGTH_TOLERANCE_MM);
  return fits.length ? rankEntries(fits, row) : null;
}

const digestState = (m) => ({ key: motorRowKey(m), digested: Boolean(m.digests?.length) });

function main() {
  const { cp, label } = chooseBuild();
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
  if (lost.length) {
    throw new Error(
      `refusing to write: ${lost.length} motors still in the catalog lost their digests (${lost.join(', ')}). Nothing written.`,
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
