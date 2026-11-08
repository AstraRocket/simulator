import { test, expect, runFlight, ready, box, defined } from './base';

test.beforeEach(async ({ page }) => {
  await ready(page);
});

test('nose-cone editor exposes shoulder fields incl. the capped toggle', async ({ page }) => {
  await page.locator('div[title="Nose cone"]').click();
  await expect(page.getByLabel('Shoulder length')).toBeVisible();
  await expect(page.getByLabel('Shoulder diameter', { exact: true })).toBeVisible();
  // Auto is off on a design read from a file.
  await expect(page.getByLabel('Shoulder diameter: Auto')).not.toBeChecked();
  await expect(page.getByLabel('Shoulder capped')).toBeVisible();
});

test('body-tube editor exposes the motor-mount toggle, then overhang and ignition', async ({ page }) => {
  await page.locator('div[title="Body tube"]').click();
  const mount = page.getByLabel('Motor mount');
  await expect(mount).toBeVisible();
  await expect(page.getByLabel('Motor overhang')).toHaveCount(0);
  await mount.check();
  await expect(page.getByLabel('Motor overhang')).toBeVisible();
  await expect(page.getByLabel('Ignition at')).toBeVisible();
});

test('fin editor exposes fin-tab fields', async ({ page }) => {
  await page.locator('div[title="Trapezoidal fin set"]').click();
  await expect(page.getByLabel('Fin tab length')).toBeVisible();
  await expect(page.getByLabel('Fin tab height')).toBeVisible();
});

test('a freeform fin can be added, shows the outline editor, and simulates', async ({ page }) => {
  await page.locator('div[title="Body tube"]').click();
  const addMenu = page.locator('select').filter({ hasText: 'Freeform fin set' });
  await addMenu.selectOption({ label: 'Freeform fin set' });

  await expect(page.getByText('Fin outline')).toBeVisible();
  const editor = page.locator('svg:has(polygon)');
  await expect(editor.first()).toBeVisible();
  expect(await editor.locator('circle').count()).toBeGreaterThanOrEqual(4);

  await runFlight(page);
});

test('a new part is made of something', async ({ page }) => {
  await page.locator('div[title="Body tube"]').click();
  await page.locator('select').filter({ hasText: 'Centering ring' }).selectOption({ label: 'Centering ring' });

  const panel = page.locator('main > section').nth(2);
  const material = panel.locator('select').filter({ has: page.locator('option[value="__default__"]') });
  await expect(material).toHaveValue('Cardboard');
  await expect(panel.getByText('automatic')).toHaveCount(0);
  await expect(panel.getByText(/No material assigned/)).toHaveCount(0);
});

test('the Comment section is the last thing in the editor', async ({ page }) => {
  await page.locator('div[title="Body tube"]').click();

  const panel = page.locator('main > section').nth(2);
  const heading = (name: string) => panel.getByRole('heading', { name, exact: true });
  const comment = await box(heading('Comment'));
  for (const above of ['Part', 'Motor', 'Appearance', 'Overrides']) {
    expect(comment.y).toBeGreaterThan((await box(heading(above))).y);
  }
});

test('the design actions share one row above the component list', async ({ page }) => {
  const stage = page.getByRole('button', { name: /Stage$/ });
  const add = page.getByRole('combobox', { name: /Add a part under|contain sub-parts/i });
  const scale = page.getByRole('button', { name: /Scale/ });
  for (const el of [stage, add, scale]) await expect(el).toBeVisible();

  const boxes = await Promise.all([stage, add, scale].map((el) => box(el)));
  const first = defined(boxes[0], 'the Stage button box');
  const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
  for (const b of boxes) expect(Math.abs(mid(b) - mid(first))).toBeLessThan(6);

  const heading = await box(page.getByRole('heading', { name: 'Components' }));
  for (const b of boxes) expect(b.y).toBeLessThan(heading.y);

  const sep = page.getByRole('separator', { name: /components panel/ });
  const b0 = await box(sep);
  await page.mouse.move(b0.x + b0.width / 2, b0.y + 200);
  await page.mouse.down();
  await page.mouse.move(5, b0.y + 200, { steps: 8 });
  await page.mouse.up();

  const tight = await Promise.all([stage, add, scale].map((el) => box(el)));
  const tightFirst = defined(tight[0], 'the Stage button box at the narrowest width');
  for (const b of tight) expect(Math.abs(mid(b) - mid(tightFirst))).toBeLessThan(6);
});
