import { test, expect, type Page, note, tableRows } from './base';

const openAero = async (page: Page) => {
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();
};

const cp = async (page: Page) => {
  const rows = await tableRows(page, 'Stability contribution');
  const i = rows[0]?.findIndex((h) => h.startsWith('CP')) ?? -1;
  return Number(rows.find((r) => r[0] === 'Whole rocket')?.[i]);
};

const rollRow = async (page: Page) => {
  const rows = await tableRows(page, 'Roll dynamics');
  return rows[1]?.slice(1).map(Number);
};

const setField = async (page: Page, label: string, value: string, settled?: () => Promise<unknown>) => {
  // By role: the unit chip's name contains the field's, so getByLabel matches both.
  const before = settled ? JSON.stringify(await settled()) : null;
  await page.getByRole('spinbutton', { name: label }).fill(value);
  await page.getByRole('spinbutton', { name: label }).press('Enter');
  if (settled) {
    await expect
      .poll(async () => JSON.stringify(await settled()), { timeout: 15_000, message: `${label} never re-swept` })
      .not.toBe(before);
  }
};

test.describe('aero flight conditions', () => {
  test('angle of attack moves the CP', async ({ page }) => {
    await page.goto('/');
    await openAero(page);

    const at0 = await cp(page);
    await setField(page, 'AoA', '5', () => cp(page));
    const at5 = await cp(page);
    note('CP at AoA 0 =', at0, '| at AoA 5 =', at5);
    expect(at5).not.toBeCloseTo(at0, 1);
  });

  test('roll rate brings the damping coefficient to life', async ({ page }) => {
    await page.goto('/');
    await page.getByText(/Trapezoidal fin/).click();
    await setField(page, 'Cant angle', '3');
    await openAero(page);

    await expect.poll(async () => (await rollRow(page))?.[0] ?? 0).toBeGreaterThan(0);
    const still = await rollRow(page);
    expect(still, 'the fin set row of the roll table').toBeDefined();
    expect(still?.[1]).toBe(0);

    await setField(page, 'Roll rate', '20', () => rollRow(page));
    const rolling = await rollRow(page);
    note('roll [forcing, damping] still', still, '-> rolling', rolling);
    expect(rolling, 'the fin set row of the roll table after the roll rate').toBeDefined();
    expect(rolling?.[1]).toBeGreaterThan(0);
    expect(rolling?.[0]).toBeCloseTo(still?.[0] ?? NaN, 3);
  });

  test('Worst finds the wind direction where the CP sits furthest forward', async ({ page }) => {
    await page.goto('/');
    // Two fins: a symmetric three-fin set's CP does not depend on roll angle.
    await page.getByText(/Trapezoidal fin/).click();
    await setField(page, 'Fin count', '2');
    await openAero(page);
    await setField(page, 'AoA', '5');

    const seen: number[] = [];
    for (const theta of ['0', '30', '60', '90']) {
      await setField(page, 'Wind dir', theta);
      seen.push(await cp(page));
    }
    note('CP across wind direction:', seen);
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(1);

    const dir = page.getByRole('spinbutton', { name: 'Wind dir' });
    const beforeWorst = await dir.inputValue();
    await page.getByRole('button', { name: 'Worst' }).click();
    await expect.poll(() => dir.inputValue(), { timeout: 15_000 }).not.toBe(beforeWorst);
    // Polled: the field updates one render before the deferred sweep reaches the table.
    await expect.poll(() => cp(page), { timeout: 15_000 }).toBeLessThanOrEqual(Math.min(...seen) + 0.05);
    note(
      'worst wind dir =',
      await page.getByRole('spinbutton', { name: 'Wind dir' }).inputValue(),
      '-> CP',
      await cp(page),
    );
  });
});
