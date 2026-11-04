import { test, expect, openTab, ready, runButton, type Page } from './base';

// exact: `getByLabel` matches substrings.
const padSelect = (page: Page) => page.getByLabel('Saved location', { exact: true });

const savePad = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Save this location' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save this location' });
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('option', { name })).toBeAttached();
};

// `NumberInput` shows its draft while focused, and `selectOption` does not move focus.
const blurFields = (page: Page) => page.getByText('LAUNCH SITE').click();

test('a saved location survives a reload and fills the site fields', async ({ page }) => {
  await ready(page);
  await openTab(page, 'Simulations');

  await page.getByLabel('Latitude', { exact: true }).fill('39.05');
  await page.getByLabel('Longitude', { exact: true }).fill('-104.8');
  await page.getByLabel('Altitude', { exact: true }).fill('1830');
  await savePad(page, 'Home field');

  await page.reload();
  await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
  await openTab(page, 'Simulations');

  await expect(page.getByRole('option', { name: 'Home field' })).toBeAttached();
  await page.getByLabel('Latitude', { exact: true }).fill('0');
  await blurFields(page);

  await padSelect(page).selectOption({ label: 'Home field' });
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('39.05');
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue('-104.8');
  await expect(page.getByLabel('Altitude', { exact: true })).toHaveValue('1830');
});

test('the picker says Custom once the fields no longer match', async ({ page }) => {
  await ready(page);
  await openTab(page, 'Simulations');
  await savePad(page, 'Home field');

  await expect(padSelect(page)).toHaveValue(/.+/);
  await page.getByLabel('Latitude', { exact: true }).fill('12.5');
  await blurFields(page);
  await expect(padSelect(page)).toHaveValue('');
});

test('picking Custom location returns the site to the launch defaults', async ({ page }) => {
  await ready(page);
  await openTab(page, 'Simulations');
  await page.getByLabel('Latitude', { exact: true }).fill('39.05');
  await page.getByLabel('Longitude', { exact: true }).fill('-104.8');
  await savePad(page, 'Home field');
  await expect(padSelect(page)).toHaveValue(/.+/);

  await blurFields(page);
  await padSelect(page).selectOption('');
  await expect(padSelect(page)).toHaveValue('');

  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('28.61');
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue('-80.6');
  await expect(runButton(page)).toBeEnabled();

  await page.keyboard.press('Control+z');
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('39.05');
  await expect(page.getByLabel('Longitude', { exact: true })).toHaveValue('-104.8');
});

test('a location can be edited and deleted', async ({ page }) => {
  await ready(page);
  await openTab(page, 'Simulations');
  await savePad(page, 'Old name');

  await page.getByRole('button', { name: 'Manage saved locations' }).click();
  const manage = page.getByRole('dialog', { name: 'Manage saved locations' });
  await manage.getByRole('button', { name: /Old name/ }).click();
  await manage.getByRole('textbox').fill('New name');
  await manage.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(manage.getByText('New name')).toBeVisible();
  await expect(manage.getByText('Old name')).toHaveCount(0);

  await manage.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(manage.getByText(/No saved locations yet/i)).toBeVisible();

  await manage.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('option', { name: 'New name' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage saved locations' })).toBeDisabled();
});

test('launch locations open from the menu, and say what they are when empty', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Launch locations' }).click();

  const dialog = page.getByRole('dialog', { name: 'Manage saved locations' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/No saved locations yet/i)).toBeVisible();
});

test('a location applies to the current simulation from the menu', async ({ page }) => {
  await ready(page);
  await openTab(page, 'Simulations');
  await page.getByLabel('Latitude', { exact: true }).fill('39.05');
  await savePad(page, 'Home field');
  await page.getByLabel('Latitude', { exact: true }).fill('0');
  await blurFields(page);

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Launch locations' }).click();
  const menuManage = page.getByRole('dialog', { name: 'Manage saved locations' });
  await menuManage.getByRole('button', { name: /Home field/ }).click();
  await menuManage.getByRole('button', { name: 'Use', exact: true }).click();

  await expect(menuManage).toBeHidden();
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('39.05');
});

test('a location’s coordinates can be corrected, not just its name', async ({ page }) => {
  await ready(page);
  await openTab(page, 'Simulations');
  await page.getByLabel('Latitude', { exact: true }).fill('39.05');
  await savePad(page, 'Home field');

  await page.getByRole('button', { name: 'Manage saved locations' }).click();
  const manage = page.getByRole('dialog', { name: 'Manage saved locations' });
  await manage.getByRole('button', { name: /Home field/ }).click();
  await manage.getByLabel('Latitude', { exact: true }).fill('39.1234');
  await manage.getByLabel('Altitude', { exact: true }).fill('1830');
  await expect(manage.getByRole('textbox')).toHaveValue('Home field');
  await manage.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(manage.getByRole('button', { name: /Home field 39\.1234/ })).toBeVisible();
  await manage.getByRole('button', { name: 'Close' }).click();

  await page.getByLabel('Latitude', { exact: true }).fill('0');
  await blurFields(page);
  await padSelect(page).selectOption({ label: 'Home field' });
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('39.1234');
  await expect(page.getByLabel('Altitude', { exact: true })).toHaveValue('1830');
});

test('a location can be created from nothing, in the menu', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Launch locations' }).click();

  const manage = page.getByRole('dialog', { name: 'Manage saved locations' });
  await manage.getByRole('button', { name: 'New location' }).click();
  await manage.getByRole('textbox').fill('Bong');
  await manage.getByLabel('Latitude', { exact: true }).fill('42.66');
  await manage.getByLabel('Longitude', { exact: true }).fill('-88.14');
  await manage.getByLabel('Altitude', { exact: true }).fill('238');
  await manage.getByRole('button', { name: 'Save', exact: true }).click();

  // Scoped to the list row: the map's readout shows the same coordinate.
  await expect(manage.getByRole('button', { name: /Bong/ })).toContainText(/42\.6600/);

  await manage.getByRole('button', { name: 'Use', exact: true }).click();
  await openTab(page, 'Simulations');
  await expect(page.getByLabel('Latitude', { exact: true })).toHaveValue('42.66');
});
