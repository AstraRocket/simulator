import { test, expect, type Page, autosaved, openTab, runFlight } from './base';

// Diameter thumbs hold slider indices, not mm.

async function openPicker(page: Page) {
  await openTab(page, 'Configurations');
  await page
    .getByRole('button', { name: /change/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await openTab(page, 'Configurations');
});

test('opens with the seated motor already selected', async ({ page }) => {
  const dialog = await openPicker(page);

  const seeded = dialog.locator('ul li button[aria-pressed="true"]');
  await expect(seeded).toHaveCount(1);
  await expect(seeded).toContainText('C6');
  await expect(dialog.getByRole('button', { name: 'Select', exact: true })).toBeVisible();
  await expect(dialog.getByText(/Select a motor to see/i)).toHaveCount(0);
});

test('select-then-confirm applies the chosen motor and closes the dialog', async ({ page }) => {
  const dialog = await openPicker(page);
  const select = dialog.getByRole('button', { name: 'Select', exact: true });

  await dialog.getByPlaceholder(/Search by code/i).fill('A8');
  await expect(select).toHaveCount(0);

  const row = dialog.locator('ul li button[aria-pressed]').first();
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  const designation = (await row.locator('.font-medium').first().innerText()).trim();

  await expect(select).toBeEnabled();
  await select.click();
  await expect(dialog).toBeHidden();

  await expect(page.getByRole('region', { name: /Motor/ }).first().getByText(designation)).toBeVisible();
});

test('predetermined delays show as chips and any motor can be flown plugged', async ({ page }) => {
  const dialog = await openPicker(page);

  await dialog.getByPlaceholder(/Search by code/i).fill('C6');
  await dialog.locator('ul li button[aria-pressed]').first().click();

  const plugged = dialog.getByRole('button', { name: 'plugged', exact: true });
  await expect(plugged).toBeVisible();
  await expect(dialog.getByRole('button', { name: '5', exact: true })).toBeVisible();

  await plugged.click();
  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText('plugged', { exact: false }).first()).toBeVisible();
});

test('"fits the mount" pulls the diameter ceiling down to the mount, and gives it back', async ({ page }) => {
  const dialog = await openPicker(page);
  const maxThumb = dialog.getByLabel('Diameter max');
  const fits = dialog.getByRole('checkbox', { name: /Fits the mount/ });

  await expect(fits).toBeChecked();
  await expect(dialog.getByText(/Fits the mount \(\d+(\.\d+)? mm\)/)).toBeVisible();

  await expect(maxThumb).toHaveValue('2'); // STD_DIAMS [6, 13, 18, …] → 18 mm
  await expect(dialog.getByText(/Any–18\.0 mm/)).toBeVisible();
  await expect(maxThumb).toHaveAttribute('max', '9');

  await fits.uncheck();
  await expect(maxThumb).toHaveValue('9');
  await expect(dialog.getByText(/Any–Any/)).toBeVisible();

  await fits.check();
  await expect(maxThumb).toHaveValue('2');
  await expect(dialog.getByText(/Any–18\.0 mm/)).toBeVisible();

  await maxThumb.focus();
  await maxThumb.press('ArrowRight');
  await expect(maxThumb).toHaveValue('3');
  await expect(fits).not.toBeChecked();
});

test('the diameter range persists across reloads', async ({ page }) => {
  let dialog = await openPicker(page);
  // The mount's cap is never remembered, only a user's own choice.
  const maxThumb = dialog.getByLabel('Diameter max');
  await maxThumb.focus();
  await maxThumb.press('ArrowLeft');
  await expect(maxThumb).toHaveValue('1');

  await page.reload();
  dialog = await openPicker(page);
  await expect(dialog.getByLabel('Diameter max')).toHaveValue('1');
});

test('the picker filters by total impulse', async ({ page }) => {
  const dialog = await openPicker(page);
  // Waited for: `count()` does not retry, and the catalog is a large fetch.
  const rows = dialog.locator('ul li button[aria-pressed]');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  expect(before).toBeGreaterThan(1);

  await dialog.getByLabel('Total impulse min').fill('15');
  await expect(rows).not.toHaveCount(before);
  expect(await rows.count()).toBeGreaterThan(0);

  await dialog.getByLabel('Total impulse min').fill('100000');
  await expect(dialog.getByText('No matching motors.')).toBeVisible();
  await expect(dialog.getByText(/Only motors that go in this mount/)).toBeVisible();
});

test('the manufacturer selection persists across reloads', async ({ page }) => {
  let dialog = await openPicker(page);
  const summary = dialog.locator('summary');
  await expect(summary).toHaveText(/All manufacturers/i);

  await summary.click();
  // Unscoped, `.first()` can hit the "Fits the mount" checkbox before the list opens.
  const firstMfr = dialog.locator('details').getByRole('checkbox').first();
  const name = await firstMfr.evaluate((el) => el.closest('label')?.textContent?.trim() ?? '');
  await firstMfr.check();
  await expect(summary).toHaveText(name);

  await page.reload();
  dialog = await openPicker(page);
  await expect(dialog.locator('summary')).toHaveText(name);
});

test('the motor card exposes an ignition event that persists across reloads', async ({ page }) => {
  const ignition = page.getByLabel('Ignition', { exact: true });
  await expect(ignition).toBeVisible();
  await expect(ignition).toHaveValue('automatic');

  // Every IgnitionEvent, as desktop's IgnitionSelectionDialog offers them.
  await expect(ignition.locator('option')).toHaveCount(5);
  for (const value of ['automatic', 'launch', 'ejectioncharge', 'burnout', 'never']) {
    await expect(ignition.locator(`option[value="${value}"]`)).toHaveCount(1);
  }

  await ignition.selectOption('launch');
  await expect(page.getByLabel('Ignition delay (s)')).toBeVisible();

  await autosaved(page, '"ignitionEvent":"launch"');
  await page.reload();
  await openTab(page, 'Configurations');
  await expect(page.getByLabel('Ignition', { exact: true })).toHaveValue('launch');
});

test('a launch-delayed primary ignition still simulates end-to-end', async ({ page }) => {
  await page.getByLabel('Ignition', { exact: true }).selectOption('launch');
  await page.getByLabel('Ignition delay (s)').fill('3');

  await runFlight(page);
  await expect(page.getByText('not run')).toHaveCount(0);
});

test('the motor card opens a read-only thrust-curve popup', async ({ page }) => {
  await page.getByRole('button', { name: 'Thrust curve' }).first().click();

  const popup = page.getByRole('dialog');
  await expect(popup).toBeVisible();
  await expect(popup.getByText('C6', { exact: false }).first()).toBeVisible();
  await expect(popup.locator('svg').first()).toBeVisible();
});

test('hides motors out of regular production until the box is cleared', async ({ page }) => {
  const dialog = await openPicker(page);
  await dialog.getByPlaceholder(/Search by code/i).fill('A8');
  const rows = dialog.locator('ul li');
  await expect(rows.filter({ hasText: 'Estes' })).not.toHaveCount(0);
  await expect(rows.filter({ hasText: 'Quest' })).toHaveCount(0);

  await dialog.getByRole('checkbox', { name: 'Hide motors not in regular production' }).uncheck();
  await expect(rows.filter({ hasText: 'Quest' })).not.toHaveCount(0);
  await rows.filter({ hasText: 'Quest' }).first().getByRole('button').first().click();
  await expect(dialog.getByText('Out of production')).toBeVisible();
});
