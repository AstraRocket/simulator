import { test, expect, openTab, ready, runFlight, designTitle } from './base';

test('the banner names the design, and a phone keeps it on the Rocket view', async ({ page }) => {
  await ready(page);
  const title = designTitle(page);
  await expect(title).toBeVisible();
  const name = ((await title.textContent()) ?? '').trim();
  expect(name).not.toBe('');

  await page.setViewportSize({ width: 390, height: 844 });
  // Exact: the banner's button is named "AstraRocket design".
  await page.getByRole('button', { name: 'Rocket', exact: true }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});

test('editing the design notes keeps the flight results', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Design notes', exact: true }).click();
  // Each field commits on blur.
  const designer = page.getByRole('textbox', { name: 'Designer' });
  await designer.fill('Ada Lovelace');
  await designer.blur();
  const revision = page.getByRole('textbox', { name: 'Revision history' });
  await revision.fill('rev 2');
  await revision.blur();
  await expect(designer).toHaveValue('Ada Lovelace');

  await openTab(page, 'Results');
  await expect(flight).toBeVisible();
  await expect(apogeeValue).toHaveText(apogee!);
});
