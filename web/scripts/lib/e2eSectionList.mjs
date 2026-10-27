/**
 * The end-to-end specs in sections, for `npm run e2e:sections`: each section
 * runs on its own and reports when it finishes. Every spec in `e2e/` is in
 * exactly one section (tests/repo/e2eSections.test.ts holds the list to the
 * folder), so a new spec has to be placed before it runs here.
 *
 * STEPS are the checks that are not Playwright specs: each makes its own
 * production builds in its own folder and serves them on its own port, with
 * the network switched off around a real service worker, so none can share the
 * sections' build. They run after the sections, by script name in `scripts/`.
 */
export const SECTIONS = {
  shell: [
    'smoke',
    'engine-boot',
    'wip-gate',
    'workbench-header',
    'daylight-toggle',
    'file-menu-focus',
    'settings-escape',
    'overlay-layering',
    'maximize',
    'pane-splitter',
    'layout-overflow',
    'mobile-layout',
    'sketch-rotation',
    'units',
    'number-entry',
    'help-dialog',
    'help-over-dialog',
  ],
  design: [
    'schematic',
    'schematic-interaction',
    'component-editor',
    'component-dialog',
    'component-dialog-undo',
    'design-meta',
    'tree-clipboard',
    'scale-dialog',
    'recovery',
    'saved-parts',
    'rocket-cutaway',
    'library',
  ],
  aero: ['aero', 'aero-conditions', 'aero-duplicate-names', 'aero-heat', 'aero-power-on', 'aero-table'],
  motors: ['motor-picker', 'motor-dashboard', 'motor-import'],
  simulation: [
    'simulations-tab',
    'auto-run',
    'launch-limits',
    'deploy-warnings',
    'weather',
    'launch-locations',
    'site-map',
    'drift-sweep',
  ],
  results: ['flight-chart-panels', 'flight-ground-map', 'ground-track-map'],
  tools: ['tools-tab', 'landing-estimator'],
  files: ['image-export', 'print-export', 'report-dialog', 'onshape', 'rocksim'],
  a11y: ['a11y', 'a11y-phone'],
};

export const STEPS = {
  'offline-data': 'check-offline-data.mjs',
  'offline-help': 'check-offline-help.mjs',
  update: 'check-update-flow.mjs',
};
