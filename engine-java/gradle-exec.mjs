// gradlew.bat would need `shell: true` (DEP0190), which concatenates args unescaped.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

export function javaExe(env = process.env) {
  const home = env.JAVA_HOME;
  if (home && existsSync(home)) {
    return join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  }
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

// DEFAULT_JVM_OPTS is deliberately not forwarded: it only caps the launcher JVM's heap.
export function gradleArgv(engineRoot, args, env = process.env) {
  const opts = [env.JAVA_OPTS, env.GRADLE_OPTS]
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean);
  return [
    ...opts,
    '-Dorg.gradle.appname=gradlew',
    '-jar',
    join(engineRoot, 'gradle', 'wrapper', 'gradle-wrapper.jar'),
    ...args,
  ];
}
