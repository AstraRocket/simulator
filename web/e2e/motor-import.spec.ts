import { test, expect, openTab, ready, type Page } from './base';

async function openPicker(page: Page) {
  await openTab(page, 'Configurations');
  await page
    .getByRole('button', { name: /change/i })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('a hybrid imports from a .rse file, which .eng could not describe', async ({ page }) => {
  await ready(page);
  const dialog = await openPicker(page);

  await dialog.locator('input[type=file]').setInputFiles('e2e/fixtures/hybrid.rse');

  await expect(dialog.getByText('1 motor imported')).toBeVisible();

  // A 54 mm hybrid in the default rocket's 18 mm mount: the fit filter hides it.
  await dialog.getByRole('checkbox', { name: /Fits the mount/ }).uncheck();

  const row = dialog.getByRole('button').filter({ hasText: 'J350' });
  await expect(row.first()).toContainText('★');

  await row.first().click();
  await expect(dialog.getByText('Hybrid', { exact: true }).first()).toBeVisible();

  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /change/i }).first()).toBeVisible();
  await expect(page.getByText('plugged', { exact: false }).first()).toBeVisible();
});

test('a .rse holding several motors imports all of them, and says so', async ({ page }) => {
  await ready(page);
  const dialog = await openPicker(page);

  const two = `<?xml version="1.0"?><engine-database><engine-list>
    <engine mfg="Bench" code="A1" Type="hybrid" dia="29" len="200" initWt="300" propWt="120"><data>
      <eng-data t="0" f="0"/><eng-data t="1" f="120"/><eng-data t="2" f="0"/>
    </data></engine>
    <engine mfg="Bench" code="A2" Type="hybrid" dia="38" len="300" initWt="600" propWt="240"><data>
      <eng-data t="0" f="0"/><eng-data t="1" f="240"/><eng-data t="2" f="0"/>
    </data></engine>
  </engine-list></engine-database>`;
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'range.rse',
    mimeType: 'application/xml',
    buffer: Buffer.from(two, 'utf8'),
  });

  await expect(dialog.getByText('2 motors imported')).toBeVisible();
  await expect(dialog.getByRole('button').filter({ hasText: 'A1' }).first()).toBeVisible();
  await expect(dialog.getByRole('button').filter({ hasText: 'A2' }).first()).toBeVisible();
});

test('a malformed motor file is refused by name, not swallowed', async ({ page }) => {
  await ready(page);
  const dialog = await openPicker(page);

  await dialog.locator('input[type=file]').setInputFiles({
    name: 'broken.rse',
    mimeType: 'application/xml',
    // Well-formed XML, but more propellant than the motor weighs.
    buffer: Buffer.from(
      `<engine-database><engine-list><engine mfg="B" code="X" dia="29" len="100" initWt="100" propWt="900">
        <data><eng-data t="0" f="0"/><eng-data t="1" f="10"/></data></engine></engine-list></engine-database>`,
      'utf8',
    ),
  });

  await expect(page.getByText(/more propellant/i)).toBeVisible();
});
