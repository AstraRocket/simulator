import { test, expect, autosaved, openTab } from './base';

test.describe('AstraRocket smoke', () => {
  test('boots with an engine-computed design', async ({ page }) => {
    await page.goto('/');

    await openTab(page, 'Simulations');
    await expect(page.getByRole('row').filter({ hasText: 'Simulation 1' })).toBeVisible();
    await openTab(page, 'Design');

    await expect(page.getByText('L/D', { exact: true })).toBeVisible();

    // Exact, so "Flight" doesn't hit the "Run flight simulation" button.
    await expect(page.getByRole('button', { name: '2D', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aero', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Flight', exact: true })).toHaveCount(0);
  });

  test('says when the rocket was last saved, once a save has landed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Saved/)).toHaveCount(0);

    await openTab(page, 'Simulations');
    await page.getByRole('button', { name: 'Duplicate simulation' }).click();
    await autosaved(page, '"launch":', 2);

    await expect(page.getByText('Saved just now', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Save As…' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Save', exact: true })).toHaveCount(0);
  });

  test('running a sim unlocks the Flight view and clears "not run"', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Flight', exact: true })).toHaveCount(0);

    await openTab(page, 'Simulations');
    await page.getByRole('button', { name: /run flight simulation/i }).click();

    await expect(page.getByRole('button', { name: 'Flight', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('not run')).toHaveCount(0);
  });

  test('the sim runs off the main thread', async ({ page }) => {
    await page.addInitScript(() => {
      const probe: { id?: number; posted: boolean; replied: boolean } = { posted: false, replied: false };
      (window as unknown as { __sim: typeof probe }).__sim = probe;
      // eslint-disable-next-line @typescript-eslint/unbound-method -- saved to patch the prototype; called back with .call(this, ...)
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (this: Worker, msg: unknown, ...rest: unknown[]) {
        const m = msg as { id?: number; method?: string } | null;
        if (m?.method === 'simulate' && !probe.posted) {
          probe.posted = true;
          probe.id = m.id;
          this.addEventListener('message', (e: MessageEvent<{ id?: number }>) => {
            if (e.data?.id === probe.id) probe.replied = true;
          });
        }
        return (post as (...a: unknown[]) => void).call(this, msg, ...rest);
      } as typeof Worker.prototype.postMessage;
    });
    await page.goto('/');
    await expect(page.getByText('L/D', { exact: true })).toBeVisible();
    await openTab(page, 'Simulations');

    await page.getByRole('button', { name: /run flight simulation/i }).click();
    await expect(page.getByRole('button', { name: 'Flight', exact: true })).toBeVisible({ timeout: 30_000 });

    const sim = await page.evaluate(
      () => (window as unknown as { __sim: { posted: boolean; replied: boolean } }).__sim,
    );
    expect(sim.posted, 'the flight was posted to a worker').toBe(true);
    expect(sim.replied, 'and its result came back from that worker').toBe(true);
  });

  test('a duplicated simulation survives a page reload', async ({ page }) => {
    await page.goto('/');

    await openTab(page, 'Simulations');
    await page.getByRole('button', { name: 'Duplicate simulation' }).click();

    const rows = page.getByRole('row').filter({ hasText: /Simulation/ });
    await expect(rows).toHaveCount(2);

    await autosaved(page, '"launch":', 2);
    await page.reload();

    await openTab(page, 'Simulations');
    await expect(page.getByRole('row').filter({ hasText: /Simulation/ })).toHaveCount(2);
  });

  test('length calipers toggle on and off from the header controls', async ({ page }) => {
    await page.goto('/');

    const caliper = page.getByTitle(/Length calipers/i);
    await expect(caliper).toBeVisible();
    await expect(caliper).toHaveAttribute('aria-pressed', 'false');

    await caliper.click();
    await expect(caliper).toHaveAttribute('aria-pressed', 'true');

    await caliper.click();
    await expect(caliper).toHaveAttribute('aria-pressed', 'false');
  });
});
