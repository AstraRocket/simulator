import { test, expect } from './base';

// Never answered, since an abort errors; `domcontentloaded` because the pending request holds `load` open.
const stall = async (page: import('@playwright/test').Page, blocked: () => boolean) => {
  await page.route(/openrocket-engine|\.wasm/, async (route) => {
    if (blocked()) return;
    await route.continue();
  });
};

test('comes up and stays usable while the engine hangs', async ({ page }) => {
  await stall(page, () => true);
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible({ timeout: 20_000 });
  await page.locator('div[title="Nose cone"]').first().click();
  await expect(page.getByRole('button', { name: /Select part/ })).toBeVisible();

  await expect(page.getByText('L/D', { exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /engine/i })
      .first(),
  ).toBeVisible();
});

test('a hung engine can be retried without reloading the page', async ({ page }) => {
  test.setTimeout(120_000);
  let blocked = true;
  await stall(page, () => blocked);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('L/D', { exact: true })).toHaveCount(0);

  const retry = page.getByRole('button', { name: /Retry/i });
  await expect(retry).toBeVisible({ timeout: 60_000 });

  blocked = false;
  await retry.click();
  await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('status').filter({ hasText: /engine/i })).toHaveCount(0);
});
