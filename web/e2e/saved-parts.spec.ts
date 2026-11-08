import { test, expect, ready } from './base';

const PART = 'My 29mm airframe';

async function saveSelectedAs(page: import('./base').Page, name: string) {
  await page.getByRole('button', { name: 'Save as part' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save as a reusable part' });
  await dialog.getByLabel('Part name').fill(name);
  await dialog.getByLabel('Maker').fill('Bench');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function confirmDelete(page: import('./base').Page) {
  const ask = page.getByRole('alertdialog');
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: /Delete|Confirm/ }).click();
  await expect(ask).toBeHidden();
}

async function openMyParts(page: import('./base').Page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Custom Parts' }).click();
  await expect(page.getByRole('dialog', { name: 'Custom Parts' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('Custom Parts is offered only where a design can be built', async ({ page }) => {
  const entry = page.getByRole('menuitem', { name: 'Custom Parts' });
  const menu = page.getByRole('button', { name: 'Menu' });

  await menu.click();
  await expect(entry).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: /whole window/ }).click();
  await menu.click();
  await expect(entry).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  await menu.click();
  await expect(entry).toHaveCount(0);
});

test('a saved body tube is offered back in the picker, starred, and can be deleted', async ({ page }) => {
  await page.locator('div[title="Body tube"]').click();

  const pick = page.getByRole('button', { name: /^Select part…/ });
  await expect(pick).toBeEnabled({ timeout: 20_000 });
  const before = Number(/\((\d+)\)/.exec((await pick.textContent()) ?? '')?.[1]);
  expect(before).toBeGreaterThan(0);

  await saveSelectedAs(page, PART);
  await expect(pick).toHaveText(new RegExp(`\\(${before + 1}\\)`), { timeout: 20_000 });

  await pick.click();
  const dialog = page.getByRole('dialog', { name: 'Select a part' });
  await expect(dialog).toBeVisible();
  const row = dialog.locator('tbody tr').filter({ hasText: PART });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('button', { name: PART, exact: true })).toHaveCount(1);
  await expect(row).toContainText('★ Bench');

  await row.getByRole('button', { name: `Delete saved part ${PART}` }).click();
  await confirmDelete(page);
  await expect(row).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

test('every saved part is listed and removable from the menu, whatever the design holds', async ({ page }) => {
  await page.locator('div[title="Body tube"]').click();
  await page.locator('select').filter({ hasText: 'Bulkhead' }).selectOption({ label: 'Bulkhead' });
  await saveSelectedAs(page, 'Bench bulkhead');
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await confirmDelete(page);

  await openMyParts(page);
  const dialog = page.getByRole('dialog', { name: 'Custom Parts' });
  await expect(dialog.getByRole('heading', { name: 'Bulkhead' })).toBeVisible();

  await dialog.getByRole('button', { name: /Bench bulkhead/ }).click();
  await expect(dialog.getByLabel('Part name')).toHaveValue('Bench bulkhead');

  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await confirmDelete(page);
  await expect(dialog.getByText('No saved parts yet.', { exact: false })).toBeVisible();
});

test('a saved part can be renamed and resized in place, and the picker follows', async ({ page }) => {
  await page.locator('div[title="Body tube"]').click();
  await saveSelectedAs(page, 'Bench draft');

  await openMyParts(page);
  const manage = page.getByRole('dialog', { name: 'Custom Parts' });
  await manage.getByRole('button', { name: /Bench draft/ }).click();

  await expect(manage.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await manage.getByLabel('Part name').fill('Bench 42cm tube');
  await manage.getByLabel('Length').fill('55');
  await manage.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(manage.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(manage.getByRole('listitem')).toHaveCount(1);
  const row = manage.getByRole('listitem').filter({ hasText: 'Bench 42cm tube' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('55.0');
  await manage.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /^Select part…/ }).click();
  const picker = page.getByRole('dialog', { name: 'Select a part' });
  await expect(picker.getByRole('button').filter({ hasText: 'Bench 42cm tube' })).toHaveCount(1);
  await expect(picker.getByRole('button').filter({ hasText: 'Bench draft' })).toHaveCount(0);
});

test('switching parts with unsaved edits asks before throwing them away', async ({ page }) => {
  await page.locator('div[title="Nose cone"]').click();
  await saveSelectedAs(page, 'Bench cone');
  await page.locator('div[title="Body tube"]').click();
  await saveSelectedAs(page, 'Bench tube');

  await openMyParts(page);
  const manage = page.getByRole('dialog', { name: 'Custom Parts' });
  await manage.getByRole('button', { name: /Bench cone/ }).click();
  await manage.getByLabel('Part name').fill('Bench cone edited');

  await manage.getByRole('button', { name: /Bench tube/ }).click();
  const ask = page.getByRole('alertdialog');
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(manage.getByLabel('Part name')).toHaveValue('Bench cone edited');

  await manage.getByRole('button', { name: /Bench tube/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard' }).click();
  await expect(manage.getByLabel('Part name')).toHaveValue('Bench tube');
  await manage.getByRole('button', { name: /Bench cone/ }).click();
  await expect(manage.getByLabel('Part name')).toHaveValue('Bench cone');
});

test('a saved part carries back what no catalog column describes', async ({ page }) => {
  await page.locator('div[title="Body tube"]').click();
  const mount = page.getByLabel('Motor mount');
  await mount.check();
  await saveSelectedAs(page, 'Bench 29mm mount');

  await mount.uncheck();
  await expect(mount).not.toBeChecked();
  await page.getByRole('button', { name: /^Select part…/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Select a part' });
  await dialog.getByRole('button').filter({ hasText: 'Bench 29mm mount' }).click();
  await expect(dialog).toBeHidden();
  await expect(mount).toBeChecked();
});
