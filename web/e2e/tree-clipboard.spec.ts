import { test, expect, ready } from './base';

// Rows are counted by name: a copy keeps the original's name, as on the desktop.
test('the tree cuts, copies, pastes and duplicates parts', async ({ page }) => {
  await ready(page);
  const tree = page.getByRole('tree', { name: 'Components' });
  const rows = (name: string) => tree.getByRole('treeitem', { name });
  const button = (name: string) => page.getByRole('button', { name, exact: true });

  await expect(button('Paste')).toBeDisabled();
  await expect(button('Paste')).toHaveAttribute('title', /Nothing to paste/);

  await rows('Shock cord').click();
  await button('Copy').click();
  await expect(button('Paste')).toBeEnabled();
  await rows('Body tube').click();
  await button('Paste').click();
  await expect(rows('Shock cord')).toHaveCount(2);
  await expect(tree.getByRole('treeitem', { selected: true })).toHaveAccessibleName(/^Shock cord/);

  await button('Duplicate').click();
  await expect(rows('Shock cord')).toHaveCount(3);

  await button('Cut').click();
  await expect(rows('Shock cord')).toHaveCount(2);

  await rows('Body tube').click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(rows('Shock cord')).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+d');
  await expect(rows('Shock cord')).toHaveCount(4);

  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows('Shock cord')).toHaveCount(2);

  await rows('Trapezoidal fin set').click();
  await button('Copy').click();
  await rows('Nose cone').click();
  await expect(button('Paste')).toBeDisabled();
  await expect(button('Paste')).toHaveAttribute('title', /Trapezoidal fin set can't go in or after Nose cone/);
});
