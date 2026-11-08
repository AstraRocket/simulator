#!/usr/bin/env node
/**
 * extract.mjs: regenerate engine-java/src/java/ from OpenRocket core (manifest.txt) plus patches/.
 *
 *   node extract/extract.mjs --check   # verify only; fetches the pinned upstream itself
 *   node extract/extract.mjs --bless   # re-record extract/DIVERGENCE.txt and SHIMS.txt
 *   node extract/extract.mjs --src <openrocket-source>   # regenerate src/java/ (writes)
 *   OPENROCKET_SRC=<path> node extract/extract.mjs       # explicit source instead
 *   --refresh                          # re-fetch the pinned upstream cache
 */
import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const here = dirname(fileURLToPath(import.meta.url));
const engineRoot = join(here, '..');
const extractedRoot = join(engineRoot, 'src', 'java');
const patchesRoot = join(engineRoot, 'patches');
const shimsRoot = join(engineRoot, 'src', 'shims', 'java');
const manifestPath = join(here, 'manifest.txt');

const die = (msg) => { console.error(`extract: ${msg}`); process.exit(1); };

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
  process.exit(0);
}
const check = args.includes('--check');
const bless = args.includes('--bless');
// --bless must not rewrite src/java: on a CRLF checkout, extraction rewrites every file to LF.
const readOnly = check || bless;
const refresh = args.includes('--refresh');

const readPin = () => {
  const text = readFileSync(join(here, 'UPSTREAM'), 'utf8');
  const field = (name) => {
    const m = new RegExp(`^${name}\\s*=\\s*(\\S+)`, 'm').exec(text);
    return m ? m[1] : null;
  };
  const repo = field('repo');
  const ref = field('ref');
  if (!repo || !ref) die('extract/UPSTREAM is missing a repo or ref line');
  // Shallow clone: only describe's `-g<sha>` suffix can be checked against ref.
  const describe = field('describe');
  if (describe) {
    const at = describe.lastIndexOf('-g');
    const sha = at < 0 ? '' : describe.slice(at + 2);
    if (sha.length < 7 || !ref.startsWith(sha)) {
      die(`extract/UPSTREAM: describe (${describe}) does not end in -g<ref>; it names another commit than ref ${ref.slice(0, 9)}`);
    }
  }
  return { repo, ref };
};

const git = (cwd, ...argv) =>
  execFileSync('git', argv, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const provisionUpstream = () => {
  const { repo, ref } = readPin();
  const cache = join(engineRoot, '.openrocket-src');
  const at = () => {
    try {
      return git(cache, 'rev-parse', 'HEAD');
    } catch {
      return null;
    }
  };
  if (existsSync(cache) && !refresh && at() === ref) return cache;
  try {
    if (!existsSync(join(cache, '.git'))) {
      mkdirSync(cache, { recursive: true });
      git(cache, 'init', '-q');
      git(cache, 'remote', 'add', 'origin', repo);
      git(cache, 'config', 'core.sparseCheckout', 'true');
      git(cache, 'sparse-checkout', 'set', '--no-cone', 'core/src/main/java');
    }
    console.log(`extract: fetching pinned upstream ${ref.slice(0, 9)} from ${repo}`);
    console.log('extract:   (one-time, into engine-java/.openrocket-src; --refresh to redo)');
    git(cache, 'fetch', '--depth', '1', '--filter=blob:none', 'origin', ref);
    git(cache, 'checkout', '-q', 'FETCH_HEAD');
  } catch (e) {
    die(`could not fetch the pinned upstream (${repo} @ ${ref.slice(0, 9)}).\n`
      + `  ${e.message ? e.message.split('\n')[0] : e}\n`
      + '  Needs git and network. Offline? Pass --src <your-openrocket-checkout>.');
  }
  const got = at();
  if (got !== ref) die(`upstream cache is at ${got}, expected ${ref}`);
  return cache;
};

const srcArg = (() => {
  const i = args.indexOf('--src');
  if (i >= 0 && args[i + 1]) return args[i + 1];
  if (process.env.OPENROCKET_SRC) return process.env.OPENROCKET_SRC;
  return provisionUpstream();
})();
if (!existsSync(srcArg)) die(`source path does not exist: ${srcArg}`);

const layouts = ['core/src/main/java', 'src/main/java', '.'];
const coreJavaRoot = layouts
  .map((c) => join(srcArg, c))
  .find((p) => existsSync(join(p, 'info', 'openrocket', 'core')));
if (!coreJavaRoot) die(`no info/openrocket/core under ${srcArg} (looked in: ${layouts.join(', ')})`);

const manifest = readFileSync(manifestPath, 'utf8')
  .split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
const manifestSet = new Set(manifest);
if (manifestSet.size !== manifest.length) {
  const seen = new Set();
  const dups = manifest.filter((m) => (seen.has(m) ? true : (seen.add(m), false)));
  die(`manifest.txt lists ${dups.length} file(s) more than once:\n  ${[...new Set(dups)].join('\n  ')}`);
}

const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
}) : []);
const patches = walk(patchesRoot)
  .filter((p) => p.endsWith('.java'))
  .map((p) => relative(patchesRoot, p).replace(/\\/g, '/'));
const patchSet = new Set(patches);

const orphans = patches.filter((p) => !manifestSet.has(p));
if (orphans.length) die(`patch(es) with no matching manifest entry:\n  ${orphans.join('\n  ')}`);

const norm = (s) => s.replace(/\r\n/g, '\n');
const missing = [];
const drift = [];
let patched = 0;
let verbatim = 0;

for (const rel of manifest) {
  const upstream = join(coreJavaRoot, rel);
  if (!existsSync(upstream)) { missing.push(rel); continue; }
  const want = readFileSync(patchSet.has(rel) ? join(patchesRoot, rel) : upstream, 'utf8');
  const dest = join(extractedRoot, rel);
  if (readOnly) {
    const have = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
    if (have === null || norm(have) !== norm(want)) drift.push(rel);
  } else {
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, want);
  }
  if (patchSet.has(rel)) patched++; else verbatim++;
}

// No .java filter: the invariant covers the whole directory.
const stale = walk(extractedRoot)
  .map((p) => relative(extractedRoot, p).replace(/\\/g, '/'))
  .filter((p) => !manifestSet.has(p));

console.log(`extract: source = ${coreJavaRoot}`);
console.log(`extract: ${manifest.length} manifest files (${patches.length} patched), from OpenRocket source.`);
if (missing.length) {
  console.error(`extract: ${missing.length} manifest file(s) NOT FOUND upstream (version mismatch: update manifest/patches):`);
  missing.forEach((m) => console.error(`  - ${m}`));
}
if (stale.length) {
  console.warn(`extract: ${stale.length} extracted file(s) not in manifest (stale):`);
  stale.forEach((s) => console.warn(`  ? ${s}`));
}
const unpatched = walk(extractedRoot)
  .map((p) => relative(extractedRoot, p).replace(/\\/g, '/'))
  .filter((p) => p.endsWith('.java') && !patchSet.has(p))
  // Any PATCH( tag, not just PATCH(astrarrocketjs: markers use several prefixes. Do not narrow it.
  .filter((p) => /PATCH\(/.test(readFileSync(join(extractedRoot, p), 'utf8')));

// Real LCS: a line-multiset count scores 0 for deleting a line whose text recurs elsewhere.
const changedLines = (a, b) => {
  let lo = 0;
  let aHi = a.length;
  let bHi = b.length;
  while (lo < aHi && lo < bHi && a[lo] === b[lo]) lo++;
  while (aHi > lo && bHi > lo && a[aHi - 1] === b[bHi - 1]) { aHi--; bHi--; }
  const x = a.slice(lo, aHi);
  const y = b.slice(lo, bHi);
  if (!x.length || !y.length) return x.length + y.length;
  const [s1, s2] = x.length >= y.length ? [x, y] : [y, x];
  let prev = new Int32Array(s2.length + 1);
  let cur = new Int32Array(s2.length + 1);
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      cur[j] = s1[i - 1] === s2[j - 1]
        ? prev[j - 1] + 1
        : (prev[j] >= cur[j - 1] ? prev[j] : cur[j - 1]);
    }
    const t = prev; prev = cur; cur = t;
    cur.fill(0);
  }
  const lcs = prev[s2.length];
  return (x.length - lcs) + (y.length - lcs);
};

// Hashes catch edits that keep the line count, such as one coefficient swapped for another.
const sha = (text) => createHash('sha256').update(text).digest('hex');
const divergence = [];
for (const rel of manifest) {
  if (!patchSet.has(rel)) continue;
  const up = join(coreJavaRoot, rel);
  if (!existsSync(up)) continue;
  const oursText = norm(readFileSync(join(patchesRoot, rel), 'utf8'));
  const theirsText = norm(readFileSync(up, 'utf8'));
  divergence.push({
    rel,
    delta: changedLines(theirsText.split('\n'), oursText.split('\n')),
    patchSha: sha(oursText),
    upstreamSha: sha(theirsText),
  });
}
divergence.sort((x, y) => y.delta - x.delta || x.rel.localeCompare(y.rel));

const divergencePath = join(here, 'DIVERGENCE.txt');
const hasBaseline = existsSync(divergencePath);
const baseline = new Map();
if (hasBaseline) {
  for (const raw of readFileSync(divergencePath, 'utf8').split('\n')) {
    const entry = raw.trim();
    if (!entry || entry.startsWith('#')) continue;
    const m = /^(\S+)\s+(\d+)(?:\s+([0-9a-f]{64})\s+([0-9a-f]{64}))?$/.exec(entry);
    if (!m) die(`DIVERGENCE.txt: cannot parse line: ${entry}`);
    baseline.set(m[1], { delta: Number(m[2]), patchSha: m[3] ?? null, upstreamSha: m[4] ?? null });
  }
}

const unblessed = [];
if (hasBaseline) {
  for (const { rel, delta, patchSha, upstreamSha } of divergence) {
    const was = baseline.get(rel);
    if (!was) {
      unblessed.push({ rel, was: null, now: delta, why: 'not blessed' });
      continue;
    }
    const why = [
      was.delta !== delta && `count ${was.delta} -> ${delta}`,
      was.patchSha === null && 'no hashes recorded',
      was.patchSha !== null && was.patchSha !== patchSha && 'patch content changed',
      was.upstreamSha !== null && was.upstreamSha !== upstreamSha && 'upstream content changed',
    ].filter(Boolean);
    if (why.length) unblessed.push({ rel, was: was.delta, now: delta, why: why.join(', ') });
  }
  const seen = new Set(divergence.map((d) => d.rel));
  for (const [rel, was] of baseline) {
    if (!seen.has(rel)) unblessed.push({ rel, was: was.delta, now: null, why: 'patch gone' });
  }
}

const leftovers = divergence.filter((d) => d.delta === 0);
if (bless && leftovers.length) {
  die(`refusing to bless ${leftovers.length} patch(es) identical to upstream; delete them instead:\n  ${leftovers.map((d) => d.rel).join('\n  ')}`);
}

if (bless) {
  if (unblessed.length) {
    console.log('extract: add to patches/LEDGER.md, explaining each line:');
    console.log(`  ## <what changed> - ${new Date().toISOString().slice(0, 10)}`);
    for (const { rel, was, now, why } of unblessed) {
      console.log(`  - \`${rel}\`: ${was ?? 'new'} -> ${now ?? 'removed'} lines (${why}). WHY: <reason>`);
    }
  }
  const header = [
    '# How far each patch has diverged from upstream, in changed lines (LCS diff),',
    '# then a sha256 of the patch and of the upstream file it replaces (both',
    '# CRLF-normalized).',
    '#',
    '# This file is the REVIEWED baseline. `extract --check` recomputes all three',
    '# and fails on any difference, because the invariant it checks',
    '# ("src/java == upstream + patches") treats the patches as an input and so',
    '# can never question them. A coordinated patches/ + src/java edit passes',
    '# that invariant by construction; it does not pass this file. The hashes are',
    '# what make that true: a count is kept by an edit that swaps one value for',
    '# another, and by an upstream move that happens not to shift it.',
    '#',
    '# Regenerate deliberately with `npm run extract:bless -- --src <openrocket>`',
    '# and say in review WHY a number moved. A delta of 0 means the patch is',
    '# byte-identical to upstream: that is a leftover, and patches/LEDGER.md says',
    '# to delete it rather than bless it.',
    '#',
    '',
    '',
  ].join('\n');
  const body = divergence
    .map(({ rel, delta, patchSha, upstreamSha }) => `${rel} ${delta} ${patchSha} ${upstreamSha}`)
    .join('\n');
  writeFileSync(divergencePath, `${header}${body}\n`);
  console.log(`extract: blessed ${divergence.length} patch divergence(s) -> extract/DIVERGENCE.txt`);
}

const shimFiles = walk(shimsRoot)
  .filter((f) => f.endsWith('.java'))
  .map((f) => relative(shimsRoot, f).replace(/\\/g, '/'))
  .sort();
const shadowing = shimFiles.filter((rel) => existsSync(join(coreJavaRoot, rel)));

const shimsPath = join(here, 'SHIMS.txt');
const hasShimBaseline = existsSync(shimsPath);
const shimBaseline = new Map();
if (hasShimBaseline) {
  for (const raw of readFileSync(shimsPath, 'utf8').split('\n')) {
    const entry = raw.trim();
    if (!entry || entry.startsWith('#')) continue;
    const m = /^(\S+)\s+([0-9a-f]{64})$/.exec(entry);
    if (!m) die(`SHIMS.txt: cannot parse line: ${entry}`);
    shimBaseline.set(m[1], m[2]);
  }
}

const upstreamHash = (rel) =>
  createHash('sha256').update(norm(readFileSync(join(coreJavaRoot, rel), 'utf8'))).digest('hex');

const shimMoved = [];
if (hasShimBaseline) {
  for (const rel of shadowing) {
    const now = upstreamHash(rel);
    if (!shimBaseline.has(rel)) shimMoved.push({ rel, why: 'not in SHIMS.txt' });
    else if (shimBaseline.get(rel) !== now) shimMoved.push({ rel, why: 'upstream changed since this shim was reviewed' });
  }
  const shadowSet = new Set(shadowing);
  for (const rel of shimBaseline.keys()) {
    if (!shadowSet.has(rel)) shimMoved.push({ rel, why: 'baseline entry has no shim (or upstream dropped the class)' });
  }
}

if (bless) {
  const header = [
    '# Upstream classes that a src/shims file SHADOWS, and what that upstream',
    '# file looked like when the shim was last reviewed (sha256, CRLF-normalized).',
    '#',
    '# A shim is the only provider of its fully-qualified name, so a gap between',
    '# it and the real class is invisible to the compiler and wrong at runtime.',
    '# It cannot be diffed (162 lines standing in for 2089), so this records',
    '# instead that upstream has not moved underneath it. When a hash changes,',
    '# `extract --check` fails: go read what changed in that upstream class,',
    '# decide whether the shim still matches, then re-bless.',
    '#',
    '# Shims with no entry here define a name upstream does not (LongUUID, Geo2D,',
    '# the RASAero calculators, the Guice stand-ins), so there is nothing to track.',
    '',
    '',
  ].join('\n');
  const body = shadowing.map((rel) => `${rel} ${upstreamHash(rel)}`).join('\n');
  writeFileSync(shimsPath, `${header}${body}\n`);
  console.log(`extract: blessed ${shadowing.length} shadowed shim(s) -> extract/SHIMS.txt`);
}

console.log(`extract: ${shimFiles.length} shim(s), ${shadowing.length} shadowing an upstream class.`);
if (shimMoved.length) {
  console.error(`extract: ${shimMoved.length} shadowed shim(s) need review:`);
  shimMoved.forEach(({ rel, why }) => console.error(`  ! ${rel}  (${why})`));
  console.error('extract:   re-read the upstream class, confirm the shim still matches, then --bless.');
}
if (!hasShimBaseline) {
  console.error('extract: extract/SHIMS.txt is MISSING - shim drift is unchecked.');
  console.error('extract:   create it with --bless.');
}

if (unpatched.length) {
  console.error(`extract: ${unpatched.length} extracted file(s) carry a PATCH( marker but have NO patches/ file:`);
  unpatched.forEach((u) => console.error(`  ! ${u}`));
  console.error('extract:   a regeneration would silently revert these to upstream.');
}
if (divergence.length) {
  console.log(`extract: ${divergence.length} patch(es) vs current upstream (the override, drift, or both):`);
  divergence.forEach(({ rel, delta }) => console.log(
    `  > ${rel}  (${delta} line(s)${delta === 0 ? '  LEFTOVER: identical to upstream, delete it' : ''})`,
  ));
  console.log('extract:   a large number means upstream has moved on without us.');
}
if (unblessed.length) {
  console.error(`extract: ${unblessed.length} patch divergence(s) do NOT match extract/DIVERGENCE.txt:`);
  unblessed.forEach(({ rel, was, now, why }) => console.error(
    `  ! ${rel}  ${was === null ? 'not blessed' : `blessed ${was}`} -> ${now === null ? 'patch gone' : `now ${now}`} (${why})`,
  ));
  console.error('extract:   a patch changed without review. Re-run with --bless and say why.');
}
if (!hasBaseline) {
  console.error('extract: extract/DIVERGENCE.txt is MISSING - the patch baseline is unenforced.');
  console.error('extract:   create it with --bless.');
}

// Escapes allowed: `"([^"]*)"` would drop `Styrofoam \"Blue foam\" (XPS)` from both sides and still balance.
const MATERIALS_JSON = join(engineRoot, '..', 'web', 'public', 'data', 'materials.generated.json');
const JAVA_MATERIAL = /newMaterial\(Type\.(BULK|SURFACE|LINE),\s*"((?:[^"\\]|\\.)*)",\s*([0-9.eE+-]+)/g;
// Java literals escape non-ASCII ("Cr\u00eape paper") and inner quotes; the JSON does not.
const unescapeJava = (t) => t
  .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/\\(["'\\])/g, '$1');
const materialKey = (type, name) => JSON.stringify([type.toLowerCase(), name]);

const materialDrift = (() => {
  const javaPath = join(coreJavaRoot, 'info', 'openrocket', 'core', 'database', 'Databases.java');
  if (!existsSync(javaPath)) return [`cannot compare: ${javaPath} is missing`];
  if (!existsSync(MATERIALS_JSON)) {
    return [`cannot compare: ${MATERIALS_JSON} is missing - run web/scripts/sync-materials.mjs`];
  }
  const out = [];

  const java = readFileSync(javaPath, 'utf8');
  const upstream = new Map();
  for (const m of java.matchAll(JAVA_MATERIAL)) {
    upstream.set(materialKey(m[1], unescapeJava(m[2])), Number(m[3]));
  }
  const javaCalls = java.split('newMaterial(Type.').length - 1;
  if (javaCalls !== upstream.size) {
    out.push(`parser bug: ${javaCalls} newMaterial calls upstream, ${upstream.size} parsed`);
  }

  let all;
  try {
    all = JSON.parse(readFileSync(MATERIALS_JSON, 'utf8'));
  } catch (e) {
    return [`cannot read ${MATERIALS_JSON}: ${e.message}`];
  }
  // A row with no `kind` is a hand-edit; treat it as upstream's so the Java must back it.
  const rows = all.filter((r) => (r.kind ?? 'upstream') === 'upstream');
  const ours = new Map(rows.map((r) => [materialKey(r.type, r.name), r.density]));
  if (ours.size !== rows.length) out.push(`the app's list has ${rows.length - ours.size} duplicate material(s)`);

  // App rows may add, not replace: shadowing an upstream name re-weighs every saved design.
  for (const r of all) {
    if ((r.kind ?? 'upstream') === 'upstream') continue;
    if (ours.has(materialKey(r.type, r.name))) out.push(`the app's ${r.name} (${r.type}) shadows an upstream material`);
  }

  const say = (k) => JSON.parse(k).join(' ');
  for (const [k, d] of upstream) {
    if (!ours.has(k)) out.push(`missing from the app: ${say(k)} (${d})`);
    else if (ours.get(k) !== d) out.push(`density differs: ${say(k)} - upstream ${d}, app ${ours.get(k)}`);
  }
  for (const k of ours.keys()) if (!upstream.has(k)) out.push(`not in upstream: ${say(k)}`);
  return out;
})();
if (materialDrift.length) {
  console.error(`extract: web/public/data/materials.generated.json differs from upstream in ${materialDrift.length} place(s):`);
  materialDrift.forEach((d) => console.error(`  ! ${d}`));
  console.error('extract:   regenerate it with `node web/scripts/sync-materials.mjs`.');
  console.error("extract:   the app's own materials belong in web/scripts/data/materials.app.json, with their source.");
}

// A missing baseline counts, so deleting it cannot switch the check off.
const baselineMissing = hasBaseline ? 0 : 1;

const shimBaselineMissing = hasShimBaseline ? 0 : 1;
if (leftovers.length) {
  console.error(`extract: ${leftovers.length} patch(es) identical to upstream (leftovers; delete them):`);
  leftovers.forEach((d) => console.error(`  ! ${d.rel}`));
}
const problems = missing.length + drift.length + stale.length + unpatched.length
  + unblessed.length + leftovers.length + baselineMissing
  + shimMoved.length + shimBaselineMissing + materialDrift.length;
if (check) {
  console.log(`extract --check: ${drift.length} extracted file(s) differ from upstream(+patch)${drift.length ? ':' : '.'}`);
  drift.forEach((d) => console.log(`  ~ ${d}`));
  console.log(
    problems
      ? `extract --check: FAILED (${missing.length} missing, ${drift.length} drifted, ${stale.length} unmanaged, ${unpatched.length} unpatched, ${unblessed.length} unblessed, ${leftovers.length} leftover(s), ${shimMoved.length} shim(s) to review, ${materialDrift.length} material(s)${baselineMissing ? ', no patch baseline' : ''}${shimBaselineMissing ? ', no shim baseline' : ''})`
      : 'extract --check: OK - src/java is exactly upstream(+patches), and the material table is upstream\'s.',
  );
  process.exit(problems ? 1 : 0);
}
if (!readOnly) {
  console.log(`extract: wrote ${patched + verbatim} files (${patched} patched, ${verbatim} verbatim).`);
}
process.exit(problems ? 1 : 0);
