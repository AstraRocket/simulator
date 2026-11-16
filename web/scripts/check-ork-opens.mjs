// Usage: npm run check:ork -- <file.ork|file.rkt> [...]. Needs `npm run openrocket:build`.
// A KNOWN entry that no named file produced also fails, so a fix must remove its entry.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { engineBuild } from './lib/openrocketJava.mjs';

const KNOWN = [
  {
    file: 'source/rocksim.rkt',
    warning:
      "Parachute 'Chute' was imported as a single round parachute with the same drag area (diameter 361.6 mm instead of 400.0 mm).",
    reason:
      'OpenRocket parachutes are round with no spill hole; desktop says so when it reads a RockSim canopy, and the app gives the same note',
  },
  {
    file: 'source/rocksim.rkt',
    warning: "Ring tail 'Not supported' was imported as a mass component; its aerodynamics are not simulated.",
    reason: 'OpenRocket has no ring tail part; desktop says so when it reads one, and the app gives the same note',
  },
];

const HERE = fileURLToPath(new URL('.', import.meta.url));
const JAVA_SRC = resolve(HERE, 'ork-check/OrkCheck.java');

const files = process.argv.slice(2).filter((a, i, all) => {
  if (a.startsWith('--')) return false;
  return !all[i - 1]?.startsWith('--');
});

if (!files.length) {
  console.error('usage: npm run check:ork -- <file.ork|file.rkt> [...]');
  process.exit(2);
}
for (const f of files) {
  if (!existsSync(f)) {
    console.error(`no such file: ${f}`);
    process.exit(2);
  }
}

const { cp, label } = engineBuild();
console.log(`opening in ${label}`);
const work = mkdtempSync(join(tmpdir(), 'or-check-'));
let out;
try {
  execFileSync('javac', ['-cp', cp, '-d', work, JAVA_SRC], { stdio: 'inherit' });
  try {
    out = execFileSync('java', ['-cp', `${cp}${delimiter}${work}`, 'OrkCheck', ...files.map((f) => resolve(f))], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // OrkCheck exits 1 on any warning; its report is still on stdout.
    if (typeof e.stdout !== 'string') throw e;
    out = e.stdout;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
process.stdout.write(out);

const shortName = (path) => (basename(dirname(path)) === 'source' ? `source/${basename(path)}` : basename(path));
const opened = new Set(files.map((f) => shortName(resolve(f))));
const seen = new Set();
const unknown = [];
let file = '';
for (const line of out.split(/\r?\n/)) {
  if (line.startsWith('== ')) file = shortName(line.slice(3).trim());
  const warning = line.match(/^\s+(WARNING: .*|FAILED: .*)$/)?.[1];
  if (!warning) continue;
  const known = KNOWN.find((k) => k.file === file && warning.includes(k.warning));
  if (known) seen.add(known);
  else unknown.push(`${file}: ${warning}`);
}
const stale = KNOWN.filter((k) => opened.has(k.file) && !seen.has(k));
for (const u of unknown) console.log(`NEW ${u}`);
for (const k of stale) console.log(`NO LONGER WARNS ${k.file}: ${k.warning} (${k.reason}): remove it from KNOWN`);
console.log(`${unknown.length} new warnings, ${seen.size} known, ${stale.length} stale entries`);
process.exit(unknown.length || stale.length ? 1 : 0);
