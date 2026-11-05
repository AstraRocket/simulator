// Usage: npm run openrocket:build. Builds the OpenRocket commit the engine is extracted from, for the desktop checks.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CLASSPATH_FILE, ENGINE_BUILD, upstreamPin } from './lib/openrocketJava.mjs';

const { repo, ref } = upstreamPin();
const git = (...args) => execFileSync('git', args, { cwd: ENGINE_BUILD, stdio: 'inherit' });

if (!existsSync(ENGINE_BUILD)) {
  execFileSync('git', ['clone', '--no-checkout', repo, ENGINE_BUILD], { stdio: 'inherit' });
}
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
