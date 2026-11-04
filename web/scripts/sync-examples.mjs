// Pulled from the engine's UPSTREAM commit so an example never needs a feature the bundled kernel lacks.
// --src must be a full checkout: the extractor's .openrocket-src is sparse to core/src/main/java.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { arg } from './lib/args.mjs';
import { xmlText } from './lib/orcText.mjs';

const OUT_DIR = fileURLToPath(new URL('../public/examples', import.meta.url));
const UPSTREAM = fileURLToPath(new URL('../../engine-java/extract/UPSTREAM', import.meta.url));
const EXAMPLES_PATH = 'core/src/main/resources/datafiles/examples';

function pinnedUpstream() {
  const text = readFileSync(UPSTREAM, 'utf8');
  const field = (k) => text.match(new RegExp(`^${k}\\s*=\\s*(\\S+)`, 'm'))?.[1];
  const repo = field('repo');
  const ref = arg('ref') ?? field('ref');
  if (!repo || !ref) throw new Error(`Could not read repo/ref from ${UPSTREAM}`);
  const slug = repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
  return { slug, ref };
}

async function fetchExamples() {
  const src = arg('src') ?? process.env.OPENROCKET_SRC;
  if (src) {
    const dir = resolve(src, EXAMPLES_PATH);
    if (!existsSync(dir)) throw new Error(`No examples under ${dir}. Is --src a full OpenRocket checkout?`);
    return readdirSync(dir)
      .filter((n) => n.toLowerCase().endsWith('.ork'))
      .map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(dir, name))) }));
  }

  const { slug, ref } = pinnedUpstream();
  console.log(`examples: ${slug} @ ${ref.slice(0, 12)}`);
  const listing = await fetch(`https://api.github.com/repos/${slug}/contents/${EXAMPLES_PATH}?ref=${ref}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'astrarocket-sync-examples' },
  });
  if (!listing.ok) throw new Error(`GitHub listing failed: ${listing.status} ${listing.statusText}`);
  const entries = (await listing.json()).filter((e) => e.type === 'file' && e.name.toLowerCase().endsWith('.ork'));

  const out = [];
  for (const e of entries) {
    const res = await fetch(e.download_url, { headers: { 'user-agent': 'astrarocket-sync-examples' } });
    if (!res.ok) throw new Error(`Download failed for ${e.name}: ${res.status}`);
    out.push({ name: e.name, bytes: new Uint8Array(await res.arrayBuffer()) });
  }
  return out;
}

const slugify = (filename) =>
  filename
    .replace(/\.ork$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** From the rocket element's own header, not a descendant's. */
function headerTag(xml, tag) {
  const head = xml.match(/<rocket>[\s\S]*?<subcomponents>/)?.[0] ?? '';
  const raw = head.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1];
  if (raw == null) return null;
  const text = xmlText(raw).replace(/\s+/g, ' ').trim();
  return text || null;
}

// The simulation-extension examples rely on desktop plugins that do not run here, so upstream's text would mislead.
const DESCRIPTIONS = {
  'a-simple-model-rocket': 'A three-fin, one-motor beginner design. The smallest complete rocket in the set.',
  'parallel-booster-staging': 'Strap-on boosters that separate in flight, built as parallel stages.',
  'tube-fin-rocket': 'Tube fins instead of flat ones: six body tubes around the airframe in place of a fin set.',
  'simulation-extensions':
    'A roll-control airframe from OpenRocket, with canards and an airstart. Upstream flies it with a desktop simulation extension that steers the canards; that extension does not run here, so it flies as the plain airframe.',
  'simulation-scripting':
    'The roll-control airframe again, scripted in JavaScript upstream. As above, the script does not run here and it flies as the plain airframe.',
};

function stripFlightData(bytes) {
  const files = unzipSync(bytes);
  const out = {};
  for (const [name, content] of Object.entries(files)) {
    if (!name.toLowerCase().endsWith('.ork')) {
      out[name] = content;
      continue;
    }
    const xml = strFromU8(content)
      .replace(/<flightdata\b[^>]*\/>/g, '')
      .replace(/<flightdata\b[\s\S]*?<\/flightdata>/g, '');
    out[name] = strToU8(xml);
  }
  return { zip: zipSync(out, { level: 9 }), xml: strFromU8(out[Object.keys(out).find((n) => n.endsWith('.ork'))]) };
}

const sources = await fetchExamples();
if (sources.length === 0) {
  console.error('Refusing to write examples: none found upstream.');
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

const examples = [];
let before = 0;
for (const { name, bytes } of sources.sort((a, b) => a.name.localeCompare(b.name))) {
  before += bytes.length;
  const { zip, xml } = stripFlightData(bytes);
  const id = slugify(name);
  writeFileSync(join(OUT_DIR, `${id}.ork`), zip);
  examples.push({
    id,
    file: `${id}.ork`,
    // The filename, as upstream's menu labels them: some designs are named just "Rocket" inside.
    name: name.replace(/\.ork$/i, ''),
    description: DESCRIPTIONS[id] ?? headerTag(xml, 'comment'),
    bytes: zip.length,
  });
}

const { slug, ref } = arg('src') ? { slug: 'local', ref: arg('src') } : pinnedUpstream();
writeFileSync(
  join(OUT_DIR, 'examples.generated.json'),
  JSON.stringify({ generated: new Date().toISOString(), source: { repo: slug, ref }, examples }, null, 2) + '\n',
);

const after = examples.reduce((n, e) => n + e.bytes, 0);
console.log(
  `Wrote ${examples.length} examples → public/examples/ ` +
    `(${(before / 1024 / 1024).toFixed(2)} MB upstream → ${(after / 1024).toFixed(0)} kB stripped)`,
);
