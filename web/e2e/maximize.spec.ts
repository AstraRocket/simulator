import { test, expect, openTab, runFlight, ready, box } from './base';

test('the drawing can take the whole window, and come back', async ({ page }) => {
  await ready(page);

  const center = page.locator('main > section').nth(1);
  const width = async () => (await box(center)).width;
  const tree = page.getByRole('heading', { name: 'Components' });

  expect(await width()).toBe(850);
  await expect(tree).toBeVisible();

  const stats = page.getByText('Information', { exact: true });
  await expect(stats).toBeVisible();

  await page.getByRole('button', { name: /whole window/ }).click();
  expect(await width()).toBe(1600);
  await expect(tree).toBeHidden();
  await expect(stats).toBeHidden();
  await expect(page.getByRole('separator')).toHaveCount(0);

  // Waits on the toolbar, not the usual `L/D`, which is in the hidden strip.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Side', exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await width()).toBe(1600);

  await page.keyboard.press('Escape');
  expect(await width()).toBe(850);
  await expect(tree).toBeVisible();
  await expect(stats).toBeVisible();
  await expect(page.getByRole('separator')).toHaveCount(2);
});

test('maximizing is a desktop mode and leaves a phone alone', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: /whole window/ }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: /whole window/ })).toBeHidden();
  await expect(page.getByRole('button', { name: /Rocket/ })).toBeVisible();
  await page.getByRole('button', { name: /Rocket/ }).click();
  await expect(page.getByText('Information', { exact: true })).toBeVisible();
});

test('maximizing does not strand the simulation editor', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: /whole window/ }).click();
  await runFlight(page);

  expect((await box(page.locator('main > section').nth(1))).width).toBe(1600);

  await openTab(page, 'Simulations');
  await expect(page.locator('main > section:visible')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Run flight simulation/ })).toBeVisible();
});
