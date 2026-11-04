// Usage: npm run check:ork -- [--jar <OpenRocket.jar>] <file.ork|file.rkt> [...]
// A KNOWN entry that no named file produced also fails, so a fix must remove its entry.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chooseBuild } from './lib/openrocketJava.mjs';

const KNOWN = [
  // The app keeps a loaded part link as found, so 26-only digests warn here too.
  {
    file: 'pods-powered-with-recovery-deployment.ork',
    warning: 'found matching Estes PNC-50YR',
    reason: 'the source file names a part 24.12 does not hold',
  },
  {
    file: 'pods-powered-with-recovery-deployment.ork',
    warning: 'found matching Estes PNC-20,',
    reason: 'the source file names a part 24.12 does not hold',
  },
  {
    file: 'every-part.ork',
    warning: "Unknown parameter type 'linelengthauto' for Parachute, ignoring.",
    reason: 'the app keeps its automatic line length in its own tag; desktop flies the number written beside it',
  },
  {
    file: 'every-part.ork',
    warning: "Unknown parameter type 'cordlengthauto' for Shock Cord, ignoring.",
    reason: 'the app keeps its automatic cord length in its own tag; desktop flies the number written beside it',
  },
  {
    file: 'source/rocksim.rkt',
    warning: 'Parachute spill holes are not supported. Ignoring.',
    reason: "desktop's ParachuteHandler drops a spill hole; the app keeps it for upstream OpenRocket",
  },
  {
    file: 'source/rocksim.rkt',
    warning: 'Ring tails are not currently supported. Ignoring.',
    reason: 'neither desktop nor the app has a ring tail part; both skip it',
  },
  {
    file: 'rocksim-from-rkt.ork',
    warning: "Unknown parameter type 'spillholediameter' for Parachute, ignoring.",
    reason: '24.12 has no parachute spill hole; <spillholediameter> is the element upstream OpenRocket reads',
  },
  {
    file: 'conditions.ork',
    warning: "Unknown parameter type 'linelengthauto' for Parachute, ignoring.",
    reason: 'the app keeps its automatic line length in its own tag; desktop flies the number written beside it',
  },
  {
    file: 'conditions.ork',
    warning: "Unknown text in element 'baserelativehumidity', ignoring.",
    reason:
      "24.12's atmosphere has no humidity and flies dry air; <baserelativehumidity> is the element upstream OpenRocket reads",
  },
  {
    file: 'conditions.ork',
    warning: "No motor with designation 'X42' for manufacturer 'Homemade' found.",
    reason:
      '24.12 looks motors up in its own database only; the curve the app embeds under thrustcurves/ is read by upstream OpenRocket',
  },
  {
    file: 'source/pods-powered-with-recovery-deployment.ork',
    warning: 'Unsupported document version 1.11',
    reason: 'the source file is format 1.11, which an OpenRocket 26 build wrote and 24.12 does not list',
  },
  {
    file: 'source/pods-powered-with-recovery-deployment.ork',
    warning: 'found matching Estes PNC-50YR',
    reason: 'the source file names a part 24.12 does not hold',
  },
  {
    file: 'source/pods-powered-with-recovery-deployment.ork',
    warning: 'found matching Estes PNC-20,',
    reason: 'the source file names a part 24.12 does not hold',
  },
  {
    file: 'source/pods-powered-with-recovery-deployment.ork',
    warning: "Motor with designation 'A10' for manufacturer 'Estes' has differing thrust curve than the original.",
    reason:
      "the source file names the motor by the OpenRocket 26 database's digest, which 24.12's curve does not match",
  },
  {
    file: 'source/pods-powered-with-recovery-deployment.ork',
    warning: "Motor with designation 'A8' for manufacturer 'Estes' has differing thrust curve than the original.",
    reason:
      "the source file names the motor by the OpenRocket 26 database's digest, which 24.12's curve does not match",
  },
  {
    file: 'source/two-stage-high-power-rocket.ork',
    warning: 'Unsupported document version 1.11',
    reason: 'the source file is format 1.11, which an OpenRocket 26 build wrote and 24.12 does not list',
  },
  ...['H148R', 'I59WN', 'I357T'].map((motor) => ({
    file: 'source/two-stage-high-power-rocket.ork',
    warning: `Motor with designation '${motor}' for manufacturer 'AeroTech' has differing thrust curve than the original.`,
    reason:
      "the source file names the motor by the OpenRocket 26 database's digest, which 24.12's curve does not match",
  })),
  {
    file: 'pods-powered-with-recovery-deployment.ork',
    warning: "Motor with designation 'A8' for manufacturer 'Estes' has differing thrust curve than the original.",
    reason: "the file carries the source file's OpenRocket 26 curve, which 24.12's curve does not match",
  },
  ...['H148R', 'I59WN', 'I357T'].map((motor) => ({
    file: 'two-stage-high-power-rocket.ork',
    warning: `Motor with designation '${motor}' for manufacturer 'AeroTech' has differing thrust curve than the original.`,
    reason: "the file carries the source file's OpenRocket 26 curve, which 24.12's curve does not match",
  })),
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

const { cp, label } = chooseBuild();
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
