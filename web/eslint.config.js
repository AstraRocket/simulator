import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import playwright from 'eslint-plugin-playwright';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import { createNodeResolver, importX } from 'eslint-plugin-import-x';

// `arr[i]!` stays allowed: `noUncheckedIndexedAccess` cannot see a loop's bound, and a helper or `?? 0` in numeric
// and mesh loops would cost speed or turn a visible failure into a wrong number. See docs/CODE_QUALITY.md.
const NON_NULL_OUTSIDE_INDEX = {
  selector: 'TSNonNullExpression[expression.computed!=true]',
  message: 'Narrow the value, or use `must` from services/app/must when the code already guarantees it.',
};

// `no-restricted-imports` sees only static imports, so the syntax rule catches `import()` and `typeof import()`.
/** @param {string[]} layers @returns {import('eslint').Linter.RulesRecord} */
const banLayers = (...layers) => {
  const names = layers.join('|');
  const message = `This layer must not depend on ${layers.join(' or ')}: pass what it needs in as an argument.`;
  const selector = `/(^|\\/)(${names})\\//`;
  return {
    'no-restricted-imports': ['error', { patterns: [{ regex: `(^|/)(${names})/`, message }] }],
    'no-restricted-syntax': [
      'error',
      { selector: `ImportExpression[source.value=${selector}]`, message },
      { selector: `TSImportType[argument.literal.value=${selector}]`, message },
      NON_NULL_OUTSIDE_INDEX,
    ],
  };
};

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'playwright-report',
      'test-results',
      'public',
      'src/engine/vendor',
      'openrocket-database',
    ],
  },
  {
    files: ['scripts/**/*.mjs', '*.js', '*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.worker },
      // Not `projectService`: it finds only the nearest `tsconfig.json` and fails on e2e specs and root configs.
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.e2e.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/memo-dependencies': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
      'react-hooks/globals': 'error',
      'react-hooks/error-boundaries': 'error',
      'react-hooks/static-components': 'error',
      'react-hooks/component-hook-factories': 'error',
      'react-hooks/use-memo': 'error',
      'react-hooks/set-state-in-render': 'error',
      'preserve-caught-error': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      // React never awaits a JSX handler, so `onClick={async () => ...}` is fine.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    },
  },
  {
    files: ['src/**/*.tsx'],
    extends: [jsxA11y.configs.recommended],
    rules: {
      'jsx-a11y-x/no-autofocus': 'off',
      // NumberInput renders an <input>, so a label wrapping it is labeled.
      'jsx-a11y-x/label-has-associated-control': [
        'error',
        { controlComponents: ['NumberInput', 'NumberWithUnit'], depth: 3 },
      ],
      // A site that breaks a rule disables it in place, with one of these reasons after `--`:
      // - Roving tabindex (menus, the component tree): the container is no tab stop.
      // - A focusable crosshair or map: arrow keys drive it and no widget role fits.
      // - The pane splitter: ARIA 1.2 makes a focusable separator a widget.
      // - A dialog panel's click: it only stops a backdrop click; Escape is its keyboard twin.
      // - Link text from `<Trans>`: filled from the translation at run time.
      // - A scrolling pane with little to focus: it needs its own tab stop.
      // - Enter caught on a form wrapper as it bubbles up from the fields.
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/*.config.{ts,js}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      // Testing Library queries infer their type from the surrounding cast, so this rule misfires.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    files: ['e2e/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'error',
      'playwright/no-wait-for-timeout': 'error',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    plugins: { vitest },
    rules: {
      'vitest/no-focused-tests': 'error',
      'vitest/no-disabled-tests': 'error',
      // `getBy*` throws when nothing matches, so it asserts presence.
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'screen.getBy*', 'within.getBy*'] }],
    },
  },
  // Before the layer blocks, which replace `no-restricted-syntax` on their files and so carry it themselves.
  {
    files: ['src/**/*.{ts,tsx}'],
    // A function over a limit takes a disable with its reason; one that shrinks back fails on the stale disable.
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-restricted-syntax': ['error', NON_NULL_OUTSIDE_INDEX],
      'max-lines-per-function': ['error', { max: 200, IIFEs: true }],
      complexity: ['error', { max: 30 }],
    },
  },
  {
    files: ['src/{engine,services,tree,i18n,prefs}/**/*.{ts,tsx}'],
    // The hook that binds units to the settings provider, so it is UI-side despite its folder.
    ignores: ['src/prefs/useUnits.ts'],
    rules: banLayers('state', 'components'),
  },
  {
    files: ['src/state/**/*.{ts,tsx}'],
    rules: banLayers('components'),
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/ignore': ['engine/vendor'],
      // Without these it parses no TypeScript file, so it follows no import and passes everything.
      'import-x/extensions': ['.ts', '.tsx'],
      'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
      'import-x/resolver-next': [
        createNodeResolver({
          extensions: ['.ts', '.tsx', '.js', '.mjs'],
          extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
        }),
      ],
    },
    // Type-only imports are erased at build, so they cannot form a cycle at run time.
    rules: { 'import-x/no-cycle': ['error', { ignoreExternal: true }] },
  },
  // Must be last: turns off rules that conflict with Prettier.
  prettier,
);
