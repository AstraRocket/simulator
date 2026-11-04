#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { gradleArgv, javaExe } from './gradle-exec.mjs';

const engineRoot = dirname(fileURLToPath(import.meta.url));
// Neither flag means both: a stale .wasm silently runs old physics (browsers prefer WASM-GC).
const wantJs = process.argv.includes('--js');
const wantWasm = process.argv.includes('--wasm');
const targets = wantJs === wantWasm ? ['js', 'wasm'] : wantJs ? ['js'] : ['wasm'];
const noCopy = process.argv.includes('--no-copy');
const vendorDir = join(engineRoot, '..', 'web', 'src', 'engine', 'vendor');
// In public/, not src/: Vite import-analysis warns on the loader's dynamic imports.
const publicEngineDir = join(engineRoot, '..', 'web', 'public', 'engine');

// Drop an invalid JAVA_HOME so Gradle resolves its own JVM.
const env = { ...process.env };
if (process.env.JAVA_HOME && !existsSync(process.env.JAVA_HOME)) delete env.JAVA_HOME;

const teavmOut = join(engineRoot, 'build', 'generated', 'teavm');
const TARGETS = {
  js: {
    label: 'JS',
    gradleTask: 'generateJavaScript',
    destRel: 'web/src/engine/vendor/',
    copies: [[join(teavmOut, 'js', 'astrarrocketjs-engine.js'), join(vendorDir, 'openrocket-engine.mjs')]],
  },
  wasm: {
    label: 'WASM-GC',
    gradleTask: 'buildWasmGC',
    destRel: 'web/public/engine/',
    copies: [
      [join(teavmOut, 'wasm-gc', 'astrarrocketjs-engine.wasm'), join(publicEngineDir, 'openrocket-engine.wasm')],
      [join(teavmOut, 'wasm-gc', 'astrarrocketjs-engine.wasm-runtime.js'), join(publicEngineDir, 'openrocket-engine.wasm-runtime.js')],
    ],
  },
};

// CI daemon holds our stdio pipe open and hangs; must be a CLI flag (gradle.properties outranks GRADLE_OPTS).
const NO_DAEMON = process.env.CI ? ['--no-daemon'] : [];

// Compile all before vendoring any, so a failed compile cannot leave a mismatched pair.
for (const target of targets) {
  const { gradleTask } = TARGETS[target];
  console.error(`build-engine: compiling with TeaVM (gradlew ${gradleTask}) …`);
  execFileSync(javaExe(env), gradleArgv(engineRoot, [gradleTask, '--console=plain', ...NO_DAEMON], env), {
    cwd: engineRoot,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

for (const target of targets) {
  for (const [src] of TARGETS[target].copies) {
    if (!existsSync(src)) {
      console.error(`build-engine: expected output not found: ${src}`);
      process.exit(1);
    }
  }
}

// TeaVM can prune a facade method.
const EXPECTED_EXPORTS = [
  'buildRocket', 'reset', 'getStaticInfo', 'getComponentInfo', 'getComponentMasses',
  'getAeroSweep', 'simulateJson', 'setMotorById', 'setMotorIgnitionById',
  // Facade names only: the drag calculator's own setters appear in any build.
  'setSupersonicAero', 'setRogersModifiedBarrowman', 'setStubbyNoseDrag',
  'runParity', 'free',
];
for (const target of targets) {
  const artifact = TARGETS[target].copies[0][0];
  const text = readFileSync(artifact, target === 'wasm' ? 'latin1' : 'utf8');
  const missing = EXPECTED_EXPORTS.filter((name) => !new RegExp(`\\b${name}\\b`).test(text));
  if (missing.length) {
    console.error(`build-engine: the ${target} build is missing ${missing.length} expected export(s):`);
    missing.forEach((m) => console.error(`  ! ${m}`));
    console.error('build-engine:   TeaVM pruned a facade method. Do NOT vendor it.');
    process.exit(1);
  }
}

for (const target of targets) {
  const { label, destRel, copies } = TARGETS[target];
  const totalKb = (copies.reduce((n, [src]) => n + statSync(src).size, 0) / 1024).toFixed(0);

  if (noCopy) {
    console.log(`build-engine: built ${label} engine (${totalKb} kB). Skipped vendoring (--no-copy).`);
  } else {
    for (const [src, dest] of copies) { mkdirSync(dirname(dest), { recursive: true }); copyFileSync(src, dest); }
    const names = copies.map(([, d]) => d.split(/[\\/]/).pop()).join(' + ');
    console.log(`build-engine: built + vendored ${totalKb} kB → ${destRel}${names}`);
  }
}
