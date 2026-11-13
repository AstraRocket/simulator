import { test, expect, autosaved, designTitle, importOrk, type NameClash, type Page } from './base';

const openLibrary = async (page: Page) => {
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Open…' }).click();
  await expect(page.getByRole('dialog', { name: 'My Rockets' })).toBeVisible();
};

const idbGets = (page: Page) => page.evaluate(() => (window as unknown as { __idbGets: number }).__idbGets);

const idbSettled = async (page: Page) => {
  let prev = await idbGets(page);
  await expect
    .poll(
      async () => {
        const now = await idbGets(page);
        const stable = now === prev;
        prev = now;
        return stable;
      },
      { timeout: 10_000, message: 'IndexedDB reads never went quiet: the dialog is refreshing itself' },
    )
    .toBe(true);
};

test.describe('design library', () => {
  // Count IndexedDB reads: re-rendering identical output mutates no DOM, so a MutationObserver cannot see the loop.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __idbGets: number };
      w.__idbGets = 0;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- saved to patch the prototype; called back with .call(this, ...)
      const orig = IDBObjectStore.prototype.get;
      IDBObjectStore.prototype.get = function (...args: [IDBValidKey | IDBKeyRange]) {
        w.__idbGets++;
        return orig.apply(this, args);
      };
    });
  });

  test('opens and settles instead of refreshing forever', async ({ page }) => {
    await page.goto('/');

    await openLibrary(page);
    const panel = page.getByRole('dialog', { name: 'My Rockets' });

    const before = await idbGets(page);
    await idbSettled(page);
    expect((await idbGets(page)) - before).toBeLessThan(10);
    await expect(panel).toBeVisible();
  });

  test('rename dialog stays open, and its backdrop does not close the library', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Save As…' }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Test Rocket');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await openLibrary(page);
    await expect(page.getByText('Test Rocket')).toBeVisible();

    await page.getByRole('button', { name: 'Rename' }).first().click();
    const rename = page.getByRole('dialog', { name: 'Rename' });
    await expect(rename).toBeVisible();
    await idbSettled(page);
    await expect(rename).toBeVisible();

    await page.mouse.click(5, 5);
    await expect(rename).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'My Rockets' })).toBeVisible();
  });

  test('asks before deleting a saved design', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Save As…' }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Doomed Rocket');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await openLibrary(page);
    await page.getByRole('button', { name: 'Delete' }).first().click();

    const ask = page.getByRole('alertdialog');
    await expect(ask.getByText(/Delete "Doomed Rocket"\?/)).toBeVisible();
    await ask.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Doomed Rocket')).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Doomed Rocket')).toBeHidden();
  });
});

test('an example opens from the library, as its own unsaved design', async ({ page }) => {
  await page.goto('/');
  await openLibrary(page);

  const dlg = page.getByRole('dialog', { name: 'My Rockets' });
  await page.getByRole('tab', { name: 'Examples' }).click();

  const entry = dlg.getByRole('button').filter({ hasText: 'Clustered motors' });
  await expect(entry).toBeVisible({ timeout: 15_000 });
  await expect(entry).toContainText('Cluster');

  await entry.click();
  await expect(dlg).toBeHidden();

  await expect(designTitle(page)).toContainText('Clustered motors');
  // Scoped to the tree: the name is also on SVG <title>s in the schematic.
  await expect(page.getByRole('tree', { name: 'Components' }).getByText('Clustered Inner Tube')).toBeVisible();

  await autosaved(page, 'Clustered Inner Tube');
  await openLibrary(page);
  const lib = page.getByRole('dialog', { name: 'My Rockets' });
  await expect(lib.getByRole('button', { name: /^Clustered motors/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Examples' }).click();
  await expect(lib.getByRole('button').filter({ hasText: 'Clustered motors' })).toBeVisible();
});

test('an example opens from Import, as its own unsaved design', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /^Import$/ }).click();
  await page.getByRole('menuitem', { name: 'Import one of the examples' }).click();

  const dlg = page.getByRole('dialog', { name: 'Example rockets' });
  const entry = dlg.getByRole('button').filter({ hasText: 'Tube fin rocket' });
  await expect(entry).toBeVisible({ timeout: 15_000 });
  await entry.click();
  await expect(dlg).toBeHidden();

  await expect(designTitle(page)).toContainText('Tube fin rocket');
  await expect(page.getByRole('tree', { name: 'Components' }).getByText('Tube fin set')).toBeVisible();
});

test.describe('re-importing a rocket the library already holds', () => {
  const savedNames = async (page: Page): Promise<string[]> => {
    await openLibrary(page);
    const dlg = page.getByRole('dialog', { name: 'My Rockets' });
    const rows = await dlg
      .getByRole('listitem')
      .evaluateAll((els) => els.map((el) => el.querySelector('span')?.textContent ?? ''));
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    return rows;
  };

  const importTwice = async (page: Page, clash: NameClash) => {
    await importOrk(page, 'e2e/fixtures/two-stage.ork');
    await expect.poll(() => savedNames(page), { timeout: 20_000 }).toHaveLength(1);
    await importOrk(page, 'e2e/fixtures/two-stage.ork', clash);
  };

  test('overwriting leaves the library holding one rocket', async ({ page }) => {
    await page.goto('/');
    await importTwice(page, 'overwrite');

    // Read twice: the second is after the autosave could add a row.
    expect(await savedNames(page)).toHaveLength(1);
    expect(await savedNames(page)).toHaveLength(1);
  });

  test('keeping both gives the second rocket a name of its own', async ({ page }) => {
    await page.goto('/');
    await importTwice(page, 'keepBoth');

    await expect.poll(() => savedNames(page), { timeout: 20_000 }).toHaveLength(2);
    const names = await savedNames(page);
    expect(new Set(names).size).toBe(2);
    expect(names.some((n) => n.endsWith('(2)'))).toBe(true);
  });
});
