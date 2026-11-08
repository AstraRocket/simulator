// Usage: npm run metrics. Prints the figures docs/CODE_QUALITY.md grades on, counted as ESLint counts them.
import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const LENGTH_STEPS = [100, 200, 400];
const COMPLEXITY_STEPS = [15, 30, 50];
const LARGE_COMPONENT_LINES = 500;

const selectors = {
  catches: 'CatchClause',
  emptyCatches: 'CatchClause[body.body.length=0]',
  nonNull: 'TSNonNullExpression',
  nonNullOutsideIndex: 'TSNonNullExpression[expression.computed!=true]',
  doubleCasts: "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
};

// Limits of 0 report every function; inline disables are off, so an exception still counts.
const eslint = new ESLint({
  overrideConfigFile: true,
  allowInlineConfig: false,
  overrideConfig: [
    { ignores: ['src/engine/vendor/**'] },
    {
      files: ['src/**/*.{ts,tsx}'],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      rules: {
        'max-lines-per-function': ['error', { max: 0, IIFEs: true }],
        complexity: ['error', { max: 0 }],
        'no-restricted-syntax': [
          'error',
          ...Object.entries(selectors).map(([name, selector]) => ({ selector, message: name })),
        ],
      },
    },
  ],
});

const results = await eslint.lintFiles(['src/**/*.{ts,tsx}']);
const lengths = [];
const complexities = [];
const counts = Object.fromEntries(Object.keys(selectors).map((name) => [name, 0]));
let disables = 0;
const large = [];

for (const { filePath, messages } of results) {
  const rel = filePath.replace(/\\/g, '/').replace(/^.*\/src\//, '');
  const text = readFileSync(filePath, 'utf8');
  disables += (text.match(/eslint-disable/g) ?? []).length;
  const lines = text.split('\n').length - 1;
  if (rel.startsWith('components/') && rel.endsWith('.tsx') && lines > LARGE_COMPONENT_LINES)
    large.push(`${rel} (${lines})`);
  for (const m of messages) {
    if (m.fatal) throw new Error(`${rel}: ${m.message}`);
    const where = `${rel}:${m.line}`;
    if (m.ruleId === 'max-lines-per-function') lengths.push({ where, value: Number(/\((\d+)\)/.exec(m.message)[1]) });
    if (m.ruleId === 'complexity')
      complexities.push({ where, value: Number(/complexity of (\d+)/.exec(m.message)[1]) });
    if (m.ruleId === 'no-restricted-syntax') counts[m.message] += 1;
  }
}

const over = (list, step) => list.filter((f) => f.value > step);
const steps = (list, all) => all.map((step) => over(list, step).length).join(' / ');
const list = (items, limit) =>
  over(items, limit)
    .sort((a, b) => b.value - a.value)
    .forEach((f) => console.log(`  ${String(f.value).padStart(4)}  ${f.where}`));

const rows = [
  ['Functions', lengths.length],
  [`Over ${LENGTH_STEPS.join(' / ')} lines`, steps(lengths, LENGTH_STEPS)],
  [`Over complexity ${COMPLEXITY_STEPS.join(' / ')}`, steps(complexities, COMPLEXITY_STEPS)],
  ['Catch blocks (empty of statements)', `${counts.catches} (${counts.emptyCatches})`],
  ['Non-null assertions (outside an index)', `${counts.nonNull} (${counts.nonNullOutsideIndex})`],
  ['`as unknown as` casts', counts.doubleCasts],
  ['eslint-disable comments', disables],
  [`Components over ${LARGE_COMPONENT_LINES} lines`, large.length],
];
for (const [name, value] of rows) console.log(`${name.padEnd(40)} ${value}`);
for (const c of large) console.log(`  ${c}`);
console.log(`\nFunctions over ${LENGTH_STEPS[1]} lines:`);
list(lengths, LENGTH_STEPS[1]);
console.log(`\nFunctions over complexity ${COMPLEXITY_STEPS[1]}:`);
list(complexities, COMPLEXITY_STEPS[1]);
