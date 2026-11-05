import { test, expect, openTab, ready, runFlight } from './base';

test('the name is a control only where a design can be built', async ({ page }) => {
  await ready(page);
  const edit = page.getByRole('button', { name: 'Edit rocket configuration' });
  await expect(edit).toBeVisible();
  const title = ((await edit.textContent()) ?? '').replace('✎', '').replace('Edit rocket configuration', '').trim();
  expect(title).not.toBe('');

  await page.getByRole('button', { name: /whole window/ }).click();
  await expect(edit).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(edit).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  // Exact: the banner's button is named "AstraRocket design".
  await page.getByRole('button', { name: 'Rocket', exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test('editing the design metadata keeps the flight results', async ({ page }) => {
  await page.goto('/');

  await runFlight(page);
  const flight = page.getByRole('button', { name: 'Flight', exact: true });

  // Scoped and exact: the chart summaries also say "Apogee", and they mount in their own time.
  await openTab(page, 'Results');
  const apogeeValue = page
    .getByRole('region', { name: 'Results' })
    .getByText('Apogee', { exact: true })
    .locator('xpath=following-sibling::div[1]');
  const apogee = (await apogeeValue.textContent())?.trim();
  expect(apogee).toBeTruthy();

  await openTab(page, 'Design');
  await page.getByRole('button', { name: 'Edit rocket configuration' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rocket configuration' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Designer' }).fill('Ada Lovelace');
  await dialog.getByRole('textbox', { name: 'Revision history' }).fill('rev 2');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();

  await openTab(page, 'Results');
  await expect(flight).toBeVisible();
  await expect(apogeeValue).toHaveText(apogee!);
});
