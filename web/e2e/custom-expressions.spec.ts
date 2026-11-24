import { test, expect, openTab, ready, runFlight, type Page } from './base';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Custom Expressions' });

async function add(page: Page, name: string, symbol: string, unit: string, formula: string): Promise<void> {
  const d = dialog(page);
  await d.getByRole('button', { name: 'New expression' }).click();
  await d.getByLabel('Name').fill(name);
  await d.getByLabel('Symbol').fill(symbol);
  await d.getByLabel('Unit').fill(unit);
  await d.getByLabel('Formula').fill(formula);
  await d.getByRole('button', { name: 'Save' }).click();
}

test('an expression is calculated by the next run and charted by name', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Custom Expressions' }).click();
  await add(page, 'Kinetic energy', 'KE', 'J', '0.5*m*Vt^2');
  await add(page, 'Climb rate', 'CR', 'm/s', '(h-h[t-0.5])/0.5');
  await expect(dialog(page).getByText('Cannot be calculated')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Close' }).first().click();

  await runFlight(page);
  await openTab(page, 'Results');
  const list = page.getByRole('combobox', { name: 'Add a series…' });
  await expect(list.getByRole('option', { name: 'Climb rate' })).toBeAttached();
  await list.selectOption({ label: 'Kinetic energy' });
  await expect(page.getByRole('button', { name: 'Kinetic energy' })).toHaveAttribute('aria-pressed', 'true');

  await list.selectOption({ label: 'Custom Expressions…' });
  await expect(dialog(page).getByRole('button', { name: /Kinetic energy/ })).toBeVisible();
});
