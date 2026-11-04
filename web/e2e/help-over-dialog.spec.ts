import { test, expect, openTab, ready } from './base';

// Needs no Esri key stored, so the map shows the key note's link.
test('Help opened from the launch site map takes focus and closes first on Escape', async ({ page }) => {
  await ready(page);
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Show on map' }).click();
  const map = page.getByRole('dialog', { name: 'Launch site' });
  await expect(map).toBeVisible();

  await map.getByRole('button', { name: 'How to get one' }).click();
  const help = page.getByRole('dialog', { name: 'Help' });
  await expect(help).toBeVisible();
  await expect(map).toBeVisible();

  const inHelp = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-label="Help"]'));
  await expect.poll(inHelp).toBe(true);
  await help.getByRole('button', { name: 'Close' }).focus();
  await expect.poll(inHelp).toBe(true);

  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(map).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(map).toBeHidden();
});
