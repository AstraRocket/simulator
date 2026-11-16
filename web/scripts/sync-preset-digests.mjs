// The digest is an MD5 over properties as `ComponentPresetFactory` derives them, so it comes from Java, not JS.
import { appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGED_COMPONENTS, writeFileAtomic } from './lib/catalogStaging.mjs';
import { writeDataManifest } from './lib/dataManifest.mjs';
import { digestChanges, goneSection, partProblems, presetsWithoutRow } from './lib/digestCoverage.mjs';
import { builtInMaterials } from './lib/builtInMaterials.mjs';
import { engineBuild, runDumper } from './lib/openrocketJava.mjs';
import { presetVolumes } from './lib/presetVolume.mjs';
import { statedMassTally } from './lib/statedMass.mjs';
import { nearestMaterial } from './lib/nearestMaterial.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const CATALOG = resolve(HERE, '../public/data/components.generated.json');
const JAVA_SRC = resolve(HERE, 'preset-digests/PresetDump.java');

const appType = (kernelType) => kernelType.toLowerCase().replace(/_/g, '');

/** As `Manufacturer.matches` compares: "LOC Precision" and "LOC/Precision" are one. */
const makerKey = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const descKey = (desc) => desc.replace(/\s+/g, ' ').trim();

function pairs(field) {
  const out = {};
  for (const pair of field ? field.split(';') : []) {
    const at = pair.indexOf('=');
    if (at > 0) out[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return out;
}

const positive = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
/** Zero is allowed (a weightless line). */
const density = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

const SIZE_FIELDS = {
  OuterDiameter: ['outerDiameter'],
  InnerDiameter: ['innerDiameter'],
  Length: ['length', 'stripLength'],
  Diameter: ['diameter'],
  ForeOuterDiameter: ['foreOuterDiameter'],
  AftOuterDiameter: ['aftOuterDiameter'],
  Width: ['stripWidth'],
  Height: ['height'],
};

function sizeGap(row, geometry) {
  let gap = 0;
  for (const [key, value] of Object.entries(geometry)) {
    const field = SIZE_FIELDS[key]?.find((f) => typeof row[f] === 'number');
    if (!field) continue;
    const a = row[field];
    const b = Number(value);
    gap += Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
  }
  return gap;
}

const PARACHUTE_FIELDS = [
  'lineCount',
  'lineLength',
  'packedLength',
  'packedDiameter',
  'material',
  'materialDensity',
  'lineMaterial',
  'lineMaterialDensity',
];

/** What `Parachute.loadFromPreset` applies. */
function parachuteFields(field, builtIn) {
  const f = pairs(field);
  const out = {};
  const lineCount = positive(f.LineCount);
  const lineLength = positive(f.LineLength);
  if (lineCount != null) out.lineCount = lineCount;
  if (lineLength != null) out.lineLength = lineLength;
  const packedLength = positive(f.PackedLength);
  const packedDiameter = positive(f.PackedDiameter);
  if (packedLength != null) out.packedLength = packedLength;
  if (packedDiameter != null) out.packedDiameter = packedDiameter;
  if (f.Material && density(f.MaterialDensity) != null) {
    // Desktop weighs a zero-density canopy at nothing; take the nearest built-in.
    const nearest = Number(f.MaterialDensity) > 0 ? undefined : nearestMaterial('SURFACE', f.Material, builtIn);
    out.material = nearest?.material ?? f.Material;
    out.materialDensity = nearest?.materialDensity ?? Number(f.MaterialDensity);
  }
  if (f.LineMaterial && density(f.LineMaterialDensity) != null) {
    out.lineMaterial = f.LineMaterial;
    out.lineMaterialDensity = Number(f.LineMaterialDensity);
  }
  return out;
}

/** On a size tie, prefer a preset no earlier row took, so same-number parts each get their own digest. */
function dump(cp) {
  const builtIn = builtInMaterials(cp);
  const byPart = new Map();
  const presets = [];
  for (const [type, names, partNo, digest, mass, geometry, chute, legacy, massDensity, desc = ''] of runDumper({
    cp,
    javaSrc: JAVA_SRC,
    className: 'PresetDump',
  })) {
    const preset = {
      partNo,
      digest,
      mass: positive(mass),
      desc: descKey(desc),
      geometry: pairs(geometry),
      chute: chute ? parachuteFields(chute, builtIn) : null,
      legacy: legacy === 'true',
      // The dumper reports an infinite density when desktop has no volume.
      massHasVolume: massDensity === '' || Number.isFinite(Number(massDensity)),
    };
    presets.push({ digest, label: `${appType(type)} ${names.split('|')[0]} ${partNo.trim()} (${digest})` });
    for (const maker of new Set(names.split('|').map(makerKey))) {
      const key = JSON.stringify([appType(type), maker, partNo.trim()]);
      if (!byPart.has(key)) byPart.set(key, []);
      byPart.get(key).push(preset);
    }
  }
  const taken = new Set();
  const keyOf = (row) => JSON.stringify([row.type, makerKey(row.mfr), row.partNo.trim()]);
  const holds = (row) => byPart.has(keyOf(row));
  const presetFor = (row) => {
    const all = byPart.get(keyOf(row)) ?? [];
    const described = all.filter((p) => p.desc === descKey(row.desc));
    const candidates = described.length ? described : all.length === 1 ? all : [];
    let best;
    let bestGap = Infinity;
    for (const p of candidates) {
      const gap = sizeGap(row, p.geometry);
      const tie = Math.abs(gap - bestGap) < 1e-9;
      if ((!tie && gap < bestGap) || (tie && taken.has(best) && !taken.has(p))) [best, bestGap] = [p, gap];
    }
    if (best) taken.add(best);
    return best;
  };
  return { holds, presetFor, presets };
}

const digestState = (row) => ({ key: `${row.type}|${row.mfr}|${row.partNo.trim()}`, digested: Boolean(row.digest) });

async function main() {
  const { cp, label } = engineBuild();
  console.log(`reading presets from ${label}`);
  console.log('dumping presets:');
  const { holds, presetFor, presets } = dump(cp);
  const volumeOf = await presetVolumes();

  const previous = existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, 'utf8')) : null;
  const staged = existsSync(STAGED_COMPONENTS);
  const catalog = staged ? JSON.parse(readFileSync(STAGED_COMPONENTS, 'utf8')) : structuredClone(previous);
  if (!catalog) throw new Error(`nothing to add digests to: no ${STAGED_COMPONENTS} and no ${CATALOG}`);
  console.log(`catalog: ${staged ? `staged by sync-components (${catalog.generated})` : CATALOG}`);
  const baseline = (previous?.components ?? catalog.components).map(digestState);
  const before = baseline.filter((c) => c.digested).length;

  const absent = catalog.components.filter((row) => !holds(row));
  if (absent.length) {
    console.log(
      `not in this build's library, removed: ${absent.map((r) => `${r.type} ${r.mfr} ${r.partNo}`).join(', ')}`,
    );
    catalog.components = catalog.components.filter((row) => holds(row));
    catalog.count = catalog.components.length;
  }
  let hit = 0;
  const masses = statedMassTally();
  for (const row of catalog.components) {
    const p = presetFor(row);
    if (p?.digest) {
      row.digest = p.digest;
      row.partNo = p.partNo;
      hit++;
    } else {
      delete row.digest;
    }
    if (p?.legacy) row.legacy = true;
    else delete row.legacy;
    if (row.type === 'parachute') {
      for (const k of PARACHUTE_FIELDS) delete row[k];
      Object.assign(row, p?.chute ?? {});
    }
    masses.apply(row, p?.mass, volumeOf, p?.massHasVolume ?? true);
  }
  const refusal = masses.refusal();
  if (refusal) throw new Error(refusal);
  if (masses.degenerate.length) {
    console.log(`stated masses the desktop gives no volume either, not applied: ${masses.degenerate.join(', ')}`);
  }
  const { lost, gone } = digestChanges(baseline, catalog.components.map(digestState));
  const goneText = goneSection('Parts', gone);
  if (goneText) {
    console.log(goneText);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${goneText}\n`);
  }
  if (lost.length) {
    throw new Error(
      `refusing to write: ${lost.length} parts still in the catalog lost their digests (${lost.join(', ')}). Nothing written.`,
    );
  }
  const withoutRow = presetsWithoutRow(presets, catalog.components);
  if (withoutRow.length) {
    throw new Error(
      `refusing to write: ${withoutRow.length} presets of the build have no row to carry their digest (${withoutRow.join(', ')}). Nothing written.`,
    );
  }
  const problems = partProblems(catalog.components);
  if (problems.length) throw new Error(`refusing to write: ${problems.join('; ')}. Nothing written.`);
  // The manifest hashes the whole file, so a new stamp would make every browser re-download it.
  if (previous && JSON.stringify(previous.components) === JSON.stringify(catalog.components)) {
    catalog.generated = previous.generated;
  }
  writeFileAtomic(CATALOG, `${JSON.stringify(catalog)}\n`);
  writeDataManifest(dirname(CATALOG));
  rmSync(STAGED_COMPONENTS, { force: true });
  console.log(
    `digests: ${hit} of ${catalog.count} catalog rows (was ${before}); stated masses applied: ${masses.massed}`,
  );
}

await main();
