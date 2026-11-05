import { test, expect, openTab, ready, importRkt } from './base';

test('a .rkt imports, builds and flies', async ({ page }) => {
  await ready(page);
  await importRkt(page, 'e2e/fixtures/rocksim.rkt', 'RockSim Bird');

  const tree = page.getByRole('tree', { name: 'Components' });
  for (const part of ['Nose', 'Airframe', 'Fins', 'Motor mount', 'Chute']) {
    await expect(tree.getByText(part, { exact: true }), part).toBeVisible();
  }

  await expect(page.getByText('L/D', { exact: true })).toBeVisible();
  const stats = await page.locator('main').innerText();
  expect(stats).toMatch(/LENGTH/);

  await expect(page.getByText(/motor selections and launch conditions are not imported/i)).toBeVisible();

  await openTab(page, 'Simulations');
  await expect(page.getByRole('button', { name: /Run flight simulation/ })).toBeDisabled();
  await expect(page.getByText(/no usable motor/i)).toBeVisible();
});

test('the design exports back out as a .rkt', async ({ page }) => {
  await ready(page);
  await importRkt(page, 'e2e/fixtures/rocksim.rkt', 'RockSim Bird');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /^Export$/ }).click();
  const wait = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export RockSim (.rkt)' }).click();
  const dl = await wait;

  expect(dl.suggestedFilename()).toMatch(/\.rkt$/);
  const path = await dl.path();
  const text = await (await import('node:fs/promises')).readFile(path, 'utf8');
  expect(text).toContain('<RockSimDocument>');
  expect(text).toContain('<Name>RockSim Bird</Name>');
  expect(text).toContain('<StageCount>1</StageCount>');
});
