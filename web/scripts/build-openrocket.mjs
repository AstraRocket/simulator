// Usage: npm run openrocket:build. Builds the OpenRocket commit the engine is extracted from, for the desktop checks.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLASSPATH_FILE, ENGINE_BUILD, upstreamPin } from './lib/openrocketJava.mjs';

const { repo, ref } = upstreamPin();
const git = (...args) => execFileSync('git', args, { cwd: ENGINE_BUILD, stdio: 'inherit' });

const hasRef = () => {
  try {
    execFileSync('git', ['cat-file', '-e', `${ref}^{commit}`], { cwd: ENGINE_BUILD, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// Without its own .git, the commands here would act on this repo instead.
if (!existsSync(join(ENGINE_BUILD, '.git'))) {
  mkdirSync(ENGINE_BUILD, { recursive: true });
  git('init', '--quiet');
  git('remote', 'add', 'origin', repo);
}
// By commit: the fork's own branches can be behind the pin, so a clone of them may not have it.
if (!hasRef()) git('fetch', '--depth', '1', repo, ref);
git('checkout', '--quiet', ref);
// The parts and motor databases are a submodule the build packs into its resources.
git('submodule', 'update', '--init');

const work = mkdtempSync(join(tmpdir(), 'or-build-'));
try {
  const init = join(work, 'classpath.init.gradle');
  writeFileSync(
    init,
    `allprojects {
  if (path == ':core') {
    tasks.register('writeClasspath') {
      doLast { file('${CLASSPATH_FILE}').text = sourceSets.test.runtimeClasspath.asPath }
    }
  }
}
`,
  );
  // A `.bat` needs a shell, and cmd does not look in `cwd` for it here, so the whole path, quoted.
  const gradlew = process.platform === 'win32' ? `"${join(ENGINE_BUILD, 'gradlew.bat')}"` : './gradlew';
  execFileSync(gradlew, ['--no-daemon', '-I', init, ':core:classes', ':core:testClasses', ':core:writeClasspath'], {
    cwd: ENGINE_BUILD,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log(`built OpenRocket ${ref} in ${ENGINE_BUILD}`);
