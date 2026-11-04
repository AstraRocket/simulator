import { test, expect, openTab, ready, runFlight, type Page } from './base';

// The attribution stands in for "the map is drawn": the tile terms require it exactly when tiles show.
const attribution = (page: Page) => page.getByText(/Source: Esri, Vantor/);
const streetAttribution = (page: Page) => page.getByText(/OpenStreetMap contributors/);

async function flyAndOpen3D(page: Page): Promise<void> {
  await ready(page);
  await openTab(page, 'Simulations');
  await page.getByLabel('Speed', { exact: true }).fill('4');
  await runFlight(page);
  await openTab(page, 'Results');
  await page.getByRole('button', { name: '3D path', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
}

async function showGround(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Satellite', exact: true }).click();
}

test('draws no ground imagery until it is asked for', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('arcgisonline.com')) asked.push(r.url());
  });

  await flyAndOpen3D(page);
  expect(asked).toHaveLength(0);
  await expect(attribution(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'None', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await showGround(page);
  await expect(attribution(page)).toBeVisible();
  // Polled: the first tile request goes out after the attribution renders.
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThan(0);
});

test('the ground map turns off and back on from over the canvas', async ({ page }) => {
  await flyAndOpen3D(page);
  await showGround(page);
  await expect(page.getByRole('button', { name: 'Satellite', exact: true })).toBeInViewport();
  await expect(attribution(page)).toBeVisible();

  await page.getByRole('button', { name: 'None', exact: true }).click();
  await expect(attribution(page)).toHaveCount(0);
  await expect(page.locator('canvas').first()).toBeVisible();

  await page.getByRole('button', { name: 'Satellite', exact: true }).click();
  await expect(attribution(page)).toBeVisible();
});

test('the street layer swaps the ground, and its credit with it', async ({ page }) => {
  await flyAndOpen3D(page);

  await page.getByRole('button', { name: 'Street', exact: true }).click();
  await expect(streetAttribution(page)).toBeVisible();
  await expect(attribution(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Satellite', exact: true }).click();
  await expect(attribution(page)).toBeVisible();
});

test('the choice carries between the 3D ground and the ground track', async ({ page }) => {
  await flyAndOpen3D(page);
  await showGround(page);

  await page.getByRole('button', { name: 'Ground track', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Satellite', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Source: Esri, Vantor/)).toBeVisible();

  await page.getByRole('button', { name: 'None', exact: true }).click();
  await page.getByRole('button', { name: '3D path', exact: true }).click();
  await expect(attribution(page)).toHaveCount(0);
});
