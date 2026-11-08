import { existsSync } from 'node:fs';
import { test, expect, defined, runFlight, ready, openTab, importRkt, type Page, type WipState } from './base';
import { AERO_PANE, aeroChartsDrawn, axeViolations, CONFIGS, press, THEMES, TOOL, TWO_D, VIEW } from './axe';
import { DIALOG_SURFACES, type DialogSurface } from './dialogSurfaces';
import { POPUP_SURFACES, type PopupSurface } from './popupSurfaces';
import { eachEditor } from './editors';
import { answer } from '../tests/testing/openMeteoFixture';
import { DESIGN_VIEWS, RESULT_VIEWS, type ViewMode } from '../src/state/tabs';
import { STORAGE_PREFIX, nsKey } from '../src/services/storage/storageKeys';
import type { HeaderDialog, LibraryTab, SettingsTab } from '../src/components/layout/dialogKeys';

const SETTINGS: Record<SettingsTab, string> = {
  general: 'General',
  units: 'Units',
  colors: 'Colors',
  materials: 'Materials',
  playback: 'Playback',
  sketch: 'Sketch',
  sim: 'Simulation',
  launch: 'Launch',
  flyer: 'Flyer',
};
const LIBRARY: Record<LibraryTab, string> = { mine: 'My rockets', examples: 'Examples' };

const keys = <K extends string>(r: Record<K, unknown>): K[] => Object.keys(r) as K[];

interface Scan {
  name: string;
  open: (page: Page) => Promise<void>;
  wip?: WipState;
  boot?: true;
}

async function openView(page: Page, view: ViewMode): Promise<void> {
  await press(page, VIEW[view]);
  await expect(page.getByText('Loading 3D…')).toHaveCount(0);
}

async function openAero(page: Page): Promise<void> {
  await openTab(page, 'Design');
  await openView(page, 'drag');
  await aeroChartsDrawn(page);
}

async function menu(page: Page, item: string, parent?: 'Import' | 'Export'): Promise<void> {
  await page.getByRole('button', { name: 'Menu' }).click();
  if (parent) await page.getByRole('menuitem', { name: parent, exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function dialogOpen(page: Page, name?: string) {
  const dialog = name ? page.getByRole('dialog', { name }) : page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

const fromMenu =
  (item: string, parent?: 'Import' | 'Export') =>
  async (page: Page): Promise<void> => {
    await menu(page, item, parent);
    await dialogOpen(page);
  };

// Playwright's cwd is web/.
const docsBuilt = existsSync('public/docs/index.html');

// Waits out the frame's theme transition, or axe reads colors mid-transition.
async function helpOpen(page: Page, item: 'Help' | 'Safety') {
  await menu(page, item);
  const dialog = await dialogOpen(page);
  if (!docsBuilt) {
    if (process.env.CI) throw new Error('web/public/docs is not built; run `npm run docs:build` before the scans');
    await expect(dialog.getByText(/The documentation is not part of this copy/)).toBeVisible();
    return dialog;
  }
  const frame = dialog.locator('iframe');
  await expect(frame).toBeVisible();
  await expect(frame).not.toHaveClass(/opacity-0/, { timeout: 20_000 });
  const doc = await (await frame.elementHandle())?.contentFrame();
  if (!doc) throw new Error('the Help frame has no document');
  await doc.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
  });
  return dialog;
}

async function dashboardWithTwo(page: Page) {
  await menu(page, 'Motor Dashboard');
  const dialog = await dialogOpen(page);
  const boxes = dialog.locator('tbody input[type="checkbox"]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  return dialog;
}

async function answerOpenMeteo(page: Page): Promise<void> {
  await page.route(/open-meteo\.com/, async (route) => {
    const url = route.request().url();
    const elevation = Number(new URL(url).searchParams.get('elevation') ?? 0);
    const body = url.includes('/v1/elevation')
      ? { elevation: [elevation] }
      : answer(elevation, { start: Math.floor(Date.now() / 1000 / 3600) * 3600 - 24 * 3600, hours: 96 });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    });
  });
}

async function engineStalled(page: Page): Promise<void> {
  await page.route(/openrocket-engine|\.wasm/, () => undefined);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
}

async function engineFailed(page: Page): Promise<void> {
  await page.route(/openrocket-engine|\.wasm/, (route) => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('The physics engine could not be loaded.').first()).toBeVisible({ timeout: 20_000 });
}

// The page must be controlled first, or the browser activates the new worker at once.
// A new script URL rather than `update()`: the update check bypasses the context's routes.
async function updateWaiting(page: Page): Promise<void> {
  let shipped = '';
  await page.context().route(/\/sw\.js(\?.*)?$/, async (route) => {
    const url = route.request().url();
    const res = await route.fetch({ url: url.replace(/\?.*$/, '') });
    const body = await res.text();
    shipped = /sw-build-(\d+)\.js/.exec(body)?.[1] ?? '';
    const next = url.includes('?') ? String(Number(shipped) + 1) : shipped;
    await route.fulfill({ response: res, body: body.replace(`sw-build-${shipped}.js`, `sw-build-${next}.js`) });
  });
  await page.context().route(/\/sw-build-\d+\.js$/, async (route) => {
    const url = route.request().url();
    const res = await route.fetch({ url: url.replace(/sw-build-\d+/, `sw-build-${shipped}`) });
    const body = await res.text();
    const id = /sw-build-(\d+)/.exec(url)?.[1] ?? shipped;
    await route.fulfill({ response: res, body: body.replace(/build: \d+/, `build: ${id}`) });
  });
  await ready(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    await navigator.serviceWorker.register(`${reg.active?.scriptURL ?? '/sw.js'}?next`, { scope: reg.scope });
  });
  await expect(page.getByText('A new version is available.')).toBeVisible({ timeout: 30_000 });
}

async function viewFallback(page: Page): Promise<void> {
  await page.route(/\/assets\/Rocket3D-[^/]*\.js$/, (route) => route.abort());
  await ready(page);
  await openTab(page, 'Design');
  await page.getByRole('button', { name: '3D', exact: true }).first().click();
  await expect(page.getByRole('alert').filter({ hasText: /Reload/ })).toBeVisible({ timeout: 20_000 });
}

const BOOT: Scan[] = [
  {
    name: 'Engine banner / loading',
    boot: true,
    open: async (page) => {
      await engineStalled(page);
      await expect(page.getByText('Downloading engine…').first()).toBeVisible({ timeout: 20_000 });
    },
  },
  {
    name: 'Engine banner / slow',
    boot: true,
    open: async (page) => {
      await engineStalled(page);
      await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible({ timeout: 40_000 });
    },
  },
  { name: 'Engine banner / failed', boot: true, open: engineFailed },
  { name: 'Update banner', boot: true, open: updateWaiting },
  { name: 'View fallback', boot: true, open: viewFallback },
];

const SCREENS: Scan[] = [
  ...keys(TWO_D).map((side): Scan => ({
    name: `Design / 2D / ${TWO_D[side]}`,
    open: async (page) => {
      await openTab(page, 'Design');
      await openView(page, '2d');
      await press(page, TWO_D[side]);
    },
  })),
  ...DESIGN_VIEWS.filter((v) => v !== '2d' && v !== 'drag').map((view): Scan => ({
    name: `Design / ${VIEW[view]}`,
    open: async (page) => {
      await openTab(page, 'Design');
      await openView(page, view);
    },
  })),
  ...keys(AERO_PANE)
    .filter((pane) => pane !== 'components')
    .map((pane): Scan => ({
      name: `Design / Aero / ${AERO_PANE[pane]}`,
      open: async (page) => {
        await openAero(page);
        await press(page, AERO_PANE[pane]);
      },
    })),
  ...['By magnitude', 'By heat'].map((shading): Scan => ({
    name: `Design / Aero / Per component, ${shading}`,
    open: async (page) => {
      await openAero(page);
      await press(page, AERO_PANE.components);
      await press(page, shading);
    },
  })),
  ...keys(CONFIGS).map((sub): Scan => ({
    name: `Configurations / ${CONFIGS[sub]}`,
    open: async (page) => {
      await openTab(page, 'Configurations');
      const toggle = page
        .getByRole('navigation', { name: 'Flight configurations' })
        .getByRole('button', { name: CONFIGS[sub], exact: true });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-current', 'true');
    },
  })),
  {
    name: 'Simulations',
    open: async (page) => {
      await runFlight(page);
      await openTab(page, 'Simulations');
    },
  },
  {
    name: 'Simulations / two ticked',
    open: ticked,
  },
  {
    name: 'Results / outdated',
    open: async (page) => {
      await runFlight(page);
      await openTab(page, 'Design');
      await page.locator('div[title="Body tube"]').first().click();
      await page.getByLabel('Length', { exact: true }).first().fill('45');
      await openTab(page, 'Results');
      await expect(page.getByText('Outdated', { exact: true }).first()).toBeVisible();
    },
  },
  ...RESULT_VIEWS.map((view): Scan => ({
    name: `Results / ${VIEW[view]}`,
    open: (page) => resultView(page, view),
  })),
  {
    name: 'Design / whole window',
    open: async (page) => {
      await openTab(page, 'Design');
      const toggle = page.getByRole('button', { name: 'Expand the drawing to the whole window' });
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    },
  },
  {
    name: 'Results / Flight / one panel',
    open: async (page) => {
      await resultView(page, 'flight');
      await page.getByRole('button', { name: 'Show only this panel' }).first().click();
    },
  },
  {
    name: 'Settings / widened',
    open: async (page) => {
      await dialogTab(page, 'Settings', SETTINGS.general);
      await page.getByRole('button', { name: 'Make this dialog wider' }).click();
    },
  },
  ...keys(TOOL).map((tool): Scan => ({
    name: `Tools / ${TOOL[tool]}`,
    open: (page) => openTool(page, TOOL[tool]),
  })),
  {
    name: 'Tools / Landing estimator / estimate',
    open: async (page) => {
      await answerOpenMeteo(page);
      await openTool(page, TOOL.landing);
      await page.getByRole('button', { name: 'Estimate landing' }).click();
      await expect(page.getByText('Lands at')).toBeVisible({ timeout: 20_000 });
    },
  },
];

async function ticked(page: Page): Promise<void> {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();
  await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
  await expect(page.getByRole('status').filter({ hasText: 'Editing 2 selected simulations.' })).toBeVisible();
}

async function openTool(page: Page, name: string): Promise<void> {
  await openTab(page, 'Tools');
  const tab = page.getByRole('tab', { name, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function dialogTab(page: Page, item: string, tab: string): Promise<void> {
  await menu(page, item);
  const dialog = await dialogOpen(page);
  const button = dialog.getByRole('tab', { name: tab, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-selected', 'true');
}

const HEADER_DIALOGS: Record<Exclude<HeaderDialog, 'settings' | 'library' | 'motors'>, Scan['open']> = {
  report: fromMenu('Rocket Design Report'),
  about: fromMenu('About'),
  privacy: fromMenu('Privacy'),
  updates: fromMenu('Check for updates'),
  examples: fromMenu('Import one of the examples', 'Import'),
  print: fromMenu('Export printable parts as 3MF', 'Export'),
  locations: fromMenu('Launch Locations'),
  parts: fromMenu('Custom Parts'),
  materials: fromMenu('Custom Materials'),
  backup: fromMenu('Export backup (.json)', 'Export'),
  restore: fromMenu('Restore backup (.json)', 'Import'),
  saveAs: fromMenu('Save As…'),
};

const header = (id: keyof typeof HEADER_DIALOGS): Scan => ({ name: `Menu / ${id}`, open: HEADER_DIALOGS[id] });

async function resultView(page: Page, view: ViewMode): Promise<void> {
  await runFlight(page);
  await openTab(page, 'Results');
  await openView(page, view);
}

async function selectPart(page: Page, name: string): Promise<void> {
  await openTab(page, 'Design');
  await page.getByRole('tree', { name: 'Components' }).locator(`[title="${name}"]`).first().click();
}

async function pathExport(page: Page) {
  await resultView(page, 'path');
  await page.getByTitle('Export flight path (KML / GPX / CSV)').click();
  return dialogOpen(page, 'Export flight path');
}

const SAVED_PART = 'Bench tube';
const BROKEN_PART = 'Bench tube with no sizes';
const SAVED_DESIGN = 'Bench rocket';
const SAVED_LOCATION = 'Bench field';

async function savePart(page: Page): Promise<void> {
  await selectPart(page, 'Body tube');
  await page.getByRole('button', { name: 'Save as part' }).click();
  const dialog = await dialogOpen(page, 'Save as a reusable part');
  await dialog.getByLabel('Part name').fill(SAVED_PART);
  await dialog.getByLabel('Maker').fill('Bench');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

// Straight to the store: the app's own save refuses a part with no dimensions.
async function storeBrokenPart(page: Page): Promise<void> {
  await savePart(page);
  await page.evaluate(
    // Passed in: this body runs serialized in the page, where imports do not reach.
    ([db, key, partNo]) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(db);
        req.onerror = () => reject(new Error(String(req.error)));
        req.onsuccess = () => {
          const tx = req.result.transaction('kv', 'readwrite');
          const store = tx.objectStore('kv');
          const get = store.get(key);
          get.onsuccess = () => {
            const list = JSON.parse(String(get.result)) as Record<string, unknown>[];
            store.put(JSON.stringify([{ ...list[0], id: 'no-sizes', partNo, node: {} }, ...list]), key);
          };
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(new Error(String(tx.error)));
        };
      }),
    [STORAGE_PREFIX, nsKey('parts:custom'), BROKEN_PART] as const,
  );
}

async function myPartsOn(page: Page, partNo: string) {
  await HEADER_DIALOGS.parts(page);
  const dialog = await dialogOpen(page, 'Custom Parts');
  await dialog.getByRole('button', { name: new RegExp(partNo) }).click();
  await expect(dialog.getByLabel('Part name')).toHaveValue(partNo);
  return dialog;
}

async function saveDesign(page: Page): Promise<void> {
  await HEADER_DIALOGS.saveAs(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(SAVED_DESIGN);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function saveLocation(page: Page): Promise<void> {
  await HEADER_DIALOGS.locations(page);
  const dialog = page.getByRole('dialog', { name: 'Manage saved locations' });
  await dialog.getByRole('button', { name: 'New location' }).click();
  await dialog.getByRole('textbox').fill(SAVED_LOCATION);
  await dialog.getByLabel('Latitude', { exact: true }).fill('42.66');
  await dialog.getByLabel('Longitude', { exact: true }).fill('-88.14');
  await dialog.getByLabel('Altitude', { exact: true }).fill('238');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('button', { name: new RegExp(SAVED_LOCATION) })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
}

const DIALOG_SCANS: Record<DialogSurface, Scan[]> = {
  SettingsDialog: keys(SETTINGS).map((tab): Scan => ({
    name: `Settings / ${SETTINGS[tab]}`,
    open: (page) => dialogTab(page, 'Settings', SETTINGS[tab]),
  })),
  DesignLibraryDialog: [
    ...keys(LIBRARY).map((tab): Scan => ({
      name: `Open / ${LIBRARY[tab]}`,
      open: (page) => dialogTab(page, 'Open…', LIBRARY[tab]),
    })),
    {
      name: 'Open / My rockets / saved design',
      open: async (page) => {
        await saveDesign(page);
        await dialogTab(page, 'Open…', LIBRARY.mine);
        const dialog = page.getByRole('dialog', { name: 'My Rockets' });
        await expect(dialog.getByRole('button', { name: new RegExp(`^${SAVED_DESIGN}`) })).toBeVisible();
      },
    },
  ],
  ExportDialog: [header('report')],
  ReportPrintSettings: [
    {
      name: 'Report / print settings',
      open: async (page) => {
        await HEADER_DIALOGS.report(page);
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await dialogOpen(page, 'Print settings');
      },
    },
  ],
  AboutDialog: [header('about')],
  PrivacyDialog: [header('privacy')],
  UpdateCheckDialog: [header('updates')],
  ExamplesDialog: [header('examples')],
  PrintExportDialog: [header('print')],
  LocationsDialog: [
    header('locations'),
    {
      name: 'Launch Locations / editor',
      open: async (page) => {
        await HEADER_DIALOGS.locations(page);
        await page.getByRole('button', { name: 'New location' }).click();
        await expect(page.getByRole('dialog').getByRole('spinbutton').first()).toBeVisible();
      },
    },
    {
      name: 'Launch Locations / saved location',
      open: async (page) => {
        await saveLocation(page);
        await HEADER_DIALOGS.locations(page);
        const dialog = page.getByRole('dialog', { name: 'Manage saved locations' });
        await dialog.getByRole('button', { name: new RegExp(SAVED_LOCATION) }).click();
        await expect(dialog.getByLabel('Latitude', { exact: true })).toHaveValue(/^42\.66/);
      },
    },
  ],
  BackupDialog: [header('backup'), header('restore')],
  MyMaterialsDialog: [
    header('materials'),
    {
      name: 'Custom Materials / new material',
      open: async (page) => {
        await HEADER_DIALOGS.materials(page);
        await page
          .getByRole('dialog', { name: 'Custom Materials' })
          .getByRole('button', { name: 'New material' })
          .click();
      },
    },
  ],
  SavedPartsDialog: [
    header('parts'),
    {
      name: 'Custom Parts / saved part',
      open: async (page) => {
        await savePart(page);
        await myPartsOn(page, SAVED_PART);
      },
    },
    {
      name: 'Custom Parts / part with no sizes',
      open: async (page) => {
        await storeBrokenPart(page);
        const dialog = await myPartsOn(page, BROKEN_PART);
        await expect(dialog.getByText('This part is missing dimensions')).toBeVisible();
      },
    },
  ],
  DesignPropertiesDialog: [header('saveAs')],
  MotorDashboard: [
    {
      name: 'Motor Dashboard / detail',
      open: async (page) => {
        await menu(page, 'Motor Dashboard');
        const dialog = await dialogOpen(page);
        // The grid draws before the catalog lands; a row clicked earlier is replaced under the click.
        await dialog.getByPlaceholder(/Search by code/i).fill('C6');
        const row = dialog.locator('tbody tr').first();
        await expect(row).toContainText('C6');
        await row.click();
        await expect(dialog.getByText('View on ThrustCurve.org')).toBeVisible();
      },
    },
    {
      name: 'Motor Dashboard / Exhaust styles',
      open: async (page) => {
        await menu(page, 'Motor Dashboard');
        const dialog = await dialogOpen(page);
        await dialog.getByRole('button', { name: 'Exhaust styles', exact: true }).click();
        await expect(dialog.getByRole('heading', { name: 'Dark smoke' })).toBeVisible();
      },
    },
    {
      name: 'Motor Dashboard / Compare',
      open: async (page) => {
        const dialog = await dashboardWithTwo(page);
        await dialog.getByRole('button', { name: /Compare \(/ }).click();
        await expect(dialog.getByRole('button', { name: /Back to list/ })).toBeVisible();
      },
    },
    {
      name: 'Motor Dashboard / Combine',
      open: async (page) => {
        const dialog = await dashboardWithTwo(page);
        await dialog.getByRole('button', { name: /Combine \(/ }).click();
        await expect(dialog.getByText('Combined cluster')).toBeVisible();
      },
    },
  ],
  HelpDialog: [
    {
      name: 'Help',
      open: async (page) => {
        await helpOpen(page, 'Help');
      },
    },
    {
      name: 'Safety',
      open: async (page) => {
        await helpOpen(page, 'Safety');
      },
    },
  ],
  MotorDialog: [
    {
      name: 'Motor picker',
      open: async (page) => {
        await openTab(page, 'Configurations');
        await page
          .getByRole('button', { name: /change/i })
          .first()
          .click();
        const dialog = await dialogOpen(page);
        await expect(dialog.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
      },
    },
  ],
  MotorSpecDialog: [
    {
      name: 'Motor thrust curve',
      open: async (page) => {
        await openTab(page, 'Configurations');
        await page.getByRole('button', { name: 'Thrust curve', exact: true }).first().click();
        await dialogOpen(page);
      },
    },
  ],
  ComponentPicker: [
    {
      name: 'Component picker',
      open: async (page) => {
        await selectPart(page, 'Body tube');
        const pick = page.getByRole('button', { name: /^Select part…/ });
        await expect(pick).toBeEnabled({ timeout: 20_000 });
        await pick.click();
        const dialog = await dialogOpen(page, 'Select a part');
        await expect(dialog.locator('tbody tr').first()).toBeVisible();
      },
    },
    {
      name: 'Component picker / saved part',
      open: async (page) => {
        await savePart(page);
        await page.getByRole('button', { name: /^Select part…/ }).click();
        const dialog = await dialogOpen(page, 'Select a part');
        const row = dialog.locator('tbody tr').filter({ hasText: SAVED_PART });
        await expect(row.getByRole('button', { name: `Delete saved part ${SAVED_PART}` })).toBeVisible();
      },
    },
  ],
  SavePartButton: [
    {
      name: 'Save as part',
      open: async (page) => {
        await selectPart(page, 'Body tube');
        await page.getByRole('button', { name: 'Save as part' }).click();
        await dialogOpen(page, 'Save as a reusable part');
      },
    },
  ],
  RecoverySizingReadout: [
    {
      name: 'Descent sizing',
      open: async (page) => {
        await selectPart(page, 'Parachute');
        await page.getByRole('button', { name: 'Descent sizing…' }).click();
        await dialogOpen(page, 'Descent sizing');
      },
    },
  ],
  FinFlutterReadout: [
    {
      name: 'Fin flutter',
      open: async (page) => {
        await selectPart(page, 'Trapezoidal fin set');
        await page.getByRole('button', { name: 'Fin flutter…' }).click();
        await dialogOpen(page, 'Fin flutter');
      },
    },
  ],
  // Under `2xl` the part editor is a dialog.
  ComponentDialog: [
    {
      name: 'Component editor',
      open: async (page) => {
        await page.setViewportSize({ width: 1200, height: 900 });
        await selectPart(page, 'Nose cone');
        await dialogOpen(page, 'Edit component');
      },
    },
  ],
  RocketConfigDialog: [
    {
      name: 'Rocket configuration',
      open: async (page) => {
        await openTab(page, 'Design');
        await page.getByRole('button', { name: 'Edit rocket configuration' }).click();
        await dialogOpen(page, 'Rocket configuration');
      },
    },
  ],
  ScaleDialog: [
    {
      name: 'Scale',
      open: async (page) => {
        await openTab(page, 'Design');
        await page.getByRole('button', { name: /Scale/ }).first().click();
        await dialogOpen(page, 'Scale rocket');
      },
    },
  ],
  WindProfileDialog: [
    {
      name: 'Wind profile',
      open: async (page) => {
        await openTab(page, 'Simulations');
        await page.getByRole('radio', { name: 'Multi-level' }).check();
        await page.getByRole('button', { name: 'Edit wind profile…' }).click();
        await dialogOpen(page);
      },
    },
  ],
  SimpleMotorGuide: [
    {
      name: 'Benchtop motor guide',
      open: async (page) => {
        await openTab(page, 'Benchtop');
        for (const [label, value] of [
          ['Body diameter', '2.48'],
          ['Overall length', '45'],
          ['Dry mass', '40'],
          ['CG, no motor', '25'],
          ['Motor mount diameter', '18'],
        ] as const) {
          const box = page.getByLabel(label, { exact: true });
          await box.fill(value);
          await box.blur();
        }
        await page.getByRole('button', { name: 'Motor guide' }).click();
        const dialog = await dialogOpen(page);
        await expect(dialog.getByRole('button', { name: /^Fly\b/ })).toBeVisible();
      },
    },
  ],
  MotorGuideDialog: [
    {
      name: 'Motor guide',
      open: async (page) => {
        await openTab(page, 'Simulations');
        await page.getByRole('button', { name: 'Motor guide' }).click();
        const dialog = await dialogOpen(page);
        await expect(dialog.getByRole('button', { name: /^Fly\b/ })).toBeVisible();
      },
    },
  ],
  WeatherDialog: [
    {
      name: 'Weather',
      open: async (page) => {
        await answerOpenMeteo(page);
        await openTab(page, 'Simulations');
        await page.getByRole('button', { name: 'Get weather…' }).click();
        await page.getByRole('button', { name: 'Fetch', exact: true }).click();
        await expect(page.getByText('Atmosphere aloft')).toBeVisible();
      },
    },
  ],
  PlaceSearchDialog: [
    {
      name: 'Find a place',
      open: async (page) => {
        await answerOpenMeteo(page);
        await openTab(page, 'Simulations');
        await page.getByRole('button', { name: 'Find a place' }).first().click();
        const dialog = await dialogOpen(page);
        const field = dialog.getByRole('textbox');
        await field.fill('39.05, -104.8');
        await field.press('Enter');
        await expect(dialog.getByRole('listitem').getByRole('button')).toBeEnabled();
      },
    },
  ],
  SiteMapDialog: [
    {
      name: 'Launch site map',
      open: async (page) => {
        await openTab(page, 'Simulations');
        await page.getByLabel('Latitude', { exact: true }).fill('39.05');
        await page.getByLabel('Longitude', { exact: true }).fill('-104.8');
        // Off the number field first, so the coordinates commit.
        await page.getByText('LAUNCH SITE').click();
        await page.getByRole('button', { name: 'Show on map' }).click();
        const dialog = await dialogOpen(page, 'Launch site');
        await expect(dialog.locator('img').first()).toBeVisible();
      },
    },
  ],
  FlightCsvDialog: [
    {
      name: 'Flight data CSV',
      open: async (page) => {
        await resultView(page, 'flight');
        await page.getByRole('button', { name: 'Download flight data as CSV' }).first().click();
        await dialogOpen(page);
      },
    },
  ],
  FlightPathExport: [
    {
      name: 'Flight path export',
      open: async (page) => {
        await pathExport(page);
      },
    },
  ],
  StageColorDialog: [
    {
      name: 'Flight path export / stage colors',
      open: async (page) => {
        const dialog = await pathExport(page);
        await dialog.getByRole('button', { name: 'Stage colors…' }).click();
        await dialogOpen(page, 'Stage colors');
      },
    },
  ],
  ConfirmDialog: [
    {
      name: 'Confirm',
      open: async (page) => {
        await menu(page, 'Settings');
        const settings = await dialogOpen(page);
        await settings.getByRole('button', { name: 'Reset all' }).click();
        await expect(page.getByRole('alertdialog')).toBeVisible();
      },
    },
  ],
  WorkInProgressDialog: [
    {
      name: 'Work in progress',
      wip: 'shown',
      open: async (page) => {
        await expect(page.getByRole('alertdialog')).toBeVisible();
      },
    },
  ],
};

async function openMenu(page: Page, trigger: ReturnType<Page['getByRole']>): Promise<void> {
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('menu').first()).toBeVisible();
}

async function toggle(fold: ReturnType<Page['getByRole']>): Promise<void> {
  const was = await fold.getAttribute('aria-expanded');
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', was === 'true' ? 'false' : 'true');
}

async function openDetails(summary: ReturnType<Page['locator']>): Promise<void> {
  await summary.click();
  await expect(summary.locator('xpath=..')).toHaveAttribute('open', '');
}

const POPUP_SCANS: Record<PopupSurface, Scan[]> = {
  CheckMenu: [
    {
      name: 'Popup / dashboard columns',
      open: async (page) => {
        await menu(page, 'Motor Dashboard');
        const dialog = await dialogOpen(page);
        await openDetails(dialog.locator('summary', { hasText: 'Columns' }));
      },
    },
    {
      name: 'Popup / motor manufacturers',
      open: async (page) => {
        await menu(page, 'Motor Dashboard');
        const dialog = await dialogOpen(page);
        await openDetails(dialog.locator('summary', { hasText: 'All manufacturers' }).first());
      },
    },
  ],
  ComponentExportButton: [
    {
      name: 'Popup / part export menu',
      open: async (page) => {
        await openTab(page, 'Design');
        const tree = page.getByRole('tree', { name: 'Components' });
        await openMenu(page, tree.getByRole('button', { name: 'Export', exact: true }).first());
      },
    },
  ],
  ComponentTree: [
    {
      name: 'Popup / component list folded',
      open: async (page) => {
        await openTab(page, 'Design');
        await toggle(page.getByTitle(/the component list/));
      },
    },
    {
      name: 'Popup / component row folded',
      open: async (page) => {
        await openTab(page, 'Design');
        const tree = page.getByRole('tree', { name: 'Components' });
        const row = tree.locator('[role="treeitem"][aria-expanded="true"]').first();
        await row.getByRole('button', { name: 'Collapse' }).click();
        await expect(tree.locator('[role="treeitem"][aria-expanded="false"]').first()).toBeVisible();
      },
    },
  ],
  DesignNotesSection: [
    {
      name: 'Popup / design notes',
      open: async (page) => {
        await openTab(page, 'Design');
        await toggle(page.getByRole('button', { name: 'Design notes', exact: true }));
      },
    },
  ],
  FileMenu: [
    {
      name: 'Popup / menu',
      open: async (page) => {
        await openMenu(page, page.getByRole('button', { name: 'Menu' }));
      },
    },
    {
      name: 'Popup / menu / Import',
      open: async (page) => {
        await page.getByRole('button', { name: 'Menu' }).click();
        await toggle(page.getByRole('menuitem', { name: 'Import', exact: true }));
      },
    },
  ],
  GroundTrack: [
    {
      name: 'Popup / drift sweep',
      open: async (page) => {
        await resultView(page, 'ground');
        await toggle(page.getByRole('button', { name: /^Drift/ }));
        await expect(page.getByRole('heading', { name: 'Drift sweep' })).toBeVisible();
      },
    },
  ],
  HelpDialog: [
    {
      name: 'Popup / help contents',
      open: async (page) => {
        const dialog = await helpOpen(page, 'Help');
        const contents = dialog.getByRole('button', { name: 'Contents' });
        await expect(contents).toBeVisible({ timeout: 20_000 });
        await toggle(contents);
      },
    },
  ],
  ImageExportMenu: [
    {
      name: 'Popup / image export menu',
      open: async (page) => {
        await openTab(page, 'Design');
        await openView(page, '2d');
        await openMenu(page, page.getByRole('button', { name: 'Image', exact: true }).first());
      },
    },
  ],
  LoadedBanner: [
    {
      name: 'Popup / import notes',
      open: async (page) => {
        await importRkt(page, 'e2e/fixtures/rocksim.rkt', 'RockSim Bird');
        const notes = page.getByRole('button', { name: /import note/ });
        if ((await notes.getAttribute('aria-expanded')) !== 'true') await notes.click();
        await expect(notes).toHaveAttribute('aria-expanded', 'true');
      },
    },
  ],
  MotorFilterBar: [
    {
      name: 'Popup / motor performance filters',
      open: async (page) => {
        await menu(page, 'Motor Dashboard');
        const dialog = await dialogOpen(page);
        const more = dialog.getByRole('button', { name: /^More filters/ });
        await more.click();
        await expect(more).toHaveAttribute('aria-expanded', 'true');
      },
    },
  ],
  RecoveryBaysPane: [
    {
      name: 'Popup / stage bays folded',
      open: async (page) => {
        await openTab(page, 'Configurations');
        await page
          .getByRole('navigation', { name: 'Flight configurations' })
          .getByRole('button', { name: CONFIGS.bays, exact: true })
          .click();
        await toggle(page.locator('h3 > button[aria-expanded]').first());
      },
    },
  ],
  ResultPicker: [
    {
      name: 'Popup / flight picker',
      open: async (page) => {
        await ready(page);
        await openTab(page, 'Simulations');
        await page.getByRole('button', { name: 'Duplicate simulation' }).click();
        await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
        await page.getByRole('button', { name: 'Run 2 simulations' }).click();
        await openMenu(page, page.getByRole('button', { name: /^Choose which flight to show/ }));
      },
    },
  ],
  SafetyCard: [
    {
      name: 'Popup / safety card folded',
      open: async (page) => {
        await runFlight(page);
        await openTab(page, 'Results');
        const fold = page.getByRole('button', { name: 'Before you fly' }).first();
        await fold.click();
        await page.getByRole('alertdialog').getByRole('button', { name: 'I understand' }).click();
        await expect(fold).toHaveAttribute('aria-expanded', 'false');
      },
    },
  ],
  SimpleHelp: [
    {
      name: 'Popup / Benchtop help open',
      open: async (page) => {
        // Under xl the help is a fold.
        await page.setViewportSize({ width: 1100, height: 950 });
        await openTab(page, 'Benchtop');
        const help = page.locator('details').filter({ hasText: 'How it works' });
        await help.locator('summary').click();
        await expect(help).toHaveAttribute('open', '');
      },
    },
  ],
  StabilityBadge: [
    {
      name: 'Popup / statistics folded',
      open: async (page) => {
        await openTab(page, 'Design');
        await toggle(
          page
            .getByRole('button')
            .filter({ has: page.getByText('Information', { exact: true }) })
            .first(),
        );
      },
    },
  ],
};
const POPUPS: Scan[] = keys(POPUP_SCANS).flatMap((id) => POPUP_SCANS[id]);

for (const id of keys(POPUP_SCANS)) {
  if (POPUP_SCANS[id].length < POPUP_SURFACES[id]) throw new Error(`${id} renders more popups than are scanned`);
}

for (const id of keys(DIALOG_SCANS)) {
  if (DIALOG_SCANS[id].length < DIALOG_SURFACES[id]) throw new Error(`${id} renders more dialogs than are scanned`);
}
const DIALOGS: Scan[] = keys(DIALOG_SCANS).flatMap((id) => DIALOG_SCANS[id]);
for (const id of keys(HEADER_DIALOGS)) {
  if (!DIALOGS.some((d) => d.name === `Menu / ${id}`)) throw new Error(`the menu's ${id} dialog is not scanned`);
}

for (const theme of THEMES) {
  test.describe(`axe in the ${theme} theme`, () => {
    for (const scan of [...SCREENS, ...DIALOGS, ...POPUPS, ...BOOT]) {
      test.describe(() => {
        if (scan.wip) test.use({ wip: scan.wip });
        const themed = (page: Page) =>
          page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        const start = scan.boot
          ? async (page: Page) => {
              await scan.open(page);
              await themed(page);
            }
          : async (page: Page) => {
              await ready(page);
              await themed(page);
              await scan.open(page);
            };

        test(`finds nothing on ${scan.name}`, async ({ page }) => {
          test.setTimeout(90_000);
          await start(page);
          const found = await axeViolations(page, scan.name);
          expect(found, found.join('\n')).toEqual([]);
        });
      });
    }

    test('finds nothing on any part editor', async ({ page }) => {
      test.setTimeout(240_000);
      await ready(page);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const found: string[] = [];
      await eachEditor(page, async (name) => {
        found.push(...(await axeViolations(page, name)));
      });
      expect(found, found.join('\n')).toEqual([]);
    });
  });
}

test.describe('accessibility', () => {
  test('the export dialog closes on Escape and names its close button', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: /Rocket Design Report/i }).click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();

    await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the settings tabs are a real tablist, not color alone', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: /Settings/i }).click();

    const tabs = page.getByRole('tab');
    expect(await tabs.count()).toBeGreaterThan(1);
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  });

  test('unit chips in the stats strip have distinct accessible names', async ({ page }) => {
    await page.goto('/');

    const strip = page.locator('div.grid').filter({ hasText: 'Max diameter' }).first();
    const names = await strip.evaluate((el) =>
      [...el.querySelectorAll('select[aria-label]')].map((s) => s.getAttribute('aria-label') || ''),
    );
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(new Set(names).size).toBe(names.length);
  });

  test('no two unit chips on one screen announce the same name', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('Max diameter')).toBeVisible();
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('select[aria-label]')]
        .map((s) => s.getAttribute('aria-label') || '')
        .filter((n) => /unit/i.test(n)),
    );
    expect(names.length).toBeGreaterThan(5);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `duplicate unit chip names: ${[...new Set(dupes)].join(', ')}`).toEqual([]);
  });

  test('a modal keeps Tab inside it and hands focus back on close', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Menu' }).click();
    const trigger = page.getByRole('menuitem', { name: /About/ });
    await trigger.click();

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await dialog.evaluate((el) => el.contains(document.activeElement));
      expect(inside, `focus escaped the dialog after ${i + 1} tabs`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the import and export .ork menu items are told apart', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();

    await page.getByRole('menuitem', { name: /^Import$/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Import OpenRocket (.ork)' })).toBeVisible();
  });

  test('the aero chart crosshair can be driven from the keyboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Aero', exact: true }).click();

    const chart = page.getByRole('group', { name: /arrow keys to move the crosshair/i }).first();
    await expect(chart).toBeVisible();

    await chart.focus();
    const crosshair = () => page.locator('svg line[data-crosshair]');
    // Count, not visibility: Playwright reports a 1px SVG <line> hidden even when drawn.
    expect(await crosshair().count()).toBeGreaterThan(0);

    const xAt = async () => crosshair().first().getAttribute('x1');
    const start = await xAt();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await xAt()).not.toBe(start);

    await page.keyboard.press('Home');
    const home = await xAt();
    await page.keyboard.press('End');
    expect(await xAt()).not.toBe(home);
    await page.keyboard.press('Escape');
    await expect(crosshair()).toHaveCount(0);
  });

  test('the flight chart crosshair can be driven from the keyboard', async ({ page }) => {
    await page.goto('/');
    await runFlight(page);
    await page.getByRole('button', { name: 'Flight', exact: true }).click();

    const charts = page.getByRole('group', { name: /arrow keys to move the crosshair/i }).first();
    await expect(charts).toBeVisible();

    const readout = page.locator('[role="status"][aria-live="polite"]').filter({ hasText: /\d/ }).first();
    await charts.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(readout).toHaveText(/\d/);
    const mid = defined(await readout.textContent(), 'the crosshair announcement');

    // Retrying `toHaveText`: the region updates after the keypress.
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(readout).not.toHaveText(mid);

    await page.keyboard.press('Home');
    await expect(readout).not.toHaveText(mid);
    const atStart = defined(await readout.textContent(), 'the crosshair announcement at Home');
    await page.keyboard.press('End');
    await expect(readout).not.toHaveText(atStart);
  });

  test('the charts describe themselves to a screen reader', async ({ page }) => {
    await page.goto('/');
    await runFlight(page);
    await page.getByRole('button', { name: 'Flight', exact: true }).click();
    await expect(page.getByRole('img', { name: /^Altitude: peak \S+ m at [\d.]+ s$/ })).toBeVisible();
    await expect(page.getByText(/^Events: .*Apogee at [\d.]+ s/)).toHaveCount(1);

    await openTab(page, 'Design');
    await page.getByRole('button', { name: 'Aero', exact: true }).click();
    await expect(page.getByRole('img', { name: /peak .* at Mach [\d.]+/ }).first()).toBeVisible();
  });
});
