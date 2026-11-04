// Usage: npm run diff:motors -- <before.json> [after.json]
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { diffMotors, isEmptyDiff, motorDiffHeadline, motorDiffMarkdown } from './lib/motorDiff.mjs';

const [beforePath, afterPath = fileURLToPath(new URL('../public/data/motors.generated.json', import.meta.url))] =
  process.argv.slice(2);
if (!beforePath) {
  console.error('Usage: npm run diff:motors -- <before.json> [after.json]');
  process.exit(2);
}

const summary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n`);
};

if (!existsSync(beforePath)) {
  const text = '### Motors\n\nNo previous catalog to compare with.';
  console.log(text);
  summary(text);
  process.exit(0);
}

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const diff = diffMotors(read(beforePath), read(afterPath));
const report = motorDiffMarkdown(diff);
console.log(report);
summary(report);
if (process.env.GITHUB_ACTIONS && !isEmptyDiff(diff)) {
  console.log(`::notice title=ThrustCurve motors changed::${motorDiffHeadline(diff)}`);
}
