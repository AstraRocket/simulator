import { test, expect, ready } from './base';

// Chromium reports '' with `validity.badInput` for "-" and "12e"; jsdom passes the raw string.

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('a lone minus sign and an unfinished exponent keep the stored value', async ({ page }) => {
  await page.locator('div[title="Nose cone"]').click();
  const field = page.getByRole('spinbutton', { name: 'Shoulder length', exact: true });
  await field.fill('12');
  await field.blur();
  await expect(field).toHaveValue('12');

  await field.click();
  await field.press('ControlOrMeta+a');
  await field.pressSequentially('-');
  expect(await field.evaluate((el: HTMLInputElement) => el.validity.badInput)).toBe(true);
  await field.blur();
  await expect(field).toHaveValue('12');

  await field.click();
  await field.press('End');
  await field.pressSequentially('e');
  expect(await field.evaluate((el: HTMLInputElement) => el.validity.badInput)).toBe(true);
  await field.blur();
  await expect(field).toHaveValue('12');
});

test('emptying the box after a lone minus sign clears it, as emptying it directly does', async ({ page }) => {
  await page.locator('div[title="Nose cone"]').click();
  const field = page.getByRole('spinbutton', { name: 'Shoulder length', exact: true });

  await field.fill('12');
  await field.blur();
  await field.click();
  await field.press('ControlOrMeta+a');
  await field.press('Delete');
  await field.blur();
  const cleared = await field.evaluate((el: HTMLInputElement) => el.value);
  expect(cleared).not.toBe('12');

  await field.fill('12');
  await field.blur();
  await field.click();
  await field.press('ControlOrMeta+a');
  await field.pressSequentially('-');
  await field.press('Backspace');
  await field.blur();
  await expect(field).toHaveValue(cleared);
});

test('a Settings field that commits on blur keeps its value through a lone minus sign', async ({ page }) => {
  await page.getByRole('button', { name: /Menu/ }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('tab', { name: 'Simulation' }).click();
  const field = dialog.getByRole('spinbutton', { name: 'Max sim time', exact: true });
  await field.fill('900');
  await field.blur();
  await expect(field).toHaveValue('900');

  await field.click();
  await field.press('ControlOrMeta+a');
  await field.pressSequentially('-');
  expect(await field.evaluate((el: HTMLInputElement) => el.validity.badInput)).toBe(true);
  await field.blur();
  await expect(field).toHaveValue('900');

  await field.click();
  await field.press('End');
  await field.pressSequentially('e');
  await field.press('Enter');
  await expect(field).toHaveValue('900');
});
