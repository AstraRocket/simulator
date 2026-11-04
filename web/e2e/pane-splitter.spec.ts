import { test, expect, type Locator, type Page, openTab, runFlight, ready, box } from './base';

const drag = async (page: Page, sep: Locator, toX: number) => {
  const b = await box(sep);
  await page.mouse.move(b.x + b.width / 2, b.y + 200);
  await page.mouse.down();
  await page.mouse.move(toX, b.y + 200, { steps: 8 });
  await page.mouse.up();
};

test('the tree column can be dragged, and keeps its width', async ({ page }) => {
  await ready(page);

  const pane = page.locator('main > section').first();
  const sep = page.getByRole('separator', { name: /components panel/ });
  const width = async () => (await box(pane)).width;

  expect(await width()).toBe(360);
  await drag(page, sep, 480);
  expect(await width()).toBe(480);

  await page.reload();
  await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await width()).toBe(480);

  await drag(page, sep, 5);
  expect(await width()).toBe(300);
  await drag(page, sep, 1595);
  expect(await width()).toBe(640);

  await sep.focus();
  await page.keyboard.press('ArrowLeft');
  expect(await width()).toBe(624);
  await expect(sep).toHaveAttribute('aria-valuenow', '624');

  await sep.dblclick();
  expect(await width()).toBe(360);
});

test('the divider leaves room for the other panes, and only shows where it applies', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await ready(page);

  const sep = page.getByRole('separator', { name: /components panel/ });
  await drag(page, sep, 1000);

  const tree = await box(page.locator('main > section').first());
  const center = await box(page.locator('main > section').nth(1));
  expect(tree.width).toBe(640);
  expect(center.width).toBeGreaterThan(320);

  await runFlight(page);
  await expect(sep).toHaveCount(0);
  await openTab(page, 'Simulations');
  await expect(sep).toHaveCount(0);
  await openTab(page, 'Design');
  await expect(sep).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('separator')).toHaveCount(0);
});

test('the side column can be dragged, and the width is shared by every tab', async ({ page }) => {
  await ready(page);

  const sep = page.getByRole('separator', { name: /side panel/ });
  const props = page.locator('main > section').nth(2);
  const width = async () => (await box(props)).width;

  expect(await width()).toBe(380);
  await drag(page, sep, 1100);
  expect(await width()).toBe(500);

  await page.reload();
  await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(await width()).toBe(500);

  // The pane is right of this divider, so the clamps and arrows are mirrored.
  await drag(page, sep, 1595);
  expect(await width()).toBe(300);
  await drag(page, sep, 100);
  expect(await width()).toBe(640);

  await sep.focus();
  await page.keyboard.press('ArrowRight');
  expect(await width()).toBe(624);

  await sep.dblclick();
  expect(await width()).toBe(380);
});

test('every right-hand column is the same width, on whichever tab it appears', async ({ page }) => {
  await ready(page);
  await runFlight(page);

  const sep = page.getByRole('separator', { name: /side panel/ });
  await drag(page, sep, 1200);

  const visible = page.locator('main > section:visible').last();
  expect((await box(visible)).width).toBe(400);

  await openTab(page, 'Simulations');
  expect((await box(visible)).width).toBe(400);
  await openTab(page, 'Design');
  expect((await box(page.locator('main > section').nth(2))).width).toBe(400);

  await expect(page.getByRole('separator')).toHaveCount(2);
  await openTab(page, 'Simulations');
  await expect(page.getByRole('separator')).toHaveCount(1);
});

test('clicking a divider without moving it leaves the width alone', async ({ page }) => {
  await ready(page);

  // The pointer lands a pixel off the split, so a plain click must not commit.
  for (const name of [/components panel/, /side panel/]) {
    const sep = page.getByRole('separator', { name });
    const before = (await box(sep)).x;
    await sep.click();
    expect((await box(sep)).x).toBe(before);
  }
});
