import { readFile } from 'node:fs/promises';
import { test, expect } from './base';

test.describe('image export', () => {
  test('the 2D view offers SVG and image export', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /SVG/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Image/ })).toBeVisible();
  });

  test('downloads a true-scale SVG of the schematic', async ({ page }) => {
    await page.goto('/');

    const wait = page.waitForEvent('download');
    await page.getByRole('button', { name: /SVG/ }).click();
    const dl = await wait;

    expect(dl.suggestedFilename()).toMatch(/-2d\.svg$/);
    const path = await dl.path();
    const svg = await readFile(path, 'utf8');
    expect(svg.startsWith('<svg') || svg.includes('<svg')).toBe(true);
    expect(svg).toMatch(/mm|CG|CP/);
  });

  test('the 3D view offers a snapshot once it is open', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '3D', exact: true }).click();
    await expect(page.getByRole('button', { name: /Image/ })).toBeVisible({ timeout: 20_000 });
  });

  test('the 3D snapshot is a real picture from the offscreen path', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text());
    });
    await page.goto('/');
    await page.getByRole('button', { name: '3D', exact: true }).click();
    const imageBtn = page.getByRole('button', { name: /Image/ });
    await expect(imageBtn).toBeVisible({ timeout: 20_000 });

    // The menu lists PNG widths first.
    await imageBtn.click();
    const wait = page.waitForEvent('download');
    await page.getByRole('menuitem').first().click();
    const dl = await wait;
    expect(dl.suggestedFilename()).toMatch(/.png$/);

    const sharp = (await import('sharp')).default;
    const img = sharp(await readFile(await dl.path()));
    const meta = await img.metadata();
    expect(meta.width).toBeGreaterThanOrEqual(1920);
    expect(meta.height).toBeGreaterThan(0);
    const { channels } = await img.stats();
    expect(Math.max(...channels.map((c) => c.stdev))).toBeGreaterThan(10);

    // The on-screen fallback logs this warning.
    expect(warnings.filter((w) => /offscreen capture failed/.test(w))).toEqual([]);
  });
});
