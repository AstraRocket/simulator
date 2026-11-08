import { constants, setPriority } from 'node:os';
import { defineConfig, devices } from '@playwright/test';

// a11y-phone.spec.ts takes its viewport from the mobile project only; the desktop project ignores it.
const MOBILE_SPECS = [
  '**/layout-overflow.spec.ts',
  '**/sketch-rotation.spec.ts',
  '**/mobile-layout.spec.ts',
  '**/file-menu-focus.spec.ts',
  '**/a11y-phone.spec.ts',
];

const CORE_SPECS = [
  '**/smoke.spec.ts',
  '**/engine-boot.spec.ts',
  '**/wip-gate.spec.ts',
  '**/schematic.spec.ts',
  '**/schematic-interaction.spec.ts',
  '**/component-editor.spec.ts',
  '**/component-dialog.spec.ts',
  '**/component-dialog-undo.spec.ts',
  '**/help-over-dialog.spec.ts',
  '**/settings-escape.spec.ts',
  '**/motor-picker.spec.ts',
  '**/simulations-tab.spec.ts',
  '**/auto-run.spec.ts',
  '**/units.spec.ts',
  '**/layout-overflow.spec.ts',
  '**/mobile-layout.spec.ts',
  '**/number-entry.spec.ts',
  '**/file-menu-focus.spec.ts',
];
const core = process.env.E2E_SCOPE === 'core';

// Software WebGL saturates the machine; child processes inherit the lower priority.
if (!process.env.CI) {
  try {
    setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // Not permitted here; the run goes on at normal priority.
  }
}

const localWorkers = Number(process.env.E2E_WORKERS) || 4;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : localWorkers,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
    // SwiftShader software-renders WebGL so the 3D views aren't blank without a GPU.
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader'] },
  },
  projects: [
    {
      name: 'chromium',
      // Past `2xl` (1536): below it the property column becomes a dialog.
      ...(core ? { testMatch: CORE_SPECS } : {}),
      testIgnore: '**/a11y-phone.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 950 } },
    },
    {
      name: 'mobile-chromium',
      testMatch: core ? MOBILE_SPECS.filter((spec) => CORE_SPECS.includes(spec)) : MOBILE_SPECS,
      use: { ...devices['Pixel 7'] },
    },
  ],
  // Never reused, so a leftover server cannot serve an old build.
  webServer: process.env.E2E_SERVED
    ? undefined
    : {
        command: 'npx vite build && npx vite preview --port 5180 --strictPort',
        url: 'http://localhost:5180',
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
