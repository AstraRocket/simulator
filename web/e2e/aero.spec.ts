import { test, expect, type Page } from './base';

const xTicks = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('text')]
      .map((t) => (t.textContent || '').trim())
      .filter((t) => /^M [0-9.]+$/.test(t) || /^[0-9]+(\.[0-9])?$/.test(t)),
  );

test.describe('aero drag sweep', () => {
  test('defaults to M1 and labels its axis in fifths', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Aero', exact: true }).click();

    // `:visible`: the Simulations tab's table is always mounted, hidden, in `main`.
    await expect(page.getByRole('button', { name: 'Charts', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main table:visible')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'M1', exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const m of ['M1', 'M2', 'M3', 'M5']) {
      await expect(page.getByRole('button', { name: m, exact: true })).toBeVisible();
    }

    const ticks = await xTicks(page);
    expect(ticks).toContain('0.2');
    expect(ticks).toContain('0.8');
  });

  test('keeps whole-number labels on the wider sweeps', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Aero', exact: true }).click();
    await page.getByRole('button', { name: 'M3', exact: true }).click();

    const ticks = await xTicks(page);
    expect(ticks).toContain('1');
    expect(ticks).toContain('3');
    expect(ticks).not.toContain('0.2');
  });
});
