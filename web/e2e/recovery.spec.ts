import { test, expect, autosaved, runFlight } from './base';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('the parachute editor exposes deployment overrides, simulates, and persists', async ({ page }) => {
  await page.locator('div[title="Parachute"]').click();

  await expect(page.getByLabel('Shroud lines')).toBeVisible();
  // `exact`: getByLabel matches substrings, so the "Line length: Auto" switch would also match.
  await expect(page.getByLabel('Line length', { exact: true })).toBeVisible();
  await expect(page.getByText('Canopy material')).toBeVisible();
  await expect(page.getByText('Shroud line material')).toBeVisible();

  const deploy = page.getByLabel('Deploy at');
  await expect(deploy).toBeVisible();
  await expect(deploy).toHaveValue('apogee');

  await deploy.selectOption('altitude');
  await page.getByLabel('Deploy altitude (AGL)').fill('150');
  await page.getByLabel('Deploy delay').fill('1');

  await runFlight(page);

  await autosaved(page, '"deployAltitude":150');
  await page.reload();
  await page.locator('div[title="Parachute"]').click();
  await expect(page.getByLabel('Deploy at')).toHaveValue('altitude');
});
