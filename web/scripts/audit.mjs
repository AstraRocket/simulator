// Usage: npm run audit. The last three steps need a JDK and `npm run openrocket:build`.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditSteps } from './lib/checkSteps.mjs';

const work = mkdtempSync(join(tmpdir(), 'web-audit-'));
const STEPS = auditSteps(work);

let failed = null;
for (const [name, step] of STEPS) {
  console.log(`\n=== audit: ${name} ===`);
  if (!step()) {
    failed = name;
    break;
  }
}
rmSync(work, { recursive: true, force: true });
if (failed) {
  console.error(`\naudit: ${failed} FAILED`);
  process.exit(1);
}
console.log(`\naudit: all ${STEPS.length} web checks passed.`);
