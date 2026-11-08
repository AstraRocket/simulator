import { test, expect, tableRows, defined } from './base';

test('two parts sharing a name are two rows, not one merged one', async ({ page }) => {
  await page.goto('/');

  // Both renamed: an untouched part reports "[BodyTube.BodyTube]", not "Body tube".
  for (const part of ['Nose cone', 'Body tube']) {
    await page.locator(`div[title="${part}"]`).first().click();
    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Twin');
    await name.blur();
  }

  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drag by component' })).toBeVisible();

  const twins = async () => (await tableRows(page, 'Drag by component')).filter((x) => x[0] === 'Twin');
  await expect.poll(async () => (await twins()).length).toBe(2);
  const r = await tableRows(page, 'Drag by component');

  const cd = defined(r[0], 'the drag table header row').indexOf('Cd');
  const total = Number(
    defined(
      r.find((x) => x[0] === 'Whole rocket'),
      'the Whole rocket row',
    )[cd],
  );
  const sum = r
    .slice(1)
    .filter((x) => x[0] !== 'Whole rocket')
    .reduce((a, x) => a + Number(x[cd]), 0);
  expect(sum).toBeGreaterThan(total * 0.9);
  expect(sum).toBeLessThanOrEqual(total * 1.01);
});
