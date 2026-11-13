import { test, expect, type Page, note, openTab, runFlight, ready, box } from './base';

// Also run by the Pixel 7 project, so nothing here may depend on a desktop-only element.

test.describe('dialogs on a phone', () => {
  const panel = (page: Page) => page.locator('.dialog-panel').first();

  test('fill the screen edge to edge', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const set = await box(panel(page));
    expect({ w: set.width, h: set.height }).toEqual({ w: 390, h: 844 });
    await page.getByRole('button', { name: 'Close' }).first().click();

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'About' }).click();
    const about = await box(panel(page));
    expect({ w: about.width, h: about.height }).toEqual({ w: 390, h: 844 });
  });

  test('stay carded at the desktop breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1500, height: 950 });
    await ready(page);
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const set = await box(panel(page));
    note('desktop dialog', `${Math.round(set.width)}x${Math.round(set.height)}`);
    expect(set.width).toBeLessThan(1500);
    expect(set.height).toBeLessThan(950);
  });
});

test.describe('short prompts', () => {
  test.use({ wip: 'shown' });

  test('leaves short prompts as centered cards on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // Not ready(): the notice is modal over the strip this would wait on.
    await page.goto('/');

    const wip = page.getByRole('button', { name: 'I understand' });
    await expect(wip).toBeVisible();
    const card = await box(wip.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'));
    note('wip card', `${Math.round(card.width)}x${Math.round(card.height)} at y=${Math.round(card.y)}`);
    expect(card.width).toBeLessThan(390);
    expect(card.height).toBeLessThan(844 / 2);
    expect(card.y).toBeGreaterThan(0);
    await expect(page.locator('.dialog-panel')).toHaveCount(0);
  });
});

test('a finished run lands on the Results tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);

  const resultsTab = page.getByRole('button', { name: /Results/ });
  await expect(resultsTab).toHaveCount(0);

  await page.getByRole('button', { name: /Simulate/ }).click();
  await page.getByRole('button', { name: /Run flight simulation/ }).click();
  await expect(resultsTab).toBeVisible({ timeout: 30_000 });

  await expect(resultsTab).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Flight', exact: true })).toHaveAttribute('aria-pressed', 'true');

  for (const v of ['Flight', '3D path']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeVisible();
  }
  for (const v of ['2D', '3D', 'Aero']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeHidden();
  }

  await page.getByRole('button', { name: /Sketch/ }).click();
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'true');

  for (const v of ['2D', '3D', 'Aero']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeVisible();
  }
  for (const v of ['Flight', '3D path']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeHidden();
  }
});

test('the desktop workbench splits the view families across its tabs too', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await ready(page);
  await runFlight(page);

  for (const v of ['Flight', '3D path']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeVisible();
  }
  for (const v of ['2D', '3D', 'Aero']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeHidden();
  }

  await openTab(page, 'Design');
  for (const v of ['2D', '3D', 'Aero']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeVisible();
  }
  for (const v of ['Flight', '3D path']) {
    await expect(page.getByRole('button', { name: v, exact: true })).toBeHidden();
  }
});

test('the Results tab leads with the safety card, and the numbers scroll up behind it', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await ready(page);
  await page.getByRole('button', { name: /Simulate/ }).click();
  await page.getByRole('button', { name: /Run flight simulation/ }).click();
  await expect(page.getByRole('button', { name: /Results/ })).toBeVisible({ timeout: 30_000 });

  const m = await page.evaluate(() => {
    const card = document.querySelector('main section[aria-label="Before you fly"]');
    const grid = document.querySelector('main section[aria-label="Simulation results"]');
    let col: HTMLElement | null = card?.parentElement ?? null;
    while (col && !(col.scrollHeight > col.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(col).overflowY)))
      col = col.parentElement;
    let lead: Element | null = card ?? null;
    while (lead && col && lead.parentElement !== col) lead = lead.parentElement;
    const half = lead?.nextElementSibling ?? null;
    let before = lead?.previousElementSibling ?? null;
    let firstShown = true;
    for (; before; before = before.previousElementSibling)
      if (before.getBoundingClientRect().height > 0) firstShown = false;
    const box = (el?: Element | null) => (el ? Math.round(el.getBoundingClientRect().top) : null);
    return {
      cardTop: box(card),
      cardBottom: card ? Math.round(card.getBoundingClientRect().bottom) : null,
      summaryTop: box(grid),
      // Content edge: the block's pt-3 puts its border box above its content.
      leadTop: lead
        ? Math.round(lead.getBoundingClientRect().top + parseFloat(getComputedStyle(lead).paddingTop))
        : null,
      firstShown,
      colHolds: !!col && !!card && !!grid && col.contains(card) && col.contains(grid),
      colScrolls: col ? col.scrollHeight > col.clientHeight : false,
      chartHeight: half ? Math.round(half.getBoundingClientRect().height) : 0,
      viewport: window.innerHeight,
    };
  });
  note('results tab', JSON.stringify(m));

  expect(m.colHolds).toBe(true);
  expect(m.colScrolls).toBe(true);
  expect(m.firstShown).toBe(true);
  expect(m.cardTop).toBe(m.leadTop);
  expect(m.summaryTop).toBeGreaterThanOrEqual(m.cardBottom!);

  // First in DOM order: the sim editor keeps its own copy mounted behind the Simulate tab.
  const summary = page.getByRole('region', { name: 'Simulation results' }).first();
  await summary.getByText('Apogee', { exact: true }).scrollIntoViewIfNeeded();
  await expect(summary.getByText('Apogee', { exact: true })).toBeInViewport();

  expect(m.chartHeight).toBeGreaterThanOrEqual(Math.floor(m.viewport * 0.75));
});

test('starting a new design does not strand you on an empty Results tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole('button', { name: /Simulate/ }).click();
  await page.getByRole('button', { name: /Run flight simulation/ }).click();
  const resultsTab = page.getByRole('button', { name: /Results/ });
  await expect(resultsTab).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'New', exact: true }).click();

  await expect(resultsTab).toHaveCount(0);
  // Every open lands on the design and its stats (`LAND_ON_DESIGN`), the Rocket tab on a phone.
  await expect(page.getByText('L/D', { exact: true })).toBeVisible();
});
