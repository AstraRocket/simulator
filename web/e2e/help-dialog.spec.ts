import { existsSync } from 'node:fs';
import { test, expect, openTab, runFlight } from './base';

const helpDialog = 'Help';

// Playwright's cwd is web/.
const docsBuilt = existsSync('public/docs/index.html');

test.beforeEach(() => {
  if (process.env.CI && !docsBuilt) {
    throw new Error(
      'web/public/docs is not built. e2e-full.yml runs `npm run docs:build` before this spec; ' +
        'if that step was removed or failed, these tests must fail rather than skip.',
    );
  }
  // An environment precondition, not a disabled test.
  // eslint-disable-next-line playwright/no-skipped-test
  test.skip(!docsBuilt, 'web/public/docs is not built; run `npm run docs:build`');
});

test('Help opens the docs inside the app, with the site chrome stripped', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Help' }).click();

  const dialog = page.getByRole('dialog', { name: helpDialog });
  await expect(dialog).toBeVisible();

  const docs = page.frameLocator(`iframe[title="${helpDialog}"]`);
  // Docusaurus mounts every page in #__docusaurus.
  await expect(docs.locator('#__docusaurus')).toBeAttached();
  await expect(docs.locator('article')).toBeVisible();

  await expect(docs.locator('.navbar')).toBeHidden();
  await expect(docs.locator('.theme-doc-sidebar-container')).toBeHidden();
  await expect(docs.locator('footer.footer')).toBeHidden();
});

test('Safety opens Help already on the Safety page', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Safety' }).click();

  const dialog = page.getByRole('dialog', { name: helpDialog });
  await expect(dialog.getByRole('heading', { name: 'Safety' })).toBeVisible();

  await expect(dialog.getByRole('link', { name: 'Open on the docs site' })).toHaveAttribute(
    'href',
    'https://astrarocket.github.io/simulator/docs/safety',
  );

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('a link inside the docs navigates the dialog, and Back returns', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Safety' }).click();

  const dialog = page.getByRole('dialog', { name: helpDialog });
  const back = dialog.getByRole('button', { name: 'Back' });
  await expect(dialog.getByRole('heading', { name: 'Safety' })).toBeVisible();
  await expect(back).toBeDisabled();

  const docs = page.frameLocator(`iframe[title="${helpDialog}"]`);
  await docs.locator('.pagination-nav__link--next').click();

  // Safety is the last User Guide page; the glossary leads the Appendix (sidebars.ts).
  await expect(dialog.getByRole('heading', { name: 'Glossary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();

  await expect(back).toBeEnabled();
  await back.click();
  await expect(dialog.getByRole('heading', { name: 'Safety' })).toBeVisible();
  await expect(back).toBeDisabled();
});

test('the contents rail lists every page, and the headings of the one you are on', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Help' }).click();

  const dialog = page.getByRole('dialog', { name: helpDialog });
  const contents = dialog.getByRole('navigation', { name: 'Contents' });
  await expect(contents).toBeVisible();

  await expect(contents.getByText('User Guide', { exact: true })).toBeVisible();
  await expect(contents.getByRole('button', { name: 'User Guide', exact: true })).toHaveCount(0);

  // Docusaurus renders a collapsed category's children into no page (sidebars.ts `collapsed: false`).
  await expect(contents.getByRole('button', { name: 'Compared with mmrocket-sim', exact: true })).toBeVisible();

  await contents.getByRole('button', { name: 'Designing a Rocket', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Designing a Rocket' })).toBeVisible();

  const heading = contents.getByRole('button', { name: 'The component tree' });
  await expect(heading).toBeVisible();
  await expect(contents.locator('[aria-current="location"]')).toHaveCount(0);

  await heading.click();
  await expect(dialog.getByRole('heading', { name: 'Designing a Rocket' })).toBeVisible();
  await expect(heading).toHaveAttribute('aria-current', 'location');

  const later = contents.getByRole('button', { name: 'Undo / redo' });
  await later.click();
  await expect(later).toHaveAttribute('aria-current', 'location');
  await expect(heading).not.toHaveAttribute('aria-current', 'location');

  await dialog.getByRole('button', { name: 'Contents' }).click();
  await expect(contents).toBeHidden();
});

test('search finds a section on another page and opens it there', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Help' }).click();

  const dialog = page.getByRole('dialog', { name: helpDialog });
  const contents = dialog.getByRole('navigation', { name: 'Contents' });
  await expect(dialog.getByRole('heading', { name: 'Overview' })).toBeVisible();

  await contents.getByLabel('Search help').fill('ejection delay');

  // Scoped to the results group: a row's accessible name includes its snippet.
  const results = contents.getByRole('group', { name: /Matches:/ });
  await expect(results).toBeVisible();

  const hit = results.getByRole('button').first();
  await expect(hit).toContainText('Ejection delay');
  await expect(hit).toContainText('Motors');

  await hit.click();
  await expect(dialog.getByRole('heading', { name: 'Motors' })).toBeVisible();

  const docs = page.frameLocator(`iframe[title="${helpDialog}"]`);
  await expect(docs.locator('article mark[data-astra-help-mark]').first()).toBeVisible();

  await dialog.getByRole('button', { name: 'Clear search' }).click();
  await expect(contents.getByRole('button', { name: 'Safety', exact: true })).toBeVisible();
  await expect(docs.locator('article mark[data-astra-help-mark]')).toHaveCount(0);
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the contents rail overlays the page, and folds away once you pick one', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('menuitem', { name: 'Help' }).click();

    const dialog = page.getByRole('dialog', { name: helpDialog });
    const contents = dialog.getByRole('navigation', { name: 'Contents' });
    const toggle = dialog.getByRole('button', { name: 'Contents' });

    await expect(toggle).toBeVisible();
    await expect(contents).toBeHidden();

    await toggle.click();
    await expect(contents).toBeVisible();

    await contents.getByRole('button', { name: 'Motors', exact: true }).click();
    await expect(contents).toBeHidden();
    await expect(dialog.getByRole('heading', { name: 'Motors' })).toBeVisible();
  });
});

test('the Safety card opens Help without leaving the results', async ({ page }) => {
  await page.goto('/');
  await runFlight(page);
  await openTab(page, 'Results');

  await page.getByRole('button', { name: 'Read the safety notes' }).first().click();

  const dialog = page.getByRole('dialog', { name: helpDialog });
  await expect(dialog.getByRole('heading', { name: 'Safety' })).toBeVisible();
});

test('a rail heading picked before the frame has loaded still takes you there', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Help' }).click();
  const dialog = page.getByRole('dialog', { name: helpDialog });
  const contents = dialog.getByRole('navigation', { name: 'Contents' });
  await expect(contents.getByRole('button', { name: 'Designing a Rocket', exact: true })).toBeVisible();

  // Hold back only the frame's document; the dialog's own fetch, which builds the rail, goes through.
  await page.route('**/docs/**', async (route) => {
    const req = route.request();
    if (req.resourceType() === 'document' && req.frame() !== page.mainFrame()) {
      await new Promise((r) => setTimeout(r, 2000));
    }
    await route.continue();
  });

  await contents.getByRole('button', { name: 'Designing a Rocket', exact: true }).click();
  const heading = contents.getByRole('button', { name: 'The component tree' });
  await heading.click();
  await expect(heading).toHaveAttribute('aria-current', 'location', { timeout: 10_000 });
});
