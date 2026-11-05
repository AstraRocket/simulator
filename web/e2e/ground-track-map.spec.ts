import { test, expect, openTab, ready, runFlight, type Page } from './base';

async function rects(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg[role="img"]');
    const box = svg?.parentElement;
    const layer = box?.querySelector('div[aria-hidden]');
    const of = (el: Element | null | undefined) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    return { box: of(box), layer: of(layer), tiles: box?.querySelectorAll('img').length ?? 0 };
  });
}

// A band, not exact digits: the landing varies by about a meter between runs.
async function expectDrift(page: Page): Promise<void> {
  const readout = page.getByRole('group', { name: /Where each stage landed/i }).getByText(/^\d+ m · \d+°$/);
  await expect(readout).toBeInViewport();
  const figures = /^(\d+) m · (\d+)°$/.exec((await readout.innerText()).trim());
  expect(figures).not.toBeNull();
  const [, meters, bearing] = figures!;
  expect(Number(meters)).toBeGreaterThanOrEqual(402);
  expect(Number(meters)).toBeLessThanOrEqual(428);
  expect(Number(bearing)).toBeGreaterThanOrEqual(265);
  expect(Number(bearing)).toBeLessThanOrEqual(275);
}

async function flyDownwind(page: Page): Promise<void> {
  await ready(page);
  await openTab(page, 'Simulations');
  await page.getByLabel('Speed', { exact: true }).fill('7');
  await page.getByLabel('Angle', { exact: true }).fill('12');
  await runFlight(page);
  await openTab(page, 'Results');
  await page.getByRole('button', { name: 'Ground track', exact: true }).click();
  await expect(page.getByRole('img', { name: /over the ground/i })).toBeVisible();
}

async function showGround(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Satellite', exact: true }).click();
}

test('draws no imagery until the ground is asked for', async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('arcgisonline.com')) asked.push(r.url());
  });

  await flyDownwind(page);
  expect((await rects(page)).tiles).toBe(0);
  expect(asked).toHaveLength(0);
  await expect(page.getByText(/Source: Esri, Vantor/)).toHaveCount(0);

  await showGround(page);
  // Polled: the tiles draw after the click.
  await expect.poll(async () => (await rects(page)).tiles, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(() => asked.length, { timeout: 15_000 }).toBeGreaterThan(0);
});

test('the tile layer covers the plot it sits under, exactly', async ({ page }) => {
  await flyDownwind(page);
  await showGround(page);

  const { box, layer, tiles } = await rects(page);
  expect(box).not.toBeNull();
  expect(layer).not.toBeNull();
  expect(tiles).toBeGreaterThan(0);

  // A pixel of slack for the layer's fractional scale.
  expect(Math.abs(layer!.x - box!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(layer!.y - box!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(layer!.w - box!.w)).toBeLessThanOrEqual(1);
  expect(Math.abs(layer!.h - box!.h)).toBeLessThanOrEqual(1);

  expect(Math.abs(box!.w - box!.h)).toBeLessThanOrEqual(1);
});

test('the layer buttons and the drift readout are not clipped by the square', async ({ page }) => {
  await flyDownwind(page);
  await showGround(page);

  await expectDrift(page);
  await expect(page.getByRole('button', { name: 'Satellite', exact: true })).toBeInViewport();
  // The provider's attribution is a condition of using the tiles.
  await expect(page.getByText(/Source: Esri, Vantor/)).toBeInViewport();
});

test('turns the imagery off and keeps the measurement', async ({ page }) => {
  await flyDownwind(page);
  await showGround(page);

  await page.getByRole('button', { name: 'None', exact: true }).click();
  expect((await rects(page)).tiles).toBe(0);
  await expect(page.getByRole('img', { name: /over the ground/i })).toBeVisible();
  await expectDrift(page);

  await page.getByRole('button', { name: 'Satellite', exact: true }).click();
  await expect.poll(async () => (await rects(page)).tiles, { timeout: 15_000 }).toBeGreaterThan(0);
});
