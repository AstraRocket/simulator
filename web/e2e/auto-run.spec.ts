import { test, expect, openTab, runFlight, type Page } from './base';

async function setAutoRun(page: Page, on: boolean): Promise<void> {
  await page.getByRole('button', { name: /Menu/ }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Simulation' }).click();
  const box = dialog.getByRole('checkbox', { name: 'Run outdated simulations automatically' });
  await box.setChecked(on);
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await expect(dialog).toBeHidden();
}

async function outdatedResult(page: Page): Promise<void> {
  await runFlight(page);
  await openTab(page, 'Simulations');
  const angle = page.getByLabel('Angle', { exact: true });
  await angle.fill('5');
  await angle.blur();
  await expect(page.getByRole('row').filter({ hasText: 'Simulation 1' })).toContainText('Outdated');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opening Results re-flies an outdated simulation when the setting is on', async ({ page }) => {
  await setAutoRun(page, true);
  await outdatedResult(page);

  await openTab(page, 'Results');
  // Wait for Running to clear too: a run landing on another tab jumps back to Results.
  await expect(page.getByText('Outdated', { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Running' })).toHaveCount(0, { timeout: 30_000 });
  await openTab(page, 'Simulations');
  await expect(page.getByRole('row').filter({ hasText: 'Simulation 1' })).toContainText('Up to date');
});

test('leaves an outdated simulation alone when the setting is off', async ({ page }) => {
  await setAutoRun(page, false);
  await outdatedResult(page);

  await openTab(page, 'Results');
  await expect(page.getByText('Outdated', { exact: true }).first()).toBeVisible();
  await openTab(page, 'Simulations');
  await expect(page.getByRole('row').filter({ hasText: 'Simulation 1' })).toContainText('Outdated');
});
