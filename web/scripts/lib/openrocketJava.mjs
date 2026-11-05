import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arg } from './args.mjs';
import { checkJar, checkSourceTree } from './openrocketRelease.mjs';

const JARS = [
  'angus-activation',
  'aopalliance',
  'caffeine',
  'checker-qual',
  'classgraph',
  'commonmark',
  'commons-io',
  'commons-lang3',
  'error_prone_annotations',
  'failureaccess',
  'guava',
  'guice',
  'istack-commons-runtime',
  'jackson-annotations',
  'jackson-core',
  'jackson-databind',
  'jakarta.activation',
  'jakarta.inject-api',
  'jakarta.xml.bind-api',
  'jaxb-core',
  'jaxb-runtime',
  'logback-classic',
  'logback-core',
  'opencsv',
  'slf4j-api',
  'txw2',
];

function cachedJars() {
  const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
  const root = join(gradleHome, 'caches/modules-2/files-2.1');
  if (!existsSync(root)) throw new Error(`no Gradle cache at ${root}; build the OpenRocket checkout first`);
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, name.name);
      if (name.isDirectory()) walk(p, depth + 1);
      else if (
        name.name.endsWith('.jar') &&
        !name.name.includes('-sources') &&
        !name.name.includes('-javadoc') &&
        JARS.some((j) => name.name.startsWith(`${j}-`))
      ) {
        out.push(p);
      }
    }
  };
  walk(root, 0);
  if (!out.length) throw new Error('found no dependency jars in the Gradle cache');
  return out;
}

export function installedJar() {
  const roots = [
    'C:/Program Files/OpenRocket/jar',
    'C:/Program Files (x86)/OpenRocket/jar',
    '/Applications/OpenRocket.app/Contents/app',
    '/opt/OpenRocket/jar',
    '/opt/openrocket/jar',
    join(homedir(), 'OpenRocket/jar'),
  ];
  for (const dir of roots) {
    if (!existsSync(dir)) continue;
    const jar = readdirSync(dir).find((f) => /^OpenRocket.*\.jar$/i.test(f));
    if (jar) return join(dir, jar);
  }
  return null;
}

function classpath(orDir, jar) {
  if (jar) {
    if (!existsSync(jar)) throw new Error(`no such jar: ${jar}`);
    checkJar(jar);
    return jar;
  }
  checkSourceTree(orDir);
  const main = join(orDir, 'core/build/classes/java/main');
  const test = join(orDir, 'core/build/classes/java/test');
  for (const d of [main, test]) {
    if (!existsSync(d)) {
      throw new Error(`missing ${d}\nBuild the checkout first: cd ${orDir} && ./gradlew build`);
    }
  }
  return [...cachedJars(), main, test, join(orDir, 'core/build/resources/main')].join(delimiter);
}

export function chooseBuild() {
  const orDir = arg('or');
  const jar = arg('jar') ?? (orDir ? null : installedJar());
  if (!orDir && !jar) {
    console.error(
      'No installed OpenRocket found. Pass one:\n' +
        '  --jar <OpenRocket-NN.NN.jar>   a release\n' +
        '  --or  <openrocket checkout>    a built source tree (needs OPENROCKET_UNPINNED=1)',
    );
    process.exit(2);
  }
  return { cp: classpath(orDir, jar), label: jar ?? orDir };
}

const ENGINE_JAVA = fileURLToPath(new URL('../../../engine-java/', import.meta.url));

/** The clone `npm run openrocket:build` makes. Gitignored, like `.openrocket-src`. */
export const ENGINE_BUILD = join(ENGINE_JAVA, '.openrocket-build');
export const CLASSPATH_FILE = 'build/classpath.txt';

/** The commit the engine is extracted from. `extract/UPSTREAM` is the only copy of it. */
export function upstreamPin() {
  const text = readFileSync(join(ENGINE_JAVA, 'extract/UPSTREAM'), 'utf8');
  const field = (name) => text.match(new RegExp(`^${name}\\s*=\\s*(\\S+)`, 'm'))?.[1];
  return { repo: field('repo'), ref: field('ref') };
}

/** The desktop checks compare against the engine's own commit, so a build of any other commit is refused. */
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
