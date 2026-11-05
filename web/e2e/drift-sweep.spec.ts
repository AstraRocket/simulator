import { test, expect, openTab, ready, runFlight, type Page } from './base';

async function flyDownwind(page: Page): Promise<void> {
  await ready(page);
  await openTab(page, 'Simulations');
  await page.getByLabel('Speed', { exact: true }).fill('5');
  await page.getByLabel('Angle', { exact: true }).fill('10');
  await runFlight(page);
  await openTab(page, 'Results');
  await page.getByRole('button', { name: 'Ground track', exact: true }).click();
  await expect(page.getByRole('img', { name: /over the ground/i })).toBeVisible();
}

async function openSweep(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Drift( \(sweep flown\))?$/ }).click();
  await page.getByLabel('Speeds', { exact: true }).fill('4');
  await page.getByLabel('Headings', { exact: true }).fill('4');
  await expect(page.getByText('16 flights')).toBeVisible();
}

async function shapes(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('svg[role="img"] polygon')).map((el) => ({
      points: (el.getAttribute('points') ?? '').split(' ').length,
      fillOpacity: el.getAttribute('fill-opacity'),
      dashed: !!el.getAttribute('stroke-dasharray'),
    })),
  );
}

async function widestRing(page: Page): Promise<number> {
  return page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('svg[role="img"] text')).map((el) => el.textContent ?? '');
    const m = labels.flatMap((x) => {
      const hit = /^([\d.]+) m$/.exec(x);
      return hit ? [Number(hit[1])] : [];
    });
    return m.length ? Math.max(...m) : 0;
  });
}

test('flies a grid of winds and draws the region they land in', async ({ page }) => {
  await flyDownwind(page);
  const before = await widestRing(page);
  expect(await shapes(page)).toHaveLength(0);

  await openSweep(page);
  await page.getByRole('button', { name: 'Run sweep', exact: true }).click();

  await expect(page.getByText('16 of 16 flights landed.')).toBeVisible({ timeout: 120_000 });

  const drawn = await shapes(page);
  expect(drawn).toHaveLength(2);
  expect(drawn[0]!.fillOpacity).toBe('0.14');
  expect(drawn[0]!.points).toBeGreaterThanOrEqual(3);
  expect(drawn[1]!.dashed).toBe(true);

  const dots = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll('svg[role="img"] circle')).filter((c) => c.getAttribute('r') === '1.6')
        .length,
  );
  expect(dots).toBe(16);

  expect(await widestRing(page)).toBeGreaterThan(before);

  await expect(page.getByText(/\(\d[\d.]*–\d[\d.]* m\)/)).toBeVisible();
});

test('clears the region without re-running anything', async ({ page }) => {
  await flyDownwind(page);
  await openSweep(page);
  await page.getByLabel('Speeds', { exact: true }).fill('2');
  await page.getByLabel('Headings', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Run sweep', exact: true }).click();
  await expect(page.getByText('4 of 4 flights landed.')).toBeVisible({ timeout: 120_000 });
  expect(await shapes(page)).toHaveLength(2);

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  expect(await shapes(page)).toHaveLength(0);
  await expect(page.getByRole('img', { name: /over the ground/i })).toBeVisible();
});
