import { test, expect, type Page, note, ready, box } from './base';

// By its label: the component tree's icons are svgs in main too, and come first.
const SIDE_VIEW = 'main svg[aria-label^="Rocket side view"]';

test.describe('sketch tab', () => {
  const stage = (page: Page) =>
    page.evaluate((sel) => {
      const el = document.querySelector('.sketch-rotate');
      const svg = document.querySelector(sel)?.getBoundingClientRect();
      return {
        rotated: !!el && getComputedStyle(el).transform !== 'none',
        w: svg ? Math.round(svg.width) : 0,
        h: svg ? Math.round(svg.height) : 0,
      };
    }, SIDE_VIEW);

  test('turns the drawing a quarter turn on a portrait screen, and back in landscape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);

    await expect(page.locator(SIDE_VIEW)).toBeHidden();
    await page.getByRole('button', { name: /Sketch/ }).click();
    await expect(page.locator(SIDE_VIEW)).toBeVisible();
    await expect(page.getByText('L/D', { exact: true })).toBeHidden();

    const portrait = await stage(page);
    note('portrait', JSON.stringify(portrait));
    expect(portrait.rotated).toBe(true);
    const toolbar = await box(page.getByRole('button', { name: 'Reset' }));
    note('toolbar', JSON.stringify({ x: Math.round(toolbar.x), y: Math.round(toolbar.y) }));
    expect(toolbar.x).toBeGreaterThan(390 * 0.75);
    expect(toolbar.height).toBeGreaterThan(toolbar.width);
    expect(portrait.h).toBeGreaterThan(portrait.w);

    await page.setViewportSize({ width: 844, height: 390 });
    const landscape = await stage(page);
    note('landscape', JSON.stringify(landscape));
    expect(landscape.rotated).toBe(false);
    expect(landscape.w).toBeGreaterThan(landscape.h);
    const flat = await box(page.getByRole('button', { name: 'Reset' }));
    expect(flat.width).toBeGreaterThan(flat.height);

    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    expect(m.sw).toBeLessThanOrEqual(m.w);
  });

  test('leaves the desktop workbench alone', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await ready(page);
    const desktop = await stage(page);
    note('desktop', JSON.stringify(desktop));
    expect(desktop.rotated).toBe(false);
    expect(desktop.w).toBeGreaterThan(desktop.h);
  });
});

test('frames the 3D model correctly inside the quarter turn', async ({ page }) => {
  // r3f's default getBoundingClientRect reports a rotated element's swapped screen box.
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: /Sketch/ }).click();
  await page.getByRole('button', { name: '3D', exact: true }).click();

  const canvas = page.locator('main canvas').first();
  await expect(canvas).toBeVisible();
  // Polled: r3f sizes the buffer from a ResizeObserver, so the first frame can be stale.
  await expect
    .poll(
      async () =>
        canvas.evaluate((c: HTMLCanvasElement) => {
          const host = c.parentElement;
          if (!host) return false;
          // r3f's default `dpr={[1, 2]}` clamps the buffer scale to 2.
          const k = Math.min(window.devicePixelRatio || 1, 2);
          return Math.abs(c.width / k - host.offsetWidth) < 3 && Math.abs(c.height / k - host.offsetHeight) < 3;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);

  const [bufW, bufH] = await canvas.evaluate((c: HTMLCanvasElement): [number, number] => [c.width, c.height]);
  note('3d buffer', JSON.stringify([bufW, bufH]));
  expect(bufW).toBeGreaterThan(bufH);
});

test('turns the Aero charts with the sketch, and leaves the flight views upright', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: /Sketch/ }).click();
  await expect(page.locator('.sketch-rotate')).toHaveCount(1);

  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await expect(page.locator('.sketch-rotate')).toHaveCount(1);
  // The hidden Rocket tab preview is an svg in main too.
  const chart = await box(page.locator('.sketch-rotate svg').first());
  note('aero chart', `${Math.round(chart.width)}x${Math.round(chart.height)}`);
  expect(chart.height).toBeGreaterThan(chart.width);
});
