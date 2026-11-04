import { test, expect, defined, ready, type Page } from './base';
import { AERO_PANE, aeroChartsDrawn, axeViolations, CONFIGS, press, THEMES, TOOL, TWO_D, VIEW } from './axe';
import { eachEditor } from './editors';
import { DESIGN_VIEWS, RESULT_VIEWS, TOOLS, type ConfigsTab, type Tab, type ViewMode } from '../src/state/tabs';
import { taskTabs } from '../src/components/layout/tabTable';

const BAR: Record<Exclude<Tab, 'design'>, string> = {
  configs: 'Config',
  sim: 'Simulate',
  results: 'Results',
  simple: 'Benchtop',
  tools: 'Tools',
};

async function tap(page: Page, label: string): Promise<void> {
  const button = page.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name: label, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-current', 'page');
}

const PANES: Partial<Record<ViewMode, Record<string, string>>> = {
  '2d': TWO_D,
  drag: AERO_PANE,
};

async function scanViews(page: Page, where: string, views: readonly ViewMode[]): Promise<string[]> {
  const found: string[] = [];
  for (const view of views) {
    await press(page, VIEW[view]);
    await expect(page.getByText('Loading 3D…')).toHaveCount(0);
    if (view === 'drag') await aeroChartsDrawn(page);
    const panes = PANES[view];
    if (!panes) {
      found.push(...(await axeViolations(page, `${where} / ${VIEW[view]}`)));
      continue;
    }
    for (const pane of Object.values(panes)) {
      await press(page, pane);
      found.push(...(await axeViolations(page, `${where} / ${VIEW[view]} / ${pane}`)));
    }
  }
  return found;
}

const SCREENS: { name: string; scan: (page: Page) => Promise<string[]>; timeout?: number }[] = [
  {
    name: 'Rocket',
    scan: async (page) => {
      await tap(page, 'Rocket');
      return axeViolations(page, 'Rocket');
    },
  },
  {
    name: 'Sketch',
    scan: async (page) => {
      await tap(page, 'Sketch');
      return scanViews(page, 'Sketch', DESIGN_VIEWS);
    },
  },
  ...taskTabs(true).map(({ id }) => ({
    name: BAR[id as keyof typeof BAR],
    scan: async (page: Page): Promise<string[]> => {
      const label = BAR[id as keyof typeof BAR];
      await tap(page, label);
      if (id === 'results') return scanViews(page, label, RESULT_VIEWS);
      const found: string[] = [];
      if (id === 'configs') {
        for (const sub of Object.keys(CONFIGS) as ConfigsTab[]) {
          const toggle = page.getByRole('button', { name: CONFIGS[sub], exact: true });
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-current', 'true');
          found.push(...(await axeViolations(page, `${label} / ${CONFIGS[sub]}`)));
        }
      } else if (id === 'tools') {
        for (const tool of TOOLS) {
          const tab = page.getByRole('tab', { name: TOOL[tool], exact: true });
          await tab.click();
          await expect(tab).toHaveAttribute('aria-selected', 'true');
          found.push(...(await axeViolations(page, `${label} / ${TOOL[tool]}`)));
        }
      } else {
        found.push(...(await axeViolations(page, label)));
      }
      return found;
    },
  })),
  {
    // The phone has no tree, so each part is chosen at laptop width.
    name: 'Part editors',
    timeout: 300_000,
    scan: async (page) => {
      const phone = defined(page.viewportSize(), 'the phone viewport');
      const laptop = { width: 1200, height: 900 };
      const found: string[] = [];
      await page.setViewportSize(laptop);
      await eachEditor(
        page,
        async (name) => {
          await page.setViewportSize(phone);
          await expect(page.getByRole('dialog', { name: 'Edit component' })).toBeVisible();
          found.push(...(await axeViolations(page, name)));
          await page.setViewportSize(laptop);
        },
        { dialog: true },
      );
      return found;
    },
  },
  {
    name: 'Simulate / two ticked',
    scan: async (page) => {
      await tap(page, BAR.sim);
      await page.getByRole('button', { name: 'Duplicate simulation' }).click();
      await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
      await expect(page.getByRole('status').filter({ hasText: 'Editing 2 selected simulations.' })).toBeVisible();
      return axeViolations(page, 'Simulate / two ticked');
    },
  },
  {
    name: 'Results / outdated',
    scan: async (page) => {
      await tap(page, BAR.sim);
      const angle = page.getByLabel('Angle', { exact: true });
      await angle.fill('7');
      await angle.blur();
      await tap(page, BAR.results);
      await expect(page.getByText('Outdated', { exact: true }).first()).toBeVisible();
      return axeViolations(page, 'Results / outdated');
    },
  },
  {
    name: 'Menu and Settings',
    scan: async (page) => {
      await page.getByRole('button', { name: 'Menu' }).click();
      const found = await axeViolations(page, 'Menu');
      await page.getByRole('menuitem', { name: 'Settings' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      found.push(...(await axeViolations(page, 'Settings')));
      return found;
    },
  },
];

for (const theme of THEMES) {
  test.describe(`axe on a phone in the ${theme} theme`, () => {
    for (const screen of SCREENS) {
      test(`finds nothing on ${screen.name}`, async ({ page }) => {
        test.setTimeout(screen.timeout ?? 120_000);
        await ready(page);
        await page.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name: 'Simulate' }).click();
        await page.getByRole('button', { name: /Run flight simulation/ }).click();
        await expect(page.getByRole('button', { name: 'Results', exact: true })).toBeVisible({ timeout: 30_000 });
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        const found = await screen.scan(page);
        expect(found, found.join('\n')).toEqual([]);
      });
    }
  });
}
