import { test, expect, ready, type Page } from './base';
import { nsKey } from '../src/services/storage/storageKeys';

// The schematic is the only svg with <title> labels.
test.describe('2D schematic', () => {
  const schematic = (page: Page) =>
    page
      .locator('svg')
      .filter({ has: page.locator('title') })
      .first();

  test('draws the default airframe with labeled components', async ({ page }) => {
    await ready(page);

    const svg = schematic(page);
    await expect(svg).toBeVisible();
    // Poll: the svg shows before the engine rebuild supplies its shapes.
    await expect(async () => {
      expect(await svg.locator('path').count()).toBeGreaterThanOrEqual(5);
    }).toPass({ timeout: 20_000 });
    expect(await svg.locator('title').count()).toBeGreaterThan(0);
  });

  test('zooming re-renders the schematic without losing the geometry', async ({ page }) => {
    await ready(page);
    const svg = schematic(page);
    await expect(svg).toBeVisible();

    const scaleOf = () =>
      page.evaluate(() => {
        const g = [...document.querySelectorAll('svg g')].find((el) =>
          /scale\(/.test(el.getAttribute('transform') || ''),
        );
        const m = g?.getAttribute('transform')?.match(/scale\(([\d.]+)\)/);
        return m?.[1] ? parseFloat(m[1]) : 1;
      });

    expect(await scaleOf()).toBe(1);
    await page.getByTitle(/Zoom in/i).click();
    await page.getByTitle(/Zoom in/i).click();

    await expect.poll(scaleOf).toBeGreaterThan(1);
    expect(await svg.locator('path').count()).toBeGreaterThanOrEqual(5);

    const box = svg.locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]');
    const inner = (await svg.boundingBox())!;
    const outer = (await box.boundingBox())!;
    expect(outer.y + outer.height - (inner.y + inner.height)).toBeGreaterThanOrEqual(4);
  });
});

test('the roll slider reads in the angle unit the user chose', async ({ page }) => {
  await page.addInitScript((key: string) => {
    const was = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
    const units = { ...((was.units as Record<string, string>) ?? {}), angle: 'rad' };
    localStorage.setItem(key, JSON.stringify({ ...was, units }));
  }, nsKey('settings:v1'));
  await ready(page);
  const slider = page.getByRole('slider', { name: 'Roll angle (degrees)' });
  await expect(slider).toBeVisible();
  await expect(slider).toHaveAttribute('title', /rad$/);
  await expect(page.getByText('6.28 rad', { exact: true })).toBeVisible();
});
