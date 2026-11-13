// The precache answers only `docs/<slug>/index.html` (`directoryIndex` is off); `docs/<slug>/` needs a prior visit.
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { acknowledgeWip, servePreview, VITE, WEB } from './lib/previewCheck.mjs';

const DOCS = resolve(WEB, 'public/docs/index.html');
const OUT = 'dist-offline-check';
const PORT = 4181;
const URL_ = `http://localhost:${PORT}/`;
// Must match services/storage/settings.ts; this .mjs cannot import TS.
const UNREAD_PAGE = { menuItem: 'Safety', heading: 'Safety' };
const DIRECT_PAGE = 'docs/motors/';
const SEARCH = { query: 'ejection delay', match: /Ejection delay/ };

const log = (...a) => console.log('[offline-help]', ...a);

const serve = () => servePreview(OUT, PORT, URL_);

async function main() {
  if (!existsSync(DOCS)) {
    throw new Error('web/public/docs is empty: run `npm run docs:build` first (the deploy does this for itself)');
  }

  log('building');
  execFileSync(process.execPath, [VITE, 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: WEB,
    stdio: 'inherit',
  });

  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await acknowledgeWip(page);

    const failed = [];
    page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));

    const step = async (name, fn) => {
      log(name);
      try {
        await fn();
      } catch (e) {
        log('failed requests:', JSON.stringify(failed.slice(-12), null, 2));
        throw new Error(`FAILED at "${name}": ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      }
    };

    await step('install the worker and let it take the page', async () => {
      await page.goto(URL_);
      await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 60_000 });
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
    });

    await step(`visit ${DIRECT_PAGE} once, ONLINE, so the runtime rule has it`, async () => {
      await page.goto(URL_ + DIRECT_PAGE);
      await page.locator('article h1').waitFor({ timeout: 30_000 });
      await page.goto(URL_);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
    });

    await page.context().setOffline(true);
    log('network off');

    await step(`offline, Help opens "${UNREAD_PAGE.heading}", a page never read`, async () => {
      await page.getByRole('button', { name: 'Menu' }).click();
      await page.getByRole('menuitem', { name: UNREAD_PAGE.menuItem }).click();
      const article = page.frameLocator('iframe[title="Help"]').locator('article h1');
      await article.waitFor({ timeout: 30_000 });
      const text = (await article.textContent())?.trim();
      if (text !== UNREAD_PAGE.heading) throw new Error(`frame shows ${JSON.stringify(text)}`);
    });

    await step('offline, searching the guide builds its index from the precache', async () => {
      const dialog = page.getByRole('dialog', { name: 'Help' });
      const before = failed.length;
      await dialog.getByLabel('Search help').fill(SEARCH.query);
      const rows = dialog.getByRole('button', { name: SEARCH.match });
      await rows.first().waitFor({ timeout: 30_000 });

      // A page missing from the precache shows up as a failed request, not a shorter list.
      const broke = failed.slice(before).filter((r) => r.includes('/docs/'));
      if (broke.length) throw new Error(`docs requests failed offline: ${broke.join(', ')}`);

      await rows.first().click();
      const article = page.frameLocator('iframe[title="Help"]').locator('article h1');
      await article.waitFor({ timeout: 30_000 });
      if (!(await article.textContent())?.trim()) throw new Error('the result opened a page with no heading');
    });

    await step(`offline, ${DIRECT_PAGE} still loads by direct navigation`, async () => {
      await page.goto(URL_ + DIRECT_PAGE, { waitUntil: 'commit' }).catch((e) => {
        // Offline navigation can reject even when the worker answered it.
        log('navigation while offline:', String(e.message).split(/\r?\n/)[0]);
      });
      await page.locator('article h1').waitFor({ timeout: 30_000 });
    });

    log('OK: Help reads offline, both through the dialog and by direct navigation');
  } finally {
    await browser.close();
    server.kill();
    rmSync(resolve(WEB, OUT), { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`[offline-help] ${e.message}`);
  process.exit(1);
});
