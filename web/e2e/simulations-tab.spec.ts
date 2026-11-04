import { test, expect, autosaved, openTab, runButton, runFlight, defined } from './base';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('an edited design ages the results instead of destroying them', async ({ page }) => {
  await runFlight(page);
  await openTab(page, 'Simulations');

  const row = page.getByRole('row').filter({ hasText: 'Simulation 1' });
  await expect(row).toContainText('Up to date');
  const apogee = defined(await row.textContent(), 'the simulation row text');

  await openTab(page, 'Design');
  await page.locator('div[title="Body tube"]').click();
  await page.getByLabel('Length', { exact: true }).first().fill('45');
  await openTab(page, 'Simulations');

  await expect(row).toContainText('Outdated');
  await expect(row).toHaveText(apogee.replace('Up to date', 'Outdated'));

  await expect(
    page.getByRole('navigation', { name: 'Workbench' }).getByRole('button', { name: 'Results' }),
  ).toBeVisible();

  await runFlight(page);
  await openTab(page, 'Simulations');
  await expect(row).toContainText('Up to date');
});

test('a second simulation is its own row, with its own motor', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();

  const rows = page.getByRole('row').filter({ hasText: /Simulation/ });
  await expect(rows).toHaveCount(2);

  await expect(page.getByRole('textbox', { name: 'Rename simulation' })).toHaveValue('Simulation 1 copy');

  await runFlight(page);
  await openTab(page, 'Simulations');
  // By position: "Simulation 1" is a substring of "Simulation 1 copy".
  await expect(rows.nth(0)).toContainText('not run');
  await expect(rows.nth(1)).toContainText('Up to date');
});

test('a per-simulation option overrides the global one', async ({ page }) => {
  await openTab(page, 'Simulations');

  // By role: a range slider shares the label, so `getByLabel` fails strict mode.
  const step = page.getByRole('spinbutton', { name: 'Time step' });
  await expect(step).toHaveValue('');
  await expect(step).toHaveAttribute('placeholder', '0.05');

  await step.fill('0.01');
  await runFlight(page);

  await openTab(page, 'Simulations');
  await expect(step).toHaveValue('0.01');
});

test('the run button flies the ticked rows, and says how many', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();

  const run = runButton(page);
  await expect(run).toHaveText('Run flight simulation');

  await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
  await expect(run).toHaveText('Run 2 simulations');

  await run.click();
  await expect(page.getByRole('button', { name: /Choose which flight/ })).toBeVisible({ timeout: 30_000 });
  await openTab(page, 'Simulations');
  const rows = page.getByRole('row').filter({ hasText: /Simulation/ });
  await expect(rows.nth(0)).toContainText('Up to date');
  await expect(rows.nth(1)).toContainText('Up to date');
});

test('ticking a row to fly it does not move the editor to it', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();
  const name = page.getByRole('textbox', { name: 'Rename simulation' });
  await expect(name).toHaveValue('Simulation 1 copy');

  // `exact`: "Select Simulation 1" is a substring of "Select Simulation 1 copy".
  await page.getByRole('checkbox', { name: 'Select Simulation 1', exact: true }).check();
  await expect(name).toHaveValue('Simulation 1 copy');
  await expect(runButton(page)).toHaveText('Run flight simulation');
});

test('the results header names the simulation it is showing', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('textbox', { name: 'Rename simulation' }).fill('D12 sustainer');
  await runFlight(page);

  const header = page.getByRole('heading', { name: 'D12 sustainer' });
  await expect(header).toBeVisible();

  await expect(page.getByText('Outdated', { exact: true })).toHaveCount(0);
  await openTab(page, 'Design');
  await page.locator('div[title="Body tube"]').first().click();
  await page.getByLabel('Length', { exact: true }).fill('45');
  await openTab(page, 'Results');
  await expect(header).toBeVisible();
  await expect(page.getByText('Outdated', { exact: true }).first()).toBeVisible();
});

test('a flown row opens its own results', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();
  await page.getByRole('textbox', { name: 'Rename simulation' }).fill('Second');

  await expect(page.getByRole('button', { name: /^View results/ })).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
  await runButton(page).click();
  await expect(page.getByRole('button', { name: /Choose which flight/ })).toBeVisible({ timeout: 30_000 });
  await openTab(page, 'Simulations');
  await expect(page.getByRole('button', { name: /^View results/ })).toHaveCount(2);

  await page.getByRole('button', { name: 'View results for Second' }).click();
  await expect(page.getByRole('button', { name: /Choose which flight/ })).toHaveText(/^Second/);
});

test('a flight warning reads above the numbers it qualifies', async ({ page }) => {
  await openTab(page, 'Simulations');
  // Deployment is at apogee, near zero speed, so only a tiny threshold forces a warning.
  await page.getByLabel('Deploy-speed warning above', { exact: true }).fill('0.01');
  await runFlight(page);

  // Scoped: the phone's display:none copy is mounted too and has no box.
  const column = page.getByRole('region', { name: 'Results' });
  const warnings = column.getByText(/Flight warnings/);
  await expect(warnings).toBeVisible();

  const warnTop = (await warnings.boundingBox())!.y;
  const statTop = (await column.getByText('Rod exit').first().boundingBox())!.y;
  expect(warnTop).toBeLessThan(statTop);
});

test('a flight survives a reload', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('textbox', { name: 'Rename simulation' }).fill('Kept');
  await runFlight(page);

  const row = page.getByRole('row').filter({ hasText: 'Kept' });
  await openTab(page, 'Simulations');
  const before = defined(await row.textContent(), 'the Kept row text before the reload');
  expect(before).toContain('Up to date');

  await autosaved(page, '"maxAltitude"');
  await page.reload();
  await openTab(page, 'Simulations');

  await expect(row).toContainText('Up to date');
  await expect(row).toHaveText(before);

  await page.getByRole('button', { name: 'View results for Kept' }).click();
  await expect(page.getByRole('heading', { name: 'Kept' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flight', exact: true })).toBeVisible();
});

test('launch conditions stop at the NAR/Tripoli limits', async ({ page }) => {
  await openTab(page, 'Simulations');

  const angle = page.getByLabel('Angle', { exact: true });
  await expect(page.getByText(/As a model rocket, this flies under the NAR Model Rocket Safety Code/)).toBeVisible();
  await angle.fill('45');
  await angle.blur();
  expect(Number(await angle.inputValue())).toBeCloseTo(30, 6);

  // 20 mph limit, in m/s.
  const wind = page.getByLabel('Speed', { exact: true });
  await wind.fill('50');
  await wind.blur();
  expect(Number(await wind.inputValue())).toBeCloseTo(8.9408, 3);

  await angle.fill('7');
  await angle.blur();
  expect(Number(await angle.inputValue())).toBeCloseTo(7, 6);
});

test('Run outdated flies only the rows that are not current', async ({ page }) => {
  await runFlight(page);
  await openTab(page, 'Simulations');
  await expect(page.getByRole('row').filter({ hasText: 'Simulation 1' })).toContainText('Up to date');

  await page.getByRole('button', { name: '＋ New' }).click();
  const outdated = page.getByRole('button', { name: /^Run outdated/ });
  await expect(outdated).toHaveText('Run outdated (1)');

  await outdated.click();
  await expect(page.getByRole('button', { name: 'Flight', exact: true })).toBeVisible({ timeout: 30_000 });
  await openTab(page, 'Simulations');
  await expect(outdated).toHaveText('Run outdated (0)');
  await expect(outdated).toBeDisabled();
  const rows = page.getByRole('row').filter({ hasText: /Simulation/ });
  await expect(rows.nth(0)).toContainText('Up to date');
  await expect(rows.nth(1)).toContainText('Up to date');
});

test('a run leaves the design editor unblocked', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();
  await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
  await runButton(page).click();
  await expect(page.getByRole('button', { name: 'Flight', exact: true })).toBeVisible({ timeout: 30_000 });

  await openTab(page, 'Design');
  await page.locator('div[title="Body tube"]').click();
  const length = page.getByLabel('Length', { exact: true }).first();
  await expect(length).toBeEditable();
  await length.fill('42');
  await expect(length).toHaveValue('42');
});

test('a simulation stays editable while it flies', async ({ page }) => {
  await openTab(page, 'Simulations');
  // Two sims, since one can finish in the same tick.
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();
  await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
  await runButton(page).click();

  const angle = page.getByRole('spinbutton', { name: 'Angle', exact: true });
  await expect(angle).toBeEditable();
  await angle.fill('12');
  await expect(angle).toHaveValue('12');
});

test('the results picker chooses which flight every results view shows', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();
  await page.getByRole('textbox', { name: 'Rename simulation' }).fill('D12');
  await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
  await runButton(page).click();

  const picker = page.getByRole('button', { name: /Choose which flight/ });
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(picker).toHaveText(/^D12/);

  await picker.click();
  await page.getByRole('menuitemradio', { name: 'Simulation 1' }).click();
  await expect(picker).toHaveText(/^Simulation 1/);
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Scoped: the names also appear in the table behind it.
  await page.getByRole('button', { name: 'Ground track', exact: true }).click();
  const track = page.getByRole('group', { name: /Where each stage landed/ });
  await expect(track.getByText('Stage 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Choose which flight/ })).toHaveText(/^Simulation 1/);
});

test('the numbers beside the charts follow the picked flight', async ({ page }) => {
  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();
  await page.getByRole('textbox', { name: 'Rename simulation' }).fill('Tilted');
  await page.getByRole('spinbutton', { name: 'Angle', exact: true }).fill('15');
  await page.getByRole('checkbox', { name: 'Select all simulations' }).check();
  await runButton(page).click();
  const picker = page.getByRole('button', { name: /Choose which flight/ });
  await expect(picker).toBeVisible({ timeout: 30_000 });

  await openTab(page, 'Simulations');
  const apogeeOf = async (name: string) =>
    (await page
      .getByRole('row', { name: new RegExp(`^Select ${name} `) })
      .getByRole('cell')
      .nth(4)
      .textContent())!.trim();
  const tilted = await apogeeOf('Tilted');
  const upright = await apogeeOf('Simulation 1');
  expect(tilted).not.toBe(upright);

  await openTab(page, 'Results');
  const tile = page
    .getByRole('region', { name: 'Results' })
    .getByText('Apogee', { exact: true })
    .locator('xpath=following-sibling::div[1]');
  await expect(picker).toHaveText(/^Tilted/);
  await expect(tile).toHaveText(tilted);
  await picker.click();
  await page.getByRole('menuitemradio', { name: 'Simulation 1' }).click();
  await expect(picker).toHaveText(/^Simulation 1/);
  await expect(tile).toHaveText(upright);
});

test('one flown simulation gets a plain heading, not a picker', async ({ page }) => {
  await runFlight(page);
  await expect(page.getByRole('heading', { name: 'Simulation 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Choose which flight/ })).toHaveCount(0);
});

test('the chart panels you pick are still there after a reload', async ({ page }) => {
  await runFlight(page);

  const thrust = page.getByRole('button', { name: 'Thrust', exact: true });
  await expect(thrust).toHaveAttribute('aria-pressed', 'false');
  await thrust.click();
  await expect(thrust).toHaveAttribute('aria-pressed', 'true');

  await autosaved(page, '"maxAltitude"');
  await page.reload();
  await openTab(page, 'Results');
  await expect(page.getByRole('button', { name: 'Thrust', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the 3D path draws the flight being shown, not only the active row', async ({ page }) => {
  await runFlight(page);

  await openTab(page, 'Simulations');
  await page.getByRole('button', { name: 'Duplicate simulation' }).click();
  await openTab(page, 'Results');

  await page.getByRole('button', { name: '3D path', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('the ground track shows where the flight lands, and how far', async ({ page }) => {
  await openTab(page, 'Simulations');
  // Wind, or the track is a dot on the pad.
  await page.getByRole('spinbutton', { name: 'Speed', exact: true }).fill('4');
  await runFlight(page);

  await page.getByRole('button', { name: 'Ground track', exact: true }).click();
  const plan = page.getByRole('img', { name: /north up, pad at the center/ });
  await expect(plan).toBeVisible();

  await expect(page.getByText(/\d+(\.\d+)?\s*(m|ft)\s*·\s*\d+°/)).toBeVisible();
  await expect(page.getByText('This flight has no horizontal track to draw.')).toHaveCount(0);
});

test('the CSV export asks what to write instead of just downloading', async ({ page }) => {
  await runFlight(page);

  // By title: the events table has its own CSV button with the same label.
  await page.getByTitle('Download flight data as CSV').click();
  const dialog = page.getByRole('dialog', { name: 'Export flight data' });
  await expect(dialog).toBeVisible();

  const boxes = dialog.getByRole('checkbox');
  expect(await boxes.count()).toBeGreaterThan(30);
  await expect(dialog.getByText(/Exporting \d+ of \d+/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Select none' }).click();
  await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toBeDisabled();

  // `exact`: 'Altitude above sea level' is a different variable.
  await dialog.getByRole('checkbox', { name: 'Altitude', exact: true }).check();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toContain('.csv');

  await page.getByTitle('Download flight data as CSV').click();
  await expect(dialog.getByRole('checkbox', { name: 'Altitude', exact: true })).toBeChecked();
  await expect(dialog.getByText(/Exporting 1 of \d+/)).toBeVisible();
});
