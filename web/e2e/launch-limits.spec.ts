import { test, expect, openTab, ready, runButton, runFlight, importOrk, autosaved, designTitle } from './base';

// out-of-limits.ork flies a C6, so the model code's 30° applies.
test('an imported .ork outside the limits is flagged and refused', async ({ page }) => {
  await page.goto('/');
  await importOrk(page, 'e2e/fixtures/out-of-limits.ork');

  // "Launcher", not "Launch rod": this file has no lugs or rail buttons.
  const banner = page.getByText(/Launcher angle is 35/);
  await expect(banner).toBeVisible();
  await expect(page.getByText('Wind speed is 15 m/s')).toBeVisible();

  await openTab(page, 'Simulations');
  const run = runButton(page);
  await expect(run).toBeDisabled();
  const notice = page.getByText(/was not run: its launch conditions are outside the safety codes/);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('above the 30° the NAR Model Rocket Safety Code allows');
  await expect(notice).toContainText('above the 8.9 m/s the NAR and Tripoli safety codes allow');

  await page.getByLabel('Angle', { exact: true }).fill('5');
  await page.getByLabel('Speed', { exact: true }).fill('3');
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByRole('button', { name: 'Flight', exact: true })).toBeVisible({ timeout: 30_000 });
});

test('the import notes fold away, and the name is not repeated', async ({ page }) => {
  await page.goto('/');
  await importOrk(page, 'e2e/fixtures/out-of-limits.ork');

  const note = page.getByText(/Launcher angle is 35/);
  await expect(note).toBeVisible();

  const toggle = page.getByRole('button', { name: /import note/ });
  await toggle.click();
  await expect(note).toHaveCount(0);
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(note).toBeVisible();

  const card = toggle.locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
  const title = card.getByTestId('design-name');
  await expect(title).toBeVisible();
  await expect(title).toContainText('Two Stage');
  await expect(designTitle(page)).toHaveCount(1);
});

test('folded notes stay folded across a reload, and a new import opens them', async ({ page }) => {
  await page.goto('/');
  await importOrk(page, 'e2e/fixtures/out-of-limits.ork');

  const note = page.getByText(/Launcher angle is 35/);
  const toggle = page.getByRole('button', { name: /import note/ });
  await expect(note).toBeVisible();
  await toggle.click();
  await expect(note).toHaveCount(0);

  await autosaved(page, 'limits.rodAngle');
  await page.reload();
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  await expect(note).toHaveCount(0);

  await importOrk(page, 'e2e/fixtures/out-of-limits.ork', 'overwrite');
  await expect(note).toBeVisible();

  await toggle.click();
  await expect(note).toHaveCount(0);
});

test('the run summary carries a safety card linking to the docs', async ({ page }) => {
  await ready(page);
  await runFlight(page);

  // Desktop and phone layouts each mount a copy.
  const card = page.getByRole('region', { name: 'Before you fly' }).filter({ visible: true });
  await expect(card).toBeVisible();
  await expect(card).toContainText('not a flight card');

  await expect(card).toContainText("RSO's call");

  await expect(card.getByRole('listitem').filter({ hasText: 'Not modeled at all' })).toContainText('Fin flutter');

  await expect(card).toHaveClass(/(^|\s)bg-warn-/);
  await expect(card).toContainText('⚠');

  const tiles = page.locator('section[aria-label="Simulation results"]').filter({ visible: true });
  const cardBox = (await card.boundingBox())!;
  const tileBox = (await tiles.boundingBox())!;
  expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(tileBox.y);

  // The docs may not be built, so accept either the frame or the docs-site link.
  await card.getByRole('button', { name: /Read the safety notes/ }).click();
  const help = page.getByRole('dialog', { name: 'Help' });
  await expect(help).toBeVisible();
  await expect(help.locator('iframe[src*="/safety/"], a[href*="/safety"]').first()).toBeAttached();
});
