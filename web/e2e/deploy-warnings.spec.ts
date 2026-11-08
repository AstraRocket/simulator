import { test, expect, openTab, runFlight } from './base';

async function setDeploySpeedWarn(page: import('@playwright/test').Page, ms: string) {
  await page.getByRole('button', { name: /Menu/ }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Simulation' }).click();
  await dialog.getByLabel('Deploy-speed warning above', { exact: true }).fill(ms);
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await expect(dialog).toBeHidden();
}

test('the deployment-speed threshold reaches the engine and its warning is shown', async ({ page }) => {
  await page.goto('/');

  await setDeploySpeedWarn(page, '0.1');
  await runFlight(page);
  const warnings = page.getByText(/Flight warnings/);
  await expect(warnings).toBeVisible();

  await setDeploySpeedWarn(page, '900');
  await openTab(page, 'Simulations');
  await runFlight(page);
  await expect(warnings).toHaveCount(0);
});

test('a per-simulation threshold overrides the global one', async ({ page }) => {
  await page.goto('/');
  await openTab(page, 'Simulations');

  const perSim = page.getByLabel('Deploy-speed warning above', { exact: true });
  await expect(perSim).toHaveValue('');
  await expect(perSim).toHaveAttribute('placeholder', '20.0');

  await perSim.fill('0.1');
  await runFlight(page);
  await expect(page.getByText(/Flight warnings/)).toBeVisible();

  await openTab(page, 'Simulations');
  await perSim.fill('');
  await runFlight(page);
  await expect(page.getByText(/Flight warnings/)).toHaveCount(0);
});
