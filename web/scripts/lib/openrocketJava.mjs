import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE_JAVA = fileURLToPath(new URL('../../../engine-java/', import.meta.url));

/** The clone `npm run openrocket:build` makes. Gitignored, like `.openrocket-src`. */
export const ENGINE_BUILD = join(ENGINE_JAVA, '.openrocket-build');
export const CLASSPATH_FILE = 'build/classpath.txt';

/** The parts files the build packs into its library: `database/` (the submodule's `.orc`) and `internal/`. */
export const ENGINE_COMPONENTS = join(ENGINE_BUILD, 'core/build/resources/main/datafiles/components');

/** The parts database at the commit the engine's OpenRocket pins as its submodule. */
export const ENGINE_PARTS_DATABASE = join(ENGINE_BUILD, 'core/resources-src/datafiles/openrocket-database/orc');

/** The commit the engine is extracted from. `extract/UPSTREAM` is the only copy of it. */
export function upstreamPin() {
  const text = readFileSync(join(ENGINE_JAVA, 'extract/UPSTREAM'), 'utf8');
  const field = (name) => text.match(new RegExp(`^${name}\\s*=\\s*(\\S+)`, 'm'))?.[1];
  return { repo: field('repo'), ref: field('ref') };
}

/** The catalogs and the desktop checks follow the engine's own commit, so a build of any other commit is refused. */
export function engineBuild() {
  const problem = engineBuildProblem();
  if (problem) {
    console.error(`${problem}\nRun: npm run openrocket:build`);
    process.exit(2);
  }
  const list = join(ENGINE_BUILD, 'core', CLASSPATH_FILE);
  return { cp: readFileSync(list, 'utf8').trim(), label: `OpenRocket ${upstreamPin().ref.slice(0, 9)}` };
}

export function engineBuildProblem() {
  if (!existsSync(join(ENGINE_BUILD, 'core', CLASSPATH_FILE))) {
    return `No build of the engine's OpenRocket at ${ENGINE_BUILD}.`;
  }
  const { ref } = upstreamPin();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ENGINE_BUILD, encoding: 'utf8' }).trim();
  return head === ref ? null : `${ENGINE_BUILD} is at ${head}, but the engine is pinned to ${ref}.`;
}

export function runDumper({ cp, javaSrc, className }) {
  const work = mkdtempSync(join(tmpdir(), 'or-digests-'));
  try {
    execFileSync('javac', ['-cp', cp, '-d', work, javaSrc], { stdio: 'inherit' });
    const out = join(work, 'dump.tsv');
    const log = execFileSync('java', ['-cp', `${cp}${delimiter}${work}`, className, out], { encoding: 'utf8' });
    process.stdout.write(`  ${log.trim()}\n`);
    // On Windows a stray \r would ride into the last field, the digest.
    return readFileSync(out, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split('\t'));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
