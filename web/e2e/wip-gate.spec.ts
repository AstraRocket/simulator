import { test, expect } from './base';

// The only place the gate is exercised: the base.ts fixture sets the stored flag.
test.describe('work-in-progress gate', () => {
  test.use({ wip: 'shown' });

  test('blocks the app on a first visit and lets go once acknowledged', async ({ page }) => {
    await page.goto('/');

    const accept = page.getByRole('button', { name: 'I understand' });
    await expect(accept).toBeVisible();

    // The Menu button behind the backdrop passes `toBeVisible`, so check what is on top.
    const menu = page.getByRole('button', { name: 'Menu' });
    const topmostIsMenu = () =>
      menu.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
    expect(await topmostIsMenu()).toBe(false);

    await accept.click();
    await expect(accept).toBeHidden();
    expect(await topmostIsMenu()).toBe(true);
  });

  test('stays acknowledged across a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'I understand' }).click();
    await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'I understand' })).toHaveCount(0);
  });
});
