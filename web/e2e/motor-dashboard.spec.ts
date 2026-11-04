import { test, expect, type Page } from './base';

async function openDashboard(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Motor dashboard' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opens from the menu and shows a motor detail on row selection', async ({ page }) => {
  const dialog = await openDashboard(page);
  await dialog.getByPlaceholder(/Search by code/i).fill('C6');

  // The grid renders before the catalog lands; a row clicked too early is replaced.
  const row = dialog.locator('tbody tr').first();
  await expect(row).toContainText('C6', { timeout: 30_000 });
  await row.click();
  await expect(dialog.getByText('View on ThrustCurve.org')).toBeVisible();
  await expect(dialog.locator('svg').first()).toBeVisible();
});

test('grid columns are sortable (toggle asc/desc)', async ({ page }) => {
  const dialog = await openDashboard(page);
  const impulse = dialog.getByRole('button', { name: /Impulse/ });
  await impulse.click();
  await expect(impulse).toContainText('▲');
  await impulse.click();
  await expect(impulse).toContainText('▼');
});

test('column chooser adds columns and remembers them across a reload', async ({ page }) => {
  let dialog = await openDashboard(page);

  await expect(dialog.getByRole('button', { name: /Peak/ })).toHaveCount(0);

  await dialog.getByText('Columns', { exact: true }).click();
  for (const name of ['Peak', 'Mass', 'Type']) {
    await dialog.getByRole('checkbox', { name, exact: true }).check();
  }
  await expect(dialog.getByRole('button', { name: /Peak/ })).toBeVisible();

  await expect(dialog.locator('table').first()).toHaveCSS('white-space', 'nowrap');

  await page.reload();
  dialog = await openDashboard(page);
  await expect(dialog.getByRole('button', { name: /Peak/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Type/ })).toBeVisible();
});

test('adding many columns scrolls the grid, it does not shove the detail pane', async ({ page }) => {
  const dialog = await openDashboard(page);
  const search = dialog.getByPlaceholder(/Search by code/i);
  await search.fill('C6');
  const row = dialog.locator('tbody tr').first();
  await expect(row).toContainText('C6', { timeout: 30_000 });
  await row.click();
  await expect(dialog.getByText('View on ThrustCurve.org')).toBeVisible();
  await search.fill('');

  await dialog.getByText('Columns', { exact: true }).click();
  for (const name of [
    'Peak',
    'Length',
    'Mass',
    'Prop',
    'Delays',
    'Type',
    'Common name',
    'Propellant',
    'Isp s',
    'Mass frac.',
    'Sparky',
    'Curves',
  ]) {
    await dialog.getByRole('checkbox', { name, exact: true }).check();
  }
  await dialog.getByText('Columns', { exact: true }).click();

  await expect(dialog.getByText('View on ThrustCurve.org')).toBeVisible();
  const overflows = await dialog.locator('tbody').evaluate((tb) => {
    const c = tb.closest('.overflow-auto') as HTMLElement;
    return c.scrollWidth > c.clientWidth;
  });
  expect(overflows).toBe(true);
});

test('a motor with no bundled thrust curve cannot be checked', async ({ page }) => {
  const dialog = await openDashboard(page);
  // A2 (Jambol/Ultra) has no bundled curve.
  await expect(dialog.getByRole('checkbox', { name: 'Select A2', exact: true }).first()).toBeDisabled();
});

test('compare opens full-width, honors chosen columns, and Back returns to the grid', async ({ page }) => {
  const dialog = await openDashboard(page);

  await dialog.getByText('Columns', { exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Isp s', exact: true }).check();
  await dialog.getByText('Columns', { exact: true }).click();

  const compare = dialog.getByRole('button', { name: /Compare \(/ });
  await expect(compare).toHaveCount(0);
  const boxes = dialog.locator('tbody input[type="checkbox"]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();

  await expect(dialog.getByText(/Overlay their thrust curves/i)).toBeVisible();
  await expect(compare).toBeEnabled();
  await compare.click();

  expect(await dialog.locator('svg path[stroke]').count()).toBeGreaterThanOrEqual(2);
  await expect(dialog.getByRole('columnheader', { name: 'Isp s' })).toBeVisible();

  await dialog.getByRole('button', { name: /Back to list/ }).click();
  await expect(dialog.getByRole('button', { name: /Impulse/ })).toBeVisible();
});

test('combines the checked motors into one cluster curve', async ({ page }) => {
  const dialog = await openDashboard(page);
  const boxes = dialog.locator('tbody input[type="checkbox"]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();

  await dialog.getByRole('button', { name: /Combine \(/ }).click();
  await expect(dialog.getByText('Combined cluster')).toBeVisible();
  await expect(dialog.getByText(/2-motor cluster/)).toBeVisible();

  await expect(dialog.getByText('Combined total')).toBeVisible();
  expect(await dialog.locator('svg path[stroke]').count()).toBeGreaterThanOrEqual(3);
});
