#!/usr/bin/env node
// E2E_SCOPE is set here, not in the npm script, so it works in cmd.exe too.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// No shell (it splits `-g "two words"`), and Windows will not spawn npx.cmd without one.
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');

const result = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, E2E_SCOPE: 'core' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
