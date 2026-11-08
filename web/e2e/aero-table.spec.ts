import { NO_VALUE } from '../src/i18n/noValue';
import { test, expect, type Page, note, tableUnder, tableRows, defined } from './base';

test.describe('aero component table', () => {
  test('adds up: the rows account for the whole rocket', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Aero', exact: true }).click();
    await page.getByRole('button', { name: 'Per component', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Drag by component' })).toBeVisible();

    const r = await tableRows(page, 'Drag by component');
    const cd = defined(r[0], 'the drag table header row').indexOf('Cd');
    expect(cd).toBeGreaterThan(0);
    const total = Number(
      defined(
        r.find((x) => x[0] === 'Whole rocket'),
        'the Whole rocket row',
      )[cd],
    );
    const sum = r
      .slice(1)
      .filter((x) => x[0] !== 'Whole rocket')
      .reduce((a, x) => a + Number(x[cd]), 0);
    note('total', total, 'sum of rows', sum.toFixed(3));

    expect(Math.abs(sum - total)).toBeLessThan(0.005);
    expect(r.some((x) => x[0] === 'Not attributed to a component')).toBe(false);
  });

  test('counts every instance of a multi-instance component', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Aero', exact: true }).click();
    await page.getByRole('button', { name: 'Per component', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Drag by component' })).toBeVisible();

    const r = await tableRows(page, 'Drag by component');
    const header = defined(r[0], 'the drag table header row');
    const fins = defined(
      r.find((x) => /fin set/i.test(x[0] ?? '')),
      'the fin set row',
    );
    const perInstance = header.indexOf('Per instance');
    const cd = header.indexOf('Cd');
    expect(perInstance).toBeGreaterThan(-1);

    const [one, count] = defined(fins[perInstance], 'the per-instance cell')
      .split('×')
      .map((x) => Number(x.trim()));
    note('fins', fins[perInstance], '->', fins[cd]);
    expect(count).toBe(3);
    expect(Number(fins[cd])).toBeCloseTo(
      defined(one, 'the per-instance drag') * defined(count, 'the instance count'),
      2,
    );
  });

  test('the Mach slider drives the tables, and only lands on computed samples', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Aero', exact: true }).click();
    await page.getByRole('button', { name: 'Per component', exact: true }).click();

    const heading = page.getByRole('heading', { name: 'Drag by component' });
    const machText = () => heading.locator('xpath=following-sibling::span[1]').textContent();
    const resting = await machText();

    // Arrow keys, not fill(): stepping is under test.
    const slider = page.getByLabel('Mach number for the tables');
    await slider.focus();
    for (let k = 0; k < 10; k++) await page.keyboard.press('ArrowRight');

    const moved = await machText();
    note('slider', resting, '->', moved);
    expect(moved).not.toBe(resting);

    const shown = await page.locator('input[type=range]').evaluate((el: HTMLInputElement) => el.value);
    expect(moved).toContain(Number(shown).toFixed(2));
  });
});

test.describe('aero stability table', () => {
  test('component CNa sums to the rocket, and CP is its weighted mean', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Aero', exact: true }).click();
    await page.getByRole('button', { name: 'Per component', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Stability contribution' })).toBeVisible();

    const r = await tableRows(page, 'Stability contribution');
    const head = defined(r[0], 'the stability table header row');
    // Two CP columns (length and %): take the length one explicitly.
    const cp = head.findIndex((h) => h.startsWith('CP (') && !h.includes('%'));
    const cna = head.indexOf('CNα');
    const rocket = defined(
      r.find((x) => x[0] === 'Whole rocket'),
      'the Whole rocket row',
    );
    const parts = r.slice(1).filter((x) => x[0] !== 'Whole rocket');

    const sumCna = parts.reduce((a, x) => a + Number(x[cna]), 0);
    note('rocket CNa', rocket[cna], 'sum of parts', sumCna.toFixed(2));
    expect(sumCna).toBeCloseTo(Number(rocket[cna]), 1);

    const weighted = parts.reduce((a, x) => a + Number(x[cp]) * Number(x[cna]), 0) / sumCna;
    note('rocket CP', rocket[cp], 'weighted mean', weighted.toFixed(1));
    expect(weighted).toBeCloseTo(Number(rocket[cp]), 0);

    // A straight body tube carries no normal force in Barrowman.
    expect(parts.some((x) => /body tube/i.test(x[0] ?? ''))).toBe(false);
  });
});

test('carries the mass breakdown beside the aero figures', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stability contribution' })).toBeVisible();

  const r = await tableRows(page, 'Stability contribution');
  const head = defined(r[0], 'the stability table header row');
  for (const col of ['Each (g)', 'Total (g)', 'CG (cm)']) expect(head).toContain(col);
  const fins = defined(
    r.find((x) => /fin set/i.test(x[0] ?? '')),
    'the fin set row',
  );
  expect(fins.some((c) => c === NO_VALUE)).toBe(false);
  note('fins row', fins.join(' | '));
});

test('always shows roll dynamics, and fills it in once the fins are canted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stability contribution' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Roll dynamics' })).toBeVisible();
  const forcingNow = async () => {
    const rows = await tableRows(page, 'Roll dynamics');
    return Number(defined(rows[1], 'the fin set row of the roll table')[1]);
  };
  expect(await forcingNow()).toBe(0);

  await page
    .getByRole('tree', { name: 'Components' })
    .getByText(/Trapezoidal fin/)
    .click();
  const cant = page.getByLabel(/cant/i).first();
  await cant.fill('');
  await cant.pressSequentially('3');
  await cant.blur();
  await page.getByRole('button', { name: 'Aero', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Roll dynamics' })).toBeVisible();
  const finForcing = async () => {
    const roll = await tableRows(page, 'Roll dynamics');
    return Number(
      defined(
        roll.find((x) => /fin set/i.test(x[0] ?? '')),
        'the fin set row',
      )[1],
    );
  };
  await expect.poll(finForcing).toBeGreaterThan(0);
  note('roll forcing at 3 deg cant', await finForcing());
});

const cdCells = (page: Page) =>
  tableUnder(page, 'Drag by component').evaluate((table) => {
    const rows = [...table.querySelectorAll('tr')];
    const head = rows[0];
    if (!head) throw new Error('the drag table has no header row');
    const cd = [...head.children].findIndex((c) => (c.textContent || '').trim() === 'Cd');
    if (cd < 0) throw new Error('the drag table has no Cd column');
    return rows.slice(1).map((r, i) => {
      const td = r.children[cd];
      if (!(td instanceof HTMLElement)) throw new Error(`drag table row ${i + 1} has no Cd cell`);
      const st = getComputedStyle(td);
      return { value: Number(td.textContent), bg: st.backgroundColor, fg: st.color };
    });
  });

test('shades the drag cells in proportion to the value', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drag by component' })).toBeVisible();

  const cells = (await cdCells(page)).map(({ value, bg }) => {
    const m = /rgba?\(([^)]+)\)/.exec(bg);
    const parts = defined(m?.[1], `an rgb() background on the Cd ${value} cell (got "${bg}")`).split(',').map(Number);
    return { value, alpha: parts[3] ?? 1, rgb: parts.slice(0, 3).join(',') };
  });
  note('cd cells', JSON.stringify(cells));

  expect(new Set(cells.map((c) => c.rgb)).size).toBe(1);

  const byValue = [...cells].sort((a, b) => a.value - b.value);
  const alphas = byValue.map((c) => c.alpha);
  expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
  const lightest = defined(alphas[0], 'the smallest Cd cell');
  const darkest = defined(alphas.at(-1), 'the largest Cd cell');
  expect(darkest).toBeGreaterThan(lightest);

  // Short of opaque, so the text keeps its own color.
  expect(darkest).toBeLessThan(0.6);
  await expect(page.getByText('Share of total')).toBeVisible();
});

test('offers OpenRocket’s heat as an alternative shading', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drag by component' })).toBeVisible();

  await page.getByRole('button', { name: 'By heat' }).click();

  const cells = await cdCells(page);
  note('OR heat', JSON.stringify(cells));

  const rgb = (s: string) => defined(s.match(/\d+/g), `rgb channels in "${s}"`).map(Number);

  // OpenRocket's ComponentAnalysisGeneralPanel DragCellRenderer, written out so the app is not compared with itself.
  const expected = (value: number) => {
    const r = value / 1.5;
    const hue = Math.max(0, Math.min(0.3333 * (1 - 2 * r), 0.3333));
    const sat = Math.max(0, Math.min(0.8 * r + 0.1 * (1 - r), 1));
    return [5, 3, 1].map((n) => {
      const k = (n + hue * 6) % 6;
      return Math.round(255 * (1 - sat * Math.max(0, Math.min(k, 4 - k, 1))));
    });
  };

  // Mid-scale: at the ends the hue or saturation term is clamped.
  const mid = defined(
    cells.find((c) => c.value > 0.2 && c.value < 0.8),
    'a mid-scale Cd cell',
  );
  const got = rgb(mid.bg);
  for (const [i, want] of expected(mid.value).entries()) {
    expect(Math.abs(defined(got[i], `channel ${i} of the Cd ${mid.value} cell`) - want)).toBeLessThanOrEqual(1);
  }

  const largest = [...cells].sort((a, b) => b.value - a.value)[0];
  const big = rgb(defined(largest, 'the largest Cd cell').bg);
  const small = rgb(defined(cells.at(-1), 'the last Cd cell').bg);
  expect(big[0]).toBeGreaterThan(defined(big[1], 'the green channel of the biggest cell'));
  expect(small[1]).toBeGreaterThan(defined(small[0], 'the red channel of the smallest cell'));

  expect(cells.every((c) => c.fg === 'rgb(0, 0, 0)')).toBe(true);
  await expect(page.getByText('Cd scale')).toBeVisible();
});

test('the shading switch on the legend is the same preference as Settings', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();

  const magnitude = page.getByRole('button', { name: 'By magnitude' });
  const orHeat = page.getByRole('button', { name: 'By heat' });
  await expect(magnitude).toHaveAttribute('aria-pressed', 'true');

  await orHeat.click();
  await expect(orHeat).toHaveAttribute('aria-pressed', 'true');
  await expect(magnitude).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Colors' }).click();
  const select = page.getByLabel('Cell colors');
  await expect(select).toHaveValue('openrocket');

  await select.selectOption('sky');
  await page.getByRole('button', { name: 'Close' }).first().click();
  await expect(page.getByRole('button', { name: 'By magnitude' })).toHaveAttribute('aria-pressed', 'true');
});

// One fin set is its own maximum, so it would shade at full tint.
test('leaves a lone fin set unshaded in the roll table', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('tree', { name: 'Components' })
    .getByText(/Trapezoidal fin/)
    .click();
  await page.getByLabel('Cant angle').fill('3');
  await page.getByLabel('Cant angle').blur();
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Roll dynamics' })).toBeVisible();

  const cells = await tableUnder(page, 'Roll dynamics').evaluate((table) =>
    [...table.querySelectorAll('tr')]
      .slice(1)
      .flatMap((tr) => [...tr.children].map((td) => getComputedStyle(td).backgroundColor)),
  );
  note('roll cell backgrounds', JSON.stringify(cells));
  expect(cells.every((bg) => bg === 'rgba(0, 0, 0, 0)')).toBe(true);
  await expect(page.getByText('Share of the largest in each column')).toHaveCount(0);
});
