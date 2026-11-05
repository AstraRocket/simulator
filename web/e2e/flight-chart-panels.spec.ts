import { test, expect, openTab, ready, runFlight } from './base';

test('a panel expands to the pane and gives the others back', async ({ page }) => {
  await ready(page);
  await runFlight(page);
  await openTab(page, 'Results');
  await page.getByRole('button', { name: 'Flight', exact: true }).click();

  await page.getByRole('button', { name: 'Velocity vs altitude', exact: true }).click();
  const expand = page.getByRole('button', { name: 'Show only this panel' });
  const before = await expand.count();
  expect(before).toBeGreaterThan(1);

  await expand.last().click();
  await expect(page.getByRole('button', { name: 'Show all panels' })).toHaveCount(1);
  await expect(expand).toHaveCount(0);

  await page.getByRole('button', { name: 'Show all panels' }).click();
  await expect(expand).toHaveCount(before);
});

test('the run table downloads every simulation as CSV', async ({ page }) => {
  await ready(page);
  await runFlight(page);
  await openTab(page, 'Simulations');
  const download = page.waitForEvent('download');
  await page.getByTitle(/Download the run table/).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/run-table\.csv$/);
  const text = await (await file.createReadStream()).toArray();
  const raw = Buffer.concat(text).toString('utf8');
  // A BOM, so Excel on Windows reads the units and accents as UTF-8.
  expect(raw.startsWith('﻿')).toBe(true);
  const csv = raw.slice(1);
  expect(csv.split('\r\n')[0]).toMatch(/^Simulation,Configuration,Motors,Status,Apogee \(/);
  expect(csv.split('\r\n').filter(Boolean).length).toBeGreaterThan(1);
});

test('the Results tab does not scroll the page', async ({ page }) => {
  await page.setViewportSize({ width: 1328, height: 600 });
  await ready(page);
  await runFlight(page);
  await openTab(page, 'Results');
  await expect(page.getByRole('button', { name: 'Download flight events (.csv)' })).toBeAttached();
  const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, h: window.innerHeight }));
  expect(m.sh).toBe(m.h);
});
