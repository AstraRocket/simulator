import { test, expect, ready, type Page } from './base';

const editor = (page: Page) => page.getByRole('dialog', { name: 'Edit component' });
const columnHint = (page: Page) => page.getByText(/Select a component in the tree or drawing/i);

test('between lg and 2xl the editor is a dialog, and the column is gone', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await ready(page);

  await expect(columnHint(page)).toHaveCount(0);
  await expect(page.getByRole('separator', { name: /side panel/ })).toHaveCount(0);
  await expect(editor(page)).toHaveCount(0);

  await page.locator('div[title="Nose cone"]').click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page).getByLabel('Shoulder length')).toBeVisible();
  await expect(page.getByLabel('Shoulder length')).toHaveCount(1);

  await editor(page).getByRole('button', { name: /close/i }).click();
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByRole('treeitem', { selected: true })).toHaveCount(1);

  // The store already holds this id, so a dialog keyed on the id alone ignores this click.
  await page.locator('div[title="Nose cone"]').click();
  await expect(editor(page)).toBeVisible();

  await editor(page).getByRole('button', { name: /close/i }).click();
  await page.locator('div[title="Trapezoidal fin set"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(editor(page).getByLabel('Fin tab length')).toBeVisible();
});

test('at 2xl and up it is the right-hand column, with no dialog', async ({ page }) => {
  // 1500 is below `2xl` (1536), so still the dialog.
  await page.setViewportSize({ width: 1500, height: 900 });
  await ready(page);
  await expect(columnHint(page)).toHaveCount(0);
  await page.locator('div[title="Nose cone"]').click();
  await expect(editor(page)).toBeVisible();
  await editor(page).getByRole('button', { name: /close/i }).click();

  await page.setViewportSize({ width: 1536, height: 900 });
  await expect(columnHint(page)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Shoulder length')).toHaveCount(1);
});

test('a phone opens it by tapping the part in the drawing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);

  await page.getByRole('button', { name: /Sketch/ }).click();
  const svg = page
    .locator('svg')
    .filter({ has: page.locator('title') })
    .first();
  const b = (await svg.boundingBox())!;
  // Rotated on a portrait phone; the centerline is the nose's middle, not the box's (ruler lanes).
  const nose = (await svg
    .locator('title', { hasText: /^Nose cone$/ })
    .first()
    .locator('..')
    .boundingBox())!;
  await page.mouse.click(nose.x + nose.width / 2, b.y + b.height / 2);

  await expect(editor(page)).toBeVisible();
  await expect(editor(page).getByLabel('Motor mount')).toBeVisible();
});
