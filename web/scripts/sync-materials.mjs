// Maintainer-only fields (`source`, `note`, `corrects`) are not shipped.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { arg } from './lib/args.mjs';
import { writeDataManifest } from './lib/dataManifest.mjs';

const DATA_DIR = fileURLToPath(new URL('../public/data', import.meta.url));
const OUT = join(DATA_DIR, 'materials.generated.json');
const APP_JSON = fileURLToPath(new URL('./data/materials.app.json', import.meta.url));
const ENGINE = fileURLToPath(new URL('../../engine-java/', import.meta.url));
const REL_JAVA = join('core', 'src', 'main', 'java', 'info', 'openrocket', 'core', 'database', 'Databases.java');

const die = (msg) => {
  console.error(`sync-materials: ${msg}`);
  process.exit(1);
};

const src = arg('src') ?? join(ENGINE, '.openrocket-src');
const javaPath = [join(src, REL_JAVA), join(src, 'info', 'openrocket', 'core', 'database', 'Databases.java')].find(
  existsSync,
);
if (!javaPath) {
  die(
    `could not find Databases.java under ${src}\n` +
      '  Pass --src <openrocket checkout>, or populate the engine extraction cache with\n' +
      '  `npm --prefix ../engine-java run extract:check`.',
  );
}

// Allows \" inside: upstream has Styrofoam \"Blue foam\" (XPS), which a naive [^"]* silently drops.
const MATERIAL =
  /newMaterial\(Type\.(BULK|SURFACE|LINE),\s*"((?:[^"\\]|\\.)*)",\s*([0-9.eE+-]+)[^)]*?MaterialGroup\.(\w+)/g;
const unescapeJava = (t) =>
  t.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(["'\\])/g, '$1');
const group = (g) => g.charAt(0) + g.slice(1).toLowerCase().replace(/_/g, ' ');

const java = readFileSync(javaPath, 'utf8');
const rows = [];
for (const m of java.matchAll(MATERIAL)) {
  rows.push({
    name: unescapeJava(m[2]),
    type: m[1].toLowerCase(),
    density: Number(m[3]),
    group: group(m[4]),
    kind: 'upstream',
  });
}

const calls = java.split('newMaterial(Type.').length - 1;
if (rows.length !== calls) die(`parsed ${rows.length} materials but the file makes ${calls} newMaterial calls`);
if (!rows.length) die(`no materials found in ${javaPath}`);
const upstreamCount = rows.length;

let app;
try {
  app = JSON.parse(readFileSync(APP_JSON, 'utf8')).materials;
} catch (e) {
  die(`cannot read ${APP_JSON}: ${e.message}`);
}
if (!Array.isArray(app)) die(`${APP_JSON} has no "materials" array`);

const key = (r) => `${r.type}\u0000${r.name}`;
const seen = new Set(rows.map(key));
for (const r of app) {
  for (const f of ['name', 'type', 'density', 'group', 'kind']) {
    if (r[f] === undefined) die(`app material ${JSON.stringify(r.name ?? r)} has no "${f}"`);
  }
  if (!r.source) die(`app material ${JSON.stringify(r.name)} has no "source"`);
  if (!(r.density > 0)) die(`app material ${JSON.stringify(r.name)} has a non-positive density`);
  // Shadowing an upstream name would silently re-weigh every design using it.
  if (seen.has(key(r))) die(`app material ${JSON.stringify(r.name)} (${r.type}) collides with an upstream material`);
  seen.add(key(r));
  rows.push({ name: r.name, type: r.type, density: r.density, group: r.group, kind: r.kind });
}

const byType = (t) => rows.filter((r) => r.type === t).length;
writeFileSync(OUT, `${JSON.stringify(rows)}\n`, 'utf8');
const manifest = writeDataManifest(DATA_DIR);
console.log(
  `sync-materials: wrote ${rows.length} materials (${byType('bulk')} bulk, ${byType('surface')} surface, ` +
    `${byType('line')} line) to public/data/materials.generated.json`,
);
console.log(`sync-materials:   ${upstreamCount} from ${javaPath}`);
console.log(`sync-materials:   ${rows.length - upstreamCount} from ${APP_JSON}`);
console.log(`sync-materials:   manifest hash ${manifest.materials}`);
