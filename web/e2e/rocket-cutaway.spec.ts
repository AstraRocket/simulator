import { test, expect, ready, importOrk, note, type Locator } from './base';

// The view animates in over several frames, so wait for two identical frames in a row.
async function settled(canvas: Locator): Promise<string> {
  let last = '';
  await expect
    .poll(
      async () => {
        const now = (await canvas.screenshot()).toString('base64');
        const same = now === last;
        last = now;
        return same;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return last;
}

test('cuts the airframe open, and the button can be pressed to do it', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await ready(page);
  await importOrk(page, 'e2e/fixtures/two-stage.ork');
  await page.getByRole('button', { name: '3D', exact: true }).click();

  const canvas = page.locator('main canvas').first();
  await expect(canvas).toBeVisible();
  const solid = await settled(canvas);

  const cut = page.getByRole('button', { name: 'Cutaway', exact: true });
  await expect(cut).toHaveAttribute('aria-pressed', 'false');
  // Not force-clicked: the info card can cover this row on a narrow pane.
  await cut.click();
  await expect(cut).toHaveAttribute('aria-pressed', 'true');

  const sectioned = await settled(canvas);
  note('canvas bytes', solid.length, sectioned.length);
  expect(sectioned).not.toBe(solid);

  await cut.click();
  await expect(cut).toHaveAttribute('aria-pressed', 'false');
});

test('switches between the Figure and Finished views, and both buttons can be pressed', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await ready(page);
  await page.getByRole('button', { name: '3D', exact: true }).click();

  const canvas = page.locator('main canvas').first();
  await expect(canvas).toBeVisible();
  const figure = page.getByRole('button', { name: 'Figure', exact: true });
  const finished = page.getByRole('button', { name: 'Finished', exact: true });
  await expect(figure).toHaveAttribute('aria-pressed', 'true');
  const seeThrough = await settled(canvas);

  await finished.click();
  await expect(finished).toHaveAttribute('aria-pressed', 'true');
  await expect(figure).toHaveAttribute('aria-pressed', 'false');
  const solid = await settled(canvas);
  expect(solid).not.toBe(seeThrough);

  await figure.click();
  await expect(figure).toHaveAttribute('aria-pressed', 'true');
});
