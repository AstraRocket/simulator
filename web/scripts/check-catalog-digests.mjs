import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { coverageTable, motorProblems, partProblems } from './lib/digestCoverage.mjs';

const DATA = fileURLToPath(new URL('../public/data/', import.meta.url));
const read = (file) => (existsSync(DATA + file) ? JSON.parse(readFileSync(DATA + file, 'utf8')) : null);

const parts = read('components.generated.json')?.components ?? null;
const motors = read('motors.generated.json');

const problems = [];
if (!parts) problems.push('components.generated.json is missing');
else problems.push(...partProblems(parts));
if (!motors) problems.push('motors.generated.json is missing');
else problems.push(...motorProblems(motors));

const table = coverageTable(parts, motors);
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Catalog digests\n\n${table}\n\n`);
}
if (problems.length) {
  console.error(`\nRefusing these catalogs:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('\nDigest coverage is above every floor.');
