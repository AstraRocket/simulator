import { test, expect, ready } from './base';

/**
 * The Tools tab's parachute sizing, and the parachute editor's sizing dialog,
 * end to end. Nothing here leaves the machine: no forecast is asked for.
 */

test('Parachute sizing works from typed inputs', async ({ page }) => {
  await ready(page);
  await page.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name: 'Tools', exact: true }).click();
  await page.getByRole('tab', { name: 'Parachute sizing' }).click();
  const result = page.getByRole('region', { name: 'Parachute sizing result' });
  await expect(result.getByText(/^Main \(/)).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Canopy diameter' }).fill('60');
  await expect(result.getByText('This canopy')).toBeVisible();
});

test('the parachute editor opens its sizing in a dialog, and applies a size', async ({ page }) => {
  await ready(page);
  await page.locator('div[title="Parachute"]').click();
  await page.getByRole('button', { name: 'Descent sizing…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Descent sizing' });
  await expect(dialog.getByText(/^Estimated for a descent mass/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Use the main diameter' }).click();
  // The canopy now lands in the main band.
  await expect(dialog.getByText('(main range)')).toBeVisible();
});
