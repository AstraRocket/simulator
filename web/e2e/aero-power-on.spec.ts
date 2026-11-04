import { test, expect, type Page, importOrk } from './base';

const openAero = async (page: Page) => {
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Charts', exact: true })).toBeVisible();
};

test.describe('power-on drag curve', () => {
  test('appears for an .ork with a stage nozzle exit diameter, and names its motor', async ({ page }) => {
    await page.goto('/');
    await importOrk(page, 'e2e/fixtures/nozzle.ork');
    await openAero(page);

    await expect(page.getByText('Power-on', { exact: true })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/^Power-on: /)).toBeVisible();
  });

  test('is absent for the same design without the nozzle element', async ({ page }) => {
    await page.goto('/');
    await importOrk(page, 'e2e/fixtures/two-stage.ork');
    await openAero(page);

    await expect(page.getByText('Cd vs Mach')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Power-on', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^Power-on: /)).toHaveCount(0);
  });
});
