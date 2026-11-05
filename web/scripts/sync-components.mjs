// Desktop keeps every part, duplicates included (told apart by digest), so this does too.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { STAGED_COMPONENTS } from './lib/catalogStaging.mjs';
import { nearestMaterial } from './lib/nearestMaterial.mjs';
import { arg } from './lib/args.mjs';
import { builtInMaterials } from './lib/builtInMaterials.mjs';
import { installedJar } from './lib/openrocketJava.mjs';
import { checkJar, RELEASE, UNPINNED } from './lib/openrocketRelease.mjs';
import { byFileName, lenM, num, str, tag, xmlText } from './lib/orcText.mjs';
import { uniqueRows } from './lib/partRows.mjs';

const DEFAULT_SRC = fileURLToPath(new URL('../openrocket-database/orc', import.meta.url));
const SRC = arg('src') ?? (process.env.OPENROCKET_PRESETS || DEFAULT_SRC);
const DATA_DIR = fileURLToPath(new URL('../public/data', import.meta.url));
const OUT = resolve(DATA_DIR, 'components.generated.json');

const MASS = { g: 0.001, kg: 1, oz: 0.028349523125, lb: 0.45359237, '': 1 };

const materialRef = (block) => {
  const m = [...block.matchAll(/<Material(\s+[^>]*)?>([^<]*)<\/Material>/g)].at(-1);
  const name = m && xmlText(m[2]).trim();
  if (!name) return null;
  const type = (m[1] || '').match(/Type="([^"]*)"/)?.[1] ?? 'BULK';
  // "[material:Name]": the catalog shows Name, but the part's own file defines it under the whole string.
  const ref = name.match(/^\[material:(.+)\]$/);
  return { name: ref ? ref[1] : name, raw: name, type };
};

function blocks(text, name) {
  return text.match(new RegExp(`<${name}>[\\s\\S]*?</${name}>`, 'g')) ?? [];
}

const orcFiles = (dir) =>
  byFileName(
    readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.orc'))
      .map((f) => ({ name: f, text: readFileSync(join(dir, f), 'utf8') })),
  );

function jarFiles(entries, prefix) {
  return byFileName(
    Object.entries(entries)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, bytes]) => ({ name: name.slice(prefix.length), text: new TextDecoder().decode(bytes) })),
  );
}

function releaseJar() {
  const jar = arg('jar') ?? process.env.OPENROCKET_JAR ?? installedJar();
  if (!jar) {
    console.error(`No OpenRocket jar. Pass --jar <OpenRocket-${RELEASE}.jar>.`);
    process.exit(2);
  }
  checkJar(jar);
  return jar;
}

function shippedFiles() {
  const dir = arg('internal') ?? process.env.OPENROCKET_INTERNAL_PRESETS;
  if (dir) return { internal: orcFiles(dir), database: null, jar: null };
  const jar = releaseJar();
  const entries = unzipSync(readFileSync(jar), {
    filter: (f) => f.name.startsWith('datafiles/components/') && f.name.toLowerCase().endsWith('.orc'),
  });
  return {
    internal: jarFiles(entries, 'datafiles/components/internal/'),
    database: jarFiles(entries, 'datafiles/components/database/'),
    jar,
  };
}

const database = orcFiles(SRC);
const shipped = shippedFiles();

// Line endings differ between the repository and the jar; nothing else may.
if (shipped.database) {
  const lf = (s) => s.replace(/\r\n?/g, '\n');
  const ours = new Map(database.map((f) => [f.name, lf(f.text)]));
  const theirs = new Map(shipped.database.map((f) => [f.name, lf(f.text)]));
  const differ = [...new Set([...ours.keys(), ...theirs.keys()])]
    .filter((name) => ours.get(name) !== theirs.get(name))
    .sort();
  if (differ.length) {
    const msg = `${SRC} is not the parts database OpenRocket ${RELEASE} ships; these files differ: ${differ.join(', ')}`;
    if (!UNPINNED) {
      console.error(`${msg}\nRun \`npm run sync:database\` for the pinned commit.`);
      process.exit(1);
    }
    console.warn(`${msg}\nOPENROCKET_UNPINNED=1: using it anyway.`);
  }
} else {
  console.warn('Read the internal files from --internal, so the database is not compared with the release.');
}

const sources = [...database, ...shipped.internal];

const builtIn = builtInMaterials(shipped.jar ?? releaseJar());

// As `BaseComponentDTO.find`: own file first (legacy files reuse database names at other densities), then built-ins.
const fileMaterials = new Map();
for (const { name: file, text } of sources) {
  const own = new Map();
  fileMaterials.set(file, own);
  const section = text.match(/<Materials>([\s\S]*?)<\/Materials>/);
  if (!section) continue;
  for (const b of section[1].match(/<Material\b[^>]*>[\s\S]*?<\/Material>/g) ?? []) {
    const name = xmlText(b.match(/<Name>([^<]*)<\/Name>/)?.[1] ?? '').trim();
    const type = b.match(/<Type>([^<]*)<\/Type>/)?.[1]?.trim();
    const density = Number(b.match(/<Density>([^<]*)<\/Density>/)?.[1]);
    if (!name || !type || !Number.isFinite(density)) continue;
    // First definition wins, as desktop's lookup does.
    const key = `${type}\u0000${name}`;
    if (!own.has(key)) own.set(key, density);
  }
}

const { rows: components, push } = uniqueRows();
// Trimmed here though desktop keeps trailing spaces; sync-preset-digests restores desktop's spelling.
const common = (b) => ({
  mfr: str(b, 'Manufacturer') || '?',
  partNo: str(b, 'PartNumber') || '',
  desc: str(b, 'Description') || '',
});
let currentFile = '';
const withMaterial = (b) => {
  const ref = materialRef(b);
  if (!ref) return { material: undefined, materialDensity: 0 };
  // Own file by exact name; built-ins ignoring case (`Databases.findMaterial`).
  const density = fileMaterials.get(currentFile)?.get(`${ref.type}\u0000${ref.raw}`) ?? builtIn(ref.type, ref.name);
  if (density > 0) return { material: ref.name, materialDensity: density };
  return nearestMaterial(ref.type, ref.name, builtIn) ?? { material: ref.name, materialDensity: density ?? 0 };
};
const massKg = (block, name) => {
  const t = tag(block, name);
  if (!t || t.value === '') return null;
  const n = Number(t.value);
  return Number.isFinite(n) && n > 0 ? n * (MASS[t.unit] ?? 1) : null;
};

for (const { name: f, text } of sources) {
  currentFile = f;

  for (const b of blocks(text, 'BodyTube')) {
    const outerDiameter = lenM(b, 'OutsideDiameter');
    const length = lenM(b, 'Length');
    if (!outerDiameter || !length) continue;
    push({
      type: 'bodytube',
      ...common(b),
      ...withMaterial(b),
      outerDiameter,
      innerDiameter: lenM(b, 'InsideDiameter'),
      length,
    });
  }

  for (const b of blocks(text, 'NoseCone')) {
    const outerDiameter = lenM(b, 'OutsideDiameter');
    const length = lenM(b, 'Length');
    if (!outerDiameter || !length) continue;
    push({
      type: 'nosecone',
      ...common(b),
      ...withMaterial(b),
      shape: (str(b, 'Shape') || 'OGIVE').toLowerCase(),
      filled: str(b, 'Filled') === 'true',
      thickness: lenM(b, 'Thickness'),
      outerDiameter,
      length,
      shoulderDiameter: lenM(b, 'ShoulderDiameter'),
      shoulderLength: lenM(b, 'ShoulderLength'),
    });
  }

  // The element goes with the row so a part differing only in lines or packing is not deduplicated away.
  for (const b of blocks(text, 'Parachute')) {
    const diameter = lenM(b, 'Diameter');
    if (!diameter) continue;
    push({ type: 'parachute', ...common(b), diameter, cd: num(b, 'DragCoefficient') }, b);
  }

  for (const b of blocks(text, 'TubeCoupler')) {
    const outerDiameter = lenM(b, 'OutsideDiameter');
    const length = lenM(b, 'Length');
    if (!outerDiameter || !length) continue;
    push({
      type: 'tubecoupler',
      ...common(b),
      ...withMaterial(b),
      outerDiameter,
      innerDiameter: lenM(b, 'InsideDiameter'),
      length,
    });
  }

  for (const b of blocks(text, 'CenteringRing')) {
    const outerDiameter = lenM(b, 'OutsideDiameter');
    const length = lenM(b, 'Length');
    if (!outerDiameter || !length) continue;
    push({
      type: 'centeringring',
      ...common(b),
      ...withMaterial(b),
      outerDiameter,
      innerDiameter: lenM(b, 'InsideDiameter'),
      length,
    });
  }

  // One end may be 0 (a reversed nose cone sold as a transition), as desktop allows.
  for (const b of blocks(text, 'Transition')) {
    const foreOuterDiameter = lenM(b, 'ForeOutsideDiameter');
    const aftOuterDiameter = lenM(b, 'AftOutsideDiameter');
    const length = lenM(b, 'Length');
    if (foreOuterDiameter == null || aftOuterDiameter == null || !(length > 0)) continue;
    if (!(foreOuterDiameter > 0 || aftOuterDiameter > 0)) continue;
    push({
      type: 'transition',
      ...common(b),
      ...withMaterial(b),
      shape: (str(b, 'Shape') || 'CONICAL').toLowerCase(),
      filled: str(b, 'Filled') === 'true',
      thickness: lenM(b, 'Thickness'),
      length,
      foreOuterDiameter,
      foreShoulderDiameter: lenM(b, 'ForeShoulderDiameter'),
      foreShoulderLength: lenM(b, 'ForeShoulderLength'),
      aftOuterDiameter,
      aftShoulderDiameter: lenM(b, 'AftShoulderDiameter'),
      aftShoulderLength: lenM(b, 'AftShoulderLength'),
    });
  }

  for (const [tag, type] of [
    ['EngineBlock', 'engineblock'],
    ['LaunchLug', 'launchlug'],
  ]) {
    for (const b of blocks(text, tag)) {
      const outerDiameter = lenM(b, 'OutsideDiameter');
      const length = lenM(b, 'Length');
      if (!outerDiameter || !length) continue;
      push({
        type,
        ...common(b),
        ...withMaterial(b),
        outerDiameter,
        innerDiameter: lenM(b, 'InsideDiameter'),
        length,
      });
    }
  }

  // Surface material: density is per square meter.
  for (const b of blocks(text, 'Streamer')) {
    const stripLength = lenM(b, 'Length');
    const stripWidth = lenM(b, 'Width');
    if (!stripLength || !stripWidth) continue;
    push({ type: 'streamer', ...common(b), ...withMaterial(b), stripLength, stripWidth });
  }

  for (const b of blocks(text, 'RailButton')) {
    const outerDiameter = lenM(b, 'OuterDiameter');
    const height = lenM(b, 'Height');
    if (!outerDiameter || !height) continue;
    const parts = ['Mass', 'ScrewMass', 'NutMass'].map((m) => massKg(b, m));
    const mass = parts.some((m) => m != null) ? parts.reduce((s, m) => s + (m ?? 0), 0) : undefined;
    const cd = num(b, 'DragCoefficient');
    push({
      type: 'railbutton',
      ...common(b),
      ...withMaterial(b),
      outerDiameter,
      innerDiameter: lenM(b, 'InnerDiameter'),
      height,
      baseHeight: lenM(b, 'BaseHeight'),
      flangeHeight: lenM(b, 'FlangeHeight'),
      screwHeight: lenM(b, 'ScrewHeight'),
      cd: cd != null && cd > 0 ? cd : null,
      ...(mass != null ? { mass } : {}),
    });
  }

  for (const b of blocks(text, 'BulkHead')) {
    const outerDiameter = lenM(b, 'OutsideDiameter');
    const length = lenM(b, 'Length');
    if (!outerDiameter || !length) continue;
    push({
      type: 'bulkhead',
      ...common(b),
      ...withMaterial(b),
      outerDiameter,
      length,
      filled: str(b, 'Filled') === 'true',
    });
  }
}

const byType = components.reduce((m, p) => ((m[p.type] = (m[p.type] ?? 0) + 1), m), {});
if (components.length === 0) {
  console.error(`Refusing to write components.generated.json: no components parsed from ${SRC}`);
  process.exit(1);
}
if (existsSync(OUT)) {
  let prev = null;
  try {
    prev = JSON.parse(readFileSync(OUT, 'utf8'));
  } catch {
    // Corrupt previous catalog: nothing to compare against.
  }
  if (Array.isArray(prev?.components) && components.length < 0.9 * prev.components.length) {
    console.error(
      `Refusing to write components.generated.json: catalog shrank from ${prev.components.length} to ${components.length}`,
    );
    process.exit(1);
  }
}
const generated = new Date().toISOString();
writeFileSync(STAGED_COMPONENTS, JSON.stringify({ generated, count: components.length, components }) + '\n');
console.log(`Staged ${components.length} components in ${STAGED_COMPONENTS}`, byType);
console.log('Run `npm run sync:preset-digests` to add their digests and write public/data/components.generated.json.');
