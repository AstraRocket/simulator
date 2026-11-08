import { test, expect, ready, runFlight } from './base';

// drei's `<Html>` z-index range starts at 16,777,271, above every dialog.
test('flight-path callouts stay underneath a modal dialog', async ({ page }) => {
  await ready(page);
  await runFlight(page);
  await page.getByRole('button', { name: '3D path', exact: true }).click();

  const scrub = page.locator('input[type="range"]').first();
  await expect(scrub).toBeVisible({ timeout: 20_000 });
  await scrub.fill('1');
  const callouts = page.locator('[data-flight-callout]');
  await expect.poll(() => callouts.count(), { timeout: 20_000 }).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /Rocket Design Report/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const result = await page.evaluate(() => {
    const zOf = (el: Element | null): number => {
      for (let e = el; e; e = e.parentElement) {
        const z = getComputedStyle(e).zIndex;
        if (z !== 'auto') return Number(z);
      }
      return 0;
    };
    const dialogEl = document.querySelector('[role="dialog"]');
    const dialogZ = zOf(dialogEl);
    const outcomes = [...document.querySelectorAll('[data-flight-callout]')].map((c) => {
      const r = c.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        z: zOf(c),
        coveredByModal: !!top && !c.contains(top) && !top.contains(c),
      };
    });
    return { dialogZ, outcomes };
  });
  expect(result.dialogZ).toBeGreaterThan(0);
  for (const o of result.outcomes) {
    expect(o.z, 'callout stacking context below the dialog').toBeLessThan(result.dialogZ);
    expect(o.coveredByModal, 'the modal is the topmost element over the callout').toBe(true);
  }
});
