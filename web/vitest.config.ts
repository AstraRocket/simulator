import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// Vitest does not read vite.config.ts, so its build-time constants need stand-ins here.
// DOM tests opt in with `// @vitest-environment jsdom` at the top of the file.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    __APP_CHANNEL__: JSON.stringify(''),
    __HELP_URL__: JSON.stringify('https://example.test/docs'),
    __CONTRIBUTORS_URL__: JSON.stringify('https://example.test/graphs/contributors'),
    __UPSTREAM__: JSON.stringify({
      ref: '0'.repeat(40),
      shortRef: '0'.repeat(9),
      date: '2000-01-01',
      commitUrl: `https://example.test/openrocket/commit/${'0'.repeat(40)}`,
    }),
  },
  resolve: {
    alias: {
      // The PWA virtual module fails to resolve under Vitest before `vi.mock` can run.
      'virtual:pwa-register/react': fileURLToPath(new URL('./tests/testing/pwaRegisterStub.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: process.env.REPO_CHECKS ? configDefaults.exclude : [...configDefaults.exclude, 'tests/repo/**'],
    environment: 'node',
    setupFiles: ['tests/testing/allLocales.ts'],
    slowTestThreshold: 2000,
    // Uncapped, a many-core box starts enough workers that kernel tests time out.
    maxWorkers: 4,
    ...(process.env.CI ? { testTimeout: 60_000, hookTimeout: 60_000 } : {}),
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/engine/vendor/**', 'src/**/*.d.ts'],
      thresholds: { lines: 89, branches: 80, functions: 84, statements: 88 },
    },
  },
});
