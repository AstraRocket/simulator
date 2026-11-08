import { test, expect, note, ready, box } from './base';

for (const w of [320, 360, 390, 414, 600, 768]) {
  test(`no sideways scroll at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 844 });
    await ready(page);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      sh: document.documentElement.scrollHeight,
      w: window.innerWidth,
      h: window.innerHeight,
    }));
    note(`${w}: scrollW=${m.sw} innerW=${m.w} scrollH=${m.sh} innerH=${m.h}`);
    expect(m.sw).toBeLessThanOrEqual(m.w);
    expect(m.sh).toBeLessThanOrEqual(m.h);
    const bar = await box(page.getByRole('navigation').last());
    note(`${w}: bar bottom=${Math.round(bar.y + bar.height)}`);
    expect(Math.round(bar.y + bar.height)).toBe(m.h);
  });
}

test('no sideways scroll in Spanish at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await ready(page);
  await page.getByRole('combobox').first().selectOption('es');
  await expect(page.getByText('L/D', { exact: true })).toBeVisible();
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  note('es 320:', m.sw, 'vs', m.w);
  expect(m.sw).toBeLessThanOrEqual(m.w);
});
