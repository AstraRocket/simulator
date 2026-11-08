import { test, expect, type Page } from './base';

const openPerComponent = async (page: Page) => {
  await page.getByRole('button', { name: 'Aero', exact: true }).click();
  await page.getByRole('button', { name: 'Per component', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Drag by component' })).toBeVisible();
};

const columnColors = (page: Page, table: number, header: string) =>
  page.evaluate(
    ({ k, h }) => {
      const t = document.querySelectorAll('table')[k];
      if (!t) return [];
      const heads = [...(t.querySelectorAll('thead th') ?? [])].map((x) => (x.textContent || '').trim());
      const col = heads.findIndex((x) => x === h);
      if (col < 0) return [];
      return [...t.querySelectorAll('tbody tr')].map((tr) => {
        const cell = tr.children[col] as HTMLElement | undefined;
        return cell?.style.backgroundColor || '';
      });
    },
    { k: table, h: header },
  );

test.describe('aero table shading', () => {
  test('Cd is shaded on the OpenRocket scale, CNalpha is not', async ({ page }) => {
    await page.goto('/');
    await openPerComponent(page);

    await page.getByRole('button', { name: 'By heat', exact: true }).click();

    const cd = (await columnColors(page, 0, 'Cd')).filter(Boolean);
    expect(cd.length).toBeGreaterThan(0);

    const cna = (await columnColors(page, 1, 'CNα')).filter(Boolean);
    expect(cna).toEqual([]);
  });

  test('By magnitude shades CNalpha, and distinguishes its rows', async ({ page }) => {
    await page.goto('/');
    await openPerComponent(page);

    await page.getByRole('button', { name: 'By magnitude', exact: true }).click();

    const cna = (await columnColors(page, 1, 'CNα')).filter(Boolean);
    expect(cna.length).toBeGreaterThan(1);
    expect(new Set(cna).size).toBeGreaterThan(1);
  });
});
