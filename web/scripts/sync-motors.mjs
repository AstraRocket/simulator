// Data © thrustcurve.org contributors and the certifying bodies (NAR/TRA/CAR).

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGED_MOTORS } from './lib/catalogStaging.mjs';
import { motorRow } from './lib/motorRow.mjs';
import { collidingRowKeys } from './lib/motorRowKey.mjs';
import { fetchRetry } from './lib/fetchRetry.mjs';
import { httpsFetch } from './lib/thrustcurveHttps.mjs';

const API = 'https://www.thrustcurve.org/api/v1';
const DATA_DIR = fileURLToPath(new URL('../public/data', import.meta.url));
const OUT = resolve(DATA_DIR, 'motors.generated.json');

// thrustcurve.org's Cloudflare limit is 3 requests per 10 s.
const PACE_MS = 5000;
let lastAnswerAt = 0;

async function post(path, body) {
  const wait = lastAnswerAt + PACE_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  let res;
  try {
    res = await fetchRetry(
      `${API}/${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      { fetchImpl: httpsFetch },
    );
  } finally {
    lastAnswerAt = Date.now();
  }
  if (res.headers.get('cf-mitigated') === 'challenge') {
    throw new Error(
      `${path} → thrustcurve.org answered with a Cloudflare challenge (HTTP ${res.status}), which a script cannot pass`,
    );
  }
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/** Code-unit order, which no locale changes. */
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

/** `data: 'both'` also returns the raw file, whose loaded mass and CG are what OpenRocket uses. */
async function fetchSamples(ids) {
  const out = new Map();
  const { results: files = [] } = await post('download.json', { motorIds: ids, data: 'both', maxResults: 4000 });
  for (const f of files) {
    if (!f.samples || f.samples.length < 2) continue;
    if (!f.simfileId) throw new Error(`download.json: a file for motor ${f.motorId} has no simfileId`);
    if (!out.has(f.motorId)) out.set(f.motorId, []);
    out.get(f.motorId).push({
      simfileId: f.simfileId,
      source: f.source,
      format: f.format,
      samples: f.samples,
      data: f.data,
    });
  }
  return out;
}

// The search page cap: hitting it means the list was cut off.
const MAX_RESULTS = 5000;

async function assertSane(catalog, withCurves) {
  const problems = [];
  if (catalog.length === 0) problems.push('catalog is empty');
  const collisions = collidingRowKeys(catalog);
  if (collisions.length)
    problems.push(
      `${collisions.length} row-key collision(s) (manufacturer|designation|diameter|code): ${collisions.join(', ')}`,
    );
  if (catalog.length && withCurves / catalog.length < 0.8)
    problems.push(`only ${withCurves}/${catalog.length} motors have a bundled curve`);
  try {
    const prev = JSON.parse(await readFile(OUT, 'utf8'));
    if (Array.isArray(prev) && prev.length) {
      console.log(`Shrink floor: comparing ${catalog.length} against the ${prev.length} currently in ${OUT}.`);
      if (catalog.length < 0.9 * prev.length)
        problems.push(`catalog shrank from ${prev.length} to ${catalog.length} motors (baseline: ${OUT})`);
    }
  } catch {
    // Logged, because the shrink floor did not run.
    console.log(`Shrink floor: SKIPPED, no readable baseline at ${OUT}.`);
  }
  if (problems.length) throw new Error(`Refusing to write motors.generated.json: ${problems.join('; ')}`);
}

async function main() {
  // Out-of-production motors too, as desktop carries them.
  console.log('Fetching motors…');
  const { results: motors = [] } = await post('search.json', { availability: 'all', maxResults: MAX_RESULTS });
  console.log(`  ${motors.length} motors`);
  if (motors.length >= MAX_RESULTS)
    throw new Error(`search.json returned ${motors.length} motors, the page cap; raise MAX_RESULTS or page the query`);

  console.log('Fetching thrust curves…');
  const sampleMap = new Map();
  const batches = chunk(
    motors.map((m) => m.motorId),
    100,
  );
  let done = 0;
  for (const ids of batches) {
    const got = await fetchSamples(ids);
    for (const [id, v] of got) sampleMap.set(id, v);
    done += ids.length;
    process.stdout.write(`\r  ${done}/${motors.length} motors, ${sampleMap.size} with curves`);
  }
  console.log('');

  const catalog = motors
    .filter((m) => m.totImpulseNs > 0 && m.burnTimeS > 0)
    .map((m) => motorRow(m, sampleMap.get(m.motorId)))
    // Ties broken down to the unique row key, so API order does not change the manifest hash.
    .sort(
      (a, b) =>
        a.impulse - b.impulse ||
        a.designation.localeCompare(b.designation) ||
        cmp(a.manufacturer, b.manufacturer) ||
        a.diameter - b.diameter ||
        cmp(a.code ?? '', b.code ?? '') ||
        cmp(a.designation, b.designation),
    );

  const withCurves = catalog.filter((m) => m.curves).length;
  const noCurve = catalog.filter((m) => m.noCurve);
  await assertSane(catalog, withCurves);
  await writeFile(STAGED_MOTORS, JSON.stringify(catalog) + '\n');
  console.log(`\nStaged ${catalog.length} motors (${withCurves} with bundled curves) in ${STAGED_MOTORS}`);
  console.log('Run `npm run sync:motor-digests` to add their digests and write public/data/motors.generated.json.');
  if (noCurve.length) {
    console.log(`  ${noCurve.length} have NO bundled thrust curve (flagged noCurve):`);
    console.log(`    ${noCurve.map((m) => `${m.manufacturer} ${m.designation}`).join(', ')}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
