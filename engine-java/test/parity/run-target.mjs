#!/usr/bin/env node
// Disposable: on Linux a process that has loaded WASM-GC cannot exit, so this one is SIGKILLed.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TARGET_COMPLETE, writeStdoutSync } from './stdout-sync.mjs';

const target = process.argv[2];
if (target !== 'js' && target !== 'wasm') {
  console.error('usage: node test/parity/run-target.mjs <js|wasm>');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, '..', '..', '..', 'web');
const wasmDir = join(webRoot, 'public', 'engine');

// Restored before writeStdoutSync, whose fallback would otherwise feed back into `captured`.
const realStdoutWrite = process.stdout.write.bind(process.stdout);
let captured = '';
console.log = (msg) => { captured += String(msg) + '\n'; };
process.stdout.write = (chunk) => { captured += String(chunk); return true; };

if (target === 'wasm') {
  (0, eval)(readFileSync(join(wasmDir, 'openrocket-engine.wasm-runtime.js'), 'utf8'));

  // Bytes, not a path: given a path, compileModule() never closes the file handle.
  const wasmBytes = readFileSync(join(wasmDir, 'openrocket-engine.wasm'));
  const teavm = await globalThis.TeaVM.wasmGC.load(wasmBytes);
  teavm.exports.runParity();
} else {
  const mod = await import(pathToFileURL(join(webRoot, 'src', 'engine', 'vendor', 'openrocket-engine.mjs')).href);
  mod.runParity();
}

process.stdout.write = realStdoutWrite;
writeStdoutSync(captured.endsWith('\n') ? captured : captured + '\n');

// The only success signal parity.mjs gets: SIGKILL leaves no exit status.
writeStdoutSync(TARGET_COMPLETE + '\n');

// After WASM-GC loads on Linux, process.exit(0) hangs (V8/node defect); only SIGKILL works.
process.kill(process.pid, 'SIGKILL');
