import { test, expect, type Page } from './base';

async function openUnitsTab(page: Page) {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page
    .getByRole('menuitem', { name: 'Settings' })
    .or(page.getByText('Settings', { exact: true }))
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('tab', { name: 'Units', exact: true }).click();
  return dialog;
}

// Header and footer buttons are both named Close; either dismisses.
const closeDialog = (page: Page) =>
  page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Close', exact: true }).first().click();

test('the preferences reach the fields, the tree, the rulers and the stats strip', async ({ page }) => {
  await page.goto('/');

  const bodyTube = page.locator('div[title="Body tube"]').first();
  // Not via `svg.first()`, which can be the language switcher's chevron.
  const rulerUnit = page.locator('text[data-ruler-unit]').first();
  const statsUnit = page.getByLabel('Length unit').first();

  await expect(bodyTube).toContainText('cm');
  await expect(rulerUnit).toHaveText('cm');
  await expect(statsUnit).toHaveValue('cm', { timeout: 20_000 });

  const dialog = await openUnitsTab(page);
  await dialog.getByRole('button', { name: 'Imperial defaults' }).click();
  await expect(dialog.getByLabel('Component dimensions')).toHaveValue('in');
  await closeDialog(page);

  await expect(bodyTube).toContainText('in');
  await expect(rulerUnit).toHaveText('in');
  await expect(statsUnit).toHaveValue('in');
});

test('a chip changes its own field only, and nothing else moves', async ({ page }) => {
  await page.goto('/');

  await page.locator('div[title="Nose cone"]').click();
  const card = page.locator('section').filter({ hasText: 'Shoulder capped' });
  const lengthChip = card.getByLabel('Component dimensions unit').first();
  const thicknessRow = card.locator('label').filter({ hasText: 'Thickness' }).first();

  await lengthChip.selectOption('in');

  await expect(lengthChip).toHaveValue('in');
  await expect(thicknessRow.getByLabel('Component dimensions unit')).toHaveValue('cm');
  await expect(page.locator('div[title="Body tube"]').first()).toContainText('cm');
  await expect(page.locator('text[data-ruler-unit]').first()).toHaveText('cm');
  const dialog = await openUnitsTab(page);
  await expect(dialog.getByLabel('Component dimensions')).toHaveValue('cm');
  await closeDialog(page);
});

test('a field showing a non-default unit says so in its name', async ({ page }) => {
  await page.goto('/');

  await page.locator('div[title="Nose cone"]').click();
  const card = page.locator('section').filter({ hasText: 'Shoulder capped' });
  const lengthChip = card.getByLabel('Component dimensions unit', { exact: true }).first();

  await lengthChip.selectOption('in');

  const overridden = card.getByLabel('Component dimensions unit, set for this field').first();
  await expect(overridden).toHaveValue('in');

  await overridden.selectOption('cm');
  await expect(card.getByLabel('Component dimensions unit', { exact: true }).first()).toHaveValue('cm');
  await expect(card.getByLabel('Component dimensions unit, set for this field')).toHaveCount(0);
});

test('a field keeps its unit across a reload, and Settings can reset every field', async ({ page }) => {
  await page.goto('/');

  await page.locator('div[title="Nose cone"]').click();
  const card = page.locator('section').filter({ hasText: 'Shoulder capped' });
  await card.getByLabel('Component dimensions unit').first().selectOption('in');

  await page.reload();
  await page.locator('div[title="Nose cone"]').click();
  const reloaded = page.locator('section').filter({ hasText: 'Shoulder capped' });
  await expect(reloaded.getByLabel('Component dimensions unit').first()).toHaveValue('in');

  const dialog = await openUnitsTab(page);
  await dialog.getByRole('button', { name: /Reset 1 field/ }).click();
  await closeDialog(page);
  await expect(
    page.locator('section').filter({ hasText: 'Shoulder capped' }).getByLabel('Component dimensions unit').first(),
  ).toHaveValue('cm');
});

test('a preset clears per-field choices so it actually takes effect', async ({ page }) => {
  await page.goto('/');

  await page.locator('div[title="Nose cone"]').click();
  const card = page.locator('section').filter({ hasText: 'Shoulder capped' });
  // Must differ from the default (cm), or the chip stores no override.
  await card.getByLabel('Component dimensions unit').first().selectOption('mm');

  const dialog = await openUnitsTab(page);
  await dialog.getByRole('button', { name: 'Imperial defaults' }).click();
  await closeDialog(page);

  await expect(card.getByLabel('Component dimensions unit').first()).toHaveValue('in');
});

test('a length typed in inches round-trips through the SI tree', async ({ page }) => {
  await page.goto('/');

  const dialog = await openUnitsTab(page);
  await dialog.getByLabel('Component dimensions').selectOption('in');
  await closeDialog(page);

  await page.locator('div[title="Body tube"]').click();
  // Scoped: the launch-conditions panel has a "Length" (the rod) of its own.
  const length = page.locator('section').filter({ hasText: 'Motor mount' }).getByLabel('Length', { exact: true });
  await expect(length).toHaveValue('18');
  // Typed, not `fill()`: a blank geometry field commits a 0-length tube the rebuild cannot recover from.
  await length.click();
  await length.press('Control+a');
  await length.pressSequentially('24');
  await expect(length).toHaveValue('24');
  await length.blur();

  const dialog2 = await openUnitsTab(page);
  await dialog2.getByLabel('Component dimensions').selectOption('mm');
  await closeDialog(page);
  await expect(length).toHaveValue('609.6');
});
