import { STORAGE_PREFIX, nsKey } from '../src/services/storage/storageKeys';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

const SETTINGS_KEY = nsKey('settings:v1');

export type WipState = 'acknowledged' | 'shown';

// The seed merges, not overwrites: it reruns on every `page.reload()`.
export const test = base.extend<{ wip: WipState }>({
  wip: ['acknowledged', { option: true }],
  // `run`, not `use`: the react-hooks lint rule reads a bare `use(...)` as the React hook.
  page: async ({ page, wip }, run) => {
    if (wip === 'acknowledged') {
      await page.addInitScript((key: string) => {
        const stored = (): Record<string, unknown> => {
          try {
            return (JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>) ?? {};
          } catch {
            return {};
          }
        };
        try {
          localStorage.setItem(key, JSON.stringify({ ...stored(), wipAcknowledged: true }));
        } catch {
          // about:blank has no usable storage.
        }
      }, SETTINGS_KEY);
    }
    // Downloads, not `showSaveFilePicker`, whose dialog nothing can answer here.
    await page.addInitScript((key: string) => {
      try {
        const stored = (JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>) ?? {};
        localStorage.setItem(key, JSON.stringify({ ...stored, askWhereToSave: false }));
      } catch {
        // No usable storage on about:blank.
      }
    }, SETTINGS_KEY);
    await page.route(/arcgisonline\.com/, (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG }),
    );
    await run(page);
  },
});

const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export { expect };
export type { Locator, Page } from '@playwright/test';

// Not `console.log`, which floods the CI `github` reporter's annotations.
export const note = (...parts: unknown[]): void => {
  test.info().annotations.push({
    type: 'note',
    description: parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' '),
  });
};

export async function autosaved(page: Page, needle: string, atLeast = 1): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          // Passed in: this body runs serialized in the page, where imports do not reach.
          ([n, db]) =>
            new Promise<number>((resolve) => {
              const req = indexedDB.open(db);
              req.onerror = () => resolve(-1);
              req.onsuccess = () => {
                let tx;
                try {
                  tx = req.result.transaction('kv', 'readonly');
                } catch {
                  return resolve(-1);
                }
                const all = tx.objectStore('kv').getAll();
                all.onerror = () => resolve(-1);
                all.onsuccess = () =>
                  resolve(
                    all.result
                      .filter((v): v is string => typeof v === 'string')
                      .reduce((sum, v) => sum + v.split(n).length - 1, 0),
                  );
              };
            }),
          [needle, STORAGE_PREFIX] as const,
        ),
      { timeout: 15_000, message: `autosave never wrote ${atLeast}x ${needle}` },
    )
    .toBeGreaterThanOrEqual(atLeast);
}

// Scoped to the desktop strip: the phone's bottom bar, also in the DOM, shares names.
const TAB_NAMES: Record<string, RegExp> = {
  Configurations: /^(Configurations|Config)$/,
  Simulations: /^(Simulations|Simulate)$/,
};
export async function openTab(
  page: Page,
  name: 'Design' | 'Configurations' | 'Simulations' | 'Results' | 'Benchtop' | 'Tools',
): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Workbench' })
    .getByRole('button', { name: TAB_NAMES[name] ?? name, exact: true })
    .click();
}

// Exact labels: /^Run/ also matches "Run outdated (n)".
export function runButton(page: Page) {
  return page.getByRole('button', { name: /^(Run flight simulation|Run \d+ simulations|Cancel run)$/ });
}

export async function runFlight(page: Page): Promise<void> {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: /Run flight simulation/ }).click();
  await expect(page.getByRole('button', { name: 'Flight', exact: true })).toBeVisible({ timeout: 30_000 });
}

// Chromium may report a refused connection as "interrupted by another navigation".
// Nothing in the app navigates during a cold load, so an interruption here is the server.
const REFUSED = /ERR_CONNECTION_REFUSED|is interrupted by another navigation/;

async function openApp(page: Page, tries = 3): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await page.goto('/');
      return;
    } catch (e) {
      if (i >= tries || !REFUSED.test(String(e))) throw e;
      // Back-to-back tries can all land inside the same brief refusal.
      await new Promise((resolve) => setTimeout(resolve, 500 * i));
    }
  }
}

// A refused script request leaves the static `#boot` splash up for good, so that case reloads.
export async function ready(page: Page, tries = 3): Promise<void> {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  const numbers = page.getByText('L/D', { exact: true });
  for (let i = 1; ; i++) {
    const from = problems.length;
    const refused = () => problems.slice(from).some((p) => p.includes('ERR_CONNECTION_REFUSED'));
    await openApp(page);
    try {
      await expect
        .poll(
          async () => {
            if (await numbers.isVisible()) return 'ready';
            if (i < tries && refused() && (await page.locator('#boot').count()) > 0) return 'refused';
            return 'waiting';
          },
          { timeout: 20_000, message: "the engine's numbers (L/D) never appeared" },
        )
        .not.toBe('waiting');
      if (await numbers.isVisible()) return;
    } catch (err) {
      const state = await page
        .evaluate(() => ({
          // The splash is static markup inside #root; React replacing #boot is the mount.
          mounted: !document.getElementById('boot'),
          onScreen: document.body.innerText.trim().replace(/\s+/g, ' ').slice(0, 200),
        }))
        .catch((e: unknown) => ({ evaluateFailed: String(e) }));
      throw new Error(
        `${(err as Error).message}\n\nready() gave up with: ${JSON.stringify({ ...state, problems }, null, 2)}`,
      );
    }
  }
}

// `setInputFiles` returns before the async parse, so this waits for the fixture's Booster stage.
export async function importOrk(page: Page, fixture: string, clash?: NameClash): Promise<void> {
  await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
  // By `accept`: there is one hidden file input per readable format.
  await page.locator('input[accept=".ork"]').setInputFiles(fixture);
  if (clash) await resolveNameClash(page, clash);
  await expect(page.getByText('Booster').first()).toBeVisible({ timeout: 20_000 });
}

export type NameClash = 'overwrite' | 'keepBoth';

async function resolveNameClash(page: Page, choice: NameClash): Promise<void> {
  const ask = page.getByRole('alertdialog', { name: 'A rocket with this name is already saved' });
  await expect(ask).toBeVisible({ timeout: 20_000 });
  await ask.getByRole('button', { name: choice === 'overwrite' ? 'Overwrite' : 'Keep both' }).click();
  if (choice === 'keepBoth') {
    await page.getByRole('dialog', { name: 'Name this rocket' }).getByRole('button', { name: 'Save' }).click();
  }
}

// The banner shows the name as plain text, so it has no role to find it by.
export const designTitle = (page: Page) => page.getByTestId('design-name');

export async function importRkt(page: Page, fixture: string, designName: string, clash?: NameClash): Promise<void> {
  await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.locator('input[accept=".rkt"]').setInputFiles(fixture);
  if (clash) await resolveNameClash(page, clash);
  await expect(designTitle(page)).toContainText(designName, { timeout: 20_000 });
}

export function defined<T>(value: T | undefined | null, what: string): T {
  expect(value, `${what} was not found`).toBeDefined();
  expect(value, `${what} was not found`).not.toBeNull();
  return value as T;
}

export async function box(target: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await target.boundingBox();
  if (!b) throw new Error(`${String(target)} has no bounding box: not rendered, or detached`);
  return b;
}

export function tableUnder(page: Page, heading: string | RegExp): Locator {
  return page.getByRole('heading', { name: heading }).locator('xpath=following::table[1]');
}

export async function tableRows(page: Page, heading: string | RegExp): Promise<string[][]> {
  const table = tableUnder(page, heading);
  await expect(table, `no table under the "${heading}" heading`).toBeVisible();
  // A read while the Aero pane is aria-busy sees the previous sweep's numbers.
  await expect(page.locator('[aria-busy="true"]'), 'a pane was still computing').toHaveCount(0, { timeout: 20_000 });
  return table.evaluate((t) =>
    [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => (c.textContent || '').trim())),
  );
}
