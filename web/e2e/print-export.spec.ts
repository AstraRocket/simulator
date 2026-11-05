import { test, expect, ready } from './base';

const openDialog = async (page: import('./base').Page) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /^Export$/ }).click();
  await page.getByRole('menuitem', { name: 'Export printable parts as 3MF' }).click();
  await expect(page.getByRole('dialog', { name: '3D print export' })).toBeVisible();
};

test('the dialog lists the parts that can actually be printed', async ({ page }) => {
  await ready(page);
  await openDialog(page);
  const dlg = page.getByRole('dialog', { name: '3D print export' });

  for (const part of ['Nose cone', 'Body tube', 'Trapezoidal fin set', 'Centering ring']) {
    await expect(dlg.getByRole('checkbox', { name: part }).first(), part).toBeChecked();
  }
  await expect(dlg.getByRole('checkbox', { name: 'Parachute' })).toHaveCount(0);
});

test('it downloads a real 3MF package', async ({ page }) => {
  await ready(page);
  await openDialog(page);

  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save 3MF' }).click();
  const dl = await wait;
  expect(dl.suggestedFilename()).toMatch(/\.3mf$/);

  const { readFile } = await import('node:fs/promises');
  const { unzipSync, strFromU8 } = await import('fflate');
  const archive = unzipSync(new Uint8Array(await readFile(await dl.path())));
  expect(Object.keys(archive).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);

  const model = strFromU8(archive['3D/3dmodel.model']!);
  expect(model).toContain('unit="millimeter"');
  expect(model).toContain('name="Nose cone"');
  expect((model.match(/<triangle /g) ?? []).length).toBeGreaterThan(100);
});

test('clearing a part leaves it out of the file', async ({ page }) => {
  await ready(page);
  await openDialog(page);
  const dlg = page.getByRole('dialog', { name: '3D print export' });
  await dlg.getByRole('checkbox', { name: 'Nose cone' }).first().uncheck();

  const wait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save 3MF' }).click();
  const dl = await wait;

  const { readFile } = await import('node:fs/promises');
  const { unzipSync, strFromU8 } = await import('fflate');
  const model = strFromU8(unzipSync(new Uint8Array(await readFile(await dl.path())))['3D/3dmodel.model']!);
  expect(model).not.toContain('name="Nose cone"');
  expect(model).toContain('name="Body tube"');
});
