import { readFile } from 'node:fs/promises';
import { test, expect, type Page, ready, importOrk, defined } from './base';

// Multi-stage: assembleReport() hands the store fresh `info`/`rocket` identities per stage, which can loop an effect.
const openReport = async (page: Page) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /Rocket Design Report/i }).click();
};

test.describe('Rocket Design Report dialog', () => {
  test('opens on a multi-stage design without an update loop', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await importOrk(page, 'e2e/fixtures/two-stage.ork');
    await openReport(page);

    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Sustainer')).toBeVisible();
    await expect(dialog.getByText('Booster')).toBeVisible();
    await expect(page.getByRole('button', { name: /Save as PDF/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Save as CSV/i })).toBeEnabled();

    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByText('L/D', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Save as PDF writes a real PDF, not an empty or truncated one', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await ready(page);
    await openReport(page);
    await expect(page.getByRole('dialog').first()).toBeVisible();

    const wait = page.waitForEvent('download');
    await page.getByRole('button', { name: /Save as PDF/i }).click();
    const dl = await wait;

    expect(dl.suggestedFilename()).toMatch(/.pdf$/);
    const bytes = await readFile(defined(await dl.path(), 'the downloaded PDF path'));
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.subarray(-1024).toString('latin1')).toContain('%%EOF');
    expect(bytes.length).toBeGreaterThan(20_000);
    expect(errors).toEqual([]);
  });

  test('the report can be pinned to a unit system, and the choice is remembered', async ({ page }) => {
    await ready(page);
    await openReport(page);
    let dialog = page.getByRole('dialog').first();
    await expect(dialog.getByLabel('Units')).toHaveValue('current');

    await dialog.getByLabel('Units').selectOption('imperial');
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByLabel('Length unit').first()).toHaveValue('cm');

    await page.reload();
    await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
    await openReport(page);
    dialog = page.getByRole('dialog').first();
    await expect(dialog.getByLabel('Units')).toHaveValue('imperial');
  });
});
