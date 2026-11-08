import { test, expect, ready } from './base';

test.beforeEach(async ({ page }) => {
  await ready(page);
});

for (const item of ['About', 'Settings']) {
  test(`closing ${item} from the File menu returns focus to the Menu button`, async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Menu' });
    await trigger.click();
    await page.getByRole('menuitem', { name: item, exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
