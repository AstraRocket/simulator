import { test, expect, ready } from './base';

test('the design exports as the Onshape import JSON', async ({ page }) => {
  await ready(page);

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /^Export$/ }).click();
  const wait = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export JSON (.json)' }).click();
  const dl = await wait;

  expect(dl.suggestedFilename()).toMatch(/-design\.json$/);
  const text = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8');
  const payload = JSON.parse(text) as {
    schemaVersion: string;
    rocket: { unitSystem: string; centerOfPressure?: number; components: { type: string; children: unknown[] }[] };
  };
  expect(payload.schemaVersion).toBe('1.2');
  expect(payload.rocket.unitSystem).toBe('SI');
  expect(payload.rocket.components[0]?.type).toBe('stage');
  expect(payload.rocket.components[0]?.children.length).toBeGreaterThan(0);
  expect(payload.rocket.centerOfPressure).toBeGreaterThan(0);
});
