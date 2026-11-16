import { execFileSync } from 'node:child_process';
import { cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { acknowledgeWip, servePreview, VITE, WEB } from './lib/previewCheck.mjs';

/* global document, location, window */

const OUT = 'dist-update-check';
// Served again later as a CDN node still holding the previous deploy.
const OUT_B = 'dist-update-check-b';
const PORT = 4179;
const URL_ = `http://localhost:${PORT}/`;
const VERSION_A = '0.0.0-update-a';
const VERSION_B = '0.0.0-update-b';
const VERSION_C = '0.0.0-update-c';
// Must match services/storage/settings.ts; this .mjs cannot import TS.
const log = (...a) => console.log('[update-flow]', ...a);
const chunkOf = (html) => html.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null;

function build(version) {
  log(`building ${version}`);
  execFileSync(process.execPath, [VITE, 'build', '--outDir', OUT, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: WEB,
    stdio: 'inherit',
    env: { ...process.env, APP_VERSION_OVERRIDE: version },
  });
}

const serve = () => servePreview(OUT, PORT, URL_);

async function main() {
  build(VERSION_A);
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await acknowledgeWip(page);

    // Own context, so never controlled (`clientsClaim` off).
    const firstVisit = await (await browser.newContext()).newPage();
    await acknowledgeWip(firstVisit);
    const markDocument = (p) =>
      p.evaluate(() => {
        window.__stillTheSameDocument = true;
      });
    const reloaded = (p) =>
      p.waitForFunction(() => window.__stillTheSameDocument === undefined, null, { timeout: 60_000 });

    const diagnose = async (p) => {
      const info = await p.evaluate(
        async (versions) => {
          const viaWorker = await fetch(location.href, { cache: 'no-store' }).then((r) => r.text());
          const reg = await navigator.serviceWorker.getRegistration();
          const text = document.body.textContent ?? '';
          return {
            renderedVersion: versions.find((v) => text.includes(`v${v}`)) ?? null,
            pageHtml: document.documentElement.outerHTML,
            viaWorkerHtml: viaWorker,
            controller: navigator.serviceWorker.controller?.scriptURL ?? null,
            active: reg?.active?.scriptURL ?? null,
            waiting: reg?.waiting?.scriptURL ?? null,
          };
        },
        [VERSION_A, VERSION_B, VERSION_C],
      );
      const serverHtml = await (await fetch(URL_, { cache: 'no-store' })).text();
      log(
        'diagnostics',
        JSON.stringify(
          {
            renderedVersion: info.renderedVersion,
            pageChunk: chunkOf(info.pageHtml),
            fetchedThroughWorkerChunk: chunkOf(info.viaWorkerHtml),
            serverChunk: chunkOf(serverHtml),
            controller: info.controller,
            active: info.active,
            waiting: info.waiting,
          },
          null,
          2,
        ),
      );
    };
    const step = async (name, fn, on = page) => {
      log(name);
      try {
        await fn();
      } catch (e) {
        await diagnose(on).catch((d) => log('diagnostics unavailable:', d instanceof Error ? d.message : d));
        throw new Error(`FAILED at "${name}": ${e instanceof Error ? e.message : String(e)}`, { cause: e });
      }
    };

    await step('load version A and let its worker take the page', async () => {
      await page.goto(URL_);
      await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, { timeout: 60_000 });
      await page.reload();
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000 });
      await page.getByText(`v${VERSION_A}`, { exact: true }).waitFor({ timeout: 60_000 });
    });

    await step(
      'open a first-visit tab on version A, which its worker does not control',
      async () => {
        await firstVisit.goto(URL_);
        await firstVisit.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, {
          timeout: 60_000,
        });
        await firstVisit.getByText(`v${VERSION_A}`, { exact: true }).waitFor({ timeout: 60_000 });
        if (await firstVisit.evaluate(() => !!navigator.serviceWorker.controller)) {
          throw new Error('the first visit is already controlled, so this step would prove nothing');
        }
      },
      firstVisit,
    );

    build(VERSION_B);
    cpSync(resolve(WEB, OUT), resolve(WEB, OUT_B), { recursive: true });

    await step(
      'the toast Reload takes a first-visit tab to version B',
      async () => {
        await firstVisit.evaluate(async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg) throw new Error('no registration');
          await reg.update();
        });
        await firstVisit.getByText('A new version is available.').waitFor({ timeout: 60_000 });
        await markDocument(firstVisit);
        await firstVisit.getByRole('button', { name: 'Reload', exact: true }).click();
        await reloaded(firstVisit);
        await firstVisit.getByText(`v${VERSION_B}`, { exact: true }).waitFor({ timeout: 60_000 });
      },
      firstVisit,
    );
    await firstVisit.context().close();

    await step('a plain reload shows version B, before any update prompt', async () => {
      await page.reload();
      await page.getByText(`v${VERSION_B}`, { exact: true }).waitFor({ timeout: 60_000 });
    });

    await step('ask the registration for an update', async () => {
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) throw new Error('no registration');
        await reg.update();
      });
    });

    await step('the toast offers the new version', async () => {
      await page.getByText('A new version is available.').waitFor({ timeout: 60_000 });
    });

    await step('the toast Reload reloads, and version B stays on screen', async () => {
      await markDocument(page);
      await page.getByRole('button', { name: 'Reload', exact: true }).click();
      await reloaded(page);
      await page.getByText(`v${VERSION_B}`, { exact: true }).waitFor({ timeout: 60_000 });
    });

    await step('Check for updates in the menu says the newest build is up to date', async () => {
      await page.getByRole('button', { name: 'Menu', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Check for updates', exact: true }).click();
      await page.getByText('You are running the latest version.').waitFor({ timeout: 60_000 });
      await page.keyboard.press('Escape');
    });

    await step('offline, a reload still boots the app from the worker', async () => {
      const failed = [];
      const errors = [];
      const onFailed = (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`);
      const onConsole = (m) => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text());
      page.on('requestfailed', onFailed);
      page.on('console', onConsole);
      await page.context().setOffline(true);
      try {
        // Offline reload can reject even when the worker answered it.
        await page
          .reload({ waitUntil: 'commit' })
          .catch((e) => log('reload while offline:', String(e.message).split(/\r?\n/)[0]));
        await page.getByText(`v${VERSION_B}`, { exact: true }).waitFor({ timeout: 60_000 });
      } catch (e) {
        log('offline failed requests:', JSON.stringify(failed.slice(0, 12), null, 2));
        log('offline console errors:', JSON.stringify(errors.slice(0, 12), null, 2));
        log(
          'offline page text:',
          JSON.stringify((await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')).slice(0, 300)),
        );
        throw e;
      } finally {
        page.off('requestfailed', onFailed);
        page.off('console', onConsole);
        await page.context().setOffline(false);
      }
    });

    build(VERSION_C);

    await step('an update nobody answers is applied once the tab is hidden', async () => {
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) throw new Error('no registration');
        await reg.update();
      });
      await page.getByText('A new version is available.').waitFor({ timeout: 60_000 });

      await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
      await page.getByText('A new version is available.').waitFor({ state: 'hidden', timeout: 30_000 });

      await markDocument(page);

      // Playwright cannot set visibilityState, so fake it and fire the event.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });

      await page.waitForFunction(() => window.__stillTheSameDocument === undefined, null, { timeout: 120_000 });
      await page.getByText(`v${VERSION_C}`, { exact: true }).waitFor({ timeout: 60_000 });
    });

    // GitHub Pages nodes can serve the previous sw.js for minutes after a deploy.
    await step('a stale copy of the previous build is never offered or applied', async () => {
      cpSync(resolve(WEB, OUT_B), resolve(WEB, OUT), {
        recursive: true,
        force: true,
        filter: (src) => !src.endsWith('index.html'),
      });
      await markDocument(page);
      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg) throw new Error('no registration');
        await reg.update();
      });
      await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, {
        timeout: 60_000,
      });
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await new Promise((r) => setTimeout(r, 45_000));
      if (!(await page.evaluate(() => window.__stillTheSameDocument === true))) {
        throw new Error('the page reloaded into the older build');
      }
      if (await page.getByText('A new version is available.').isVisible()) {
        throw new Error('the older build was offered as an update');
      }
      await page.getByText(`v${VERSION_C}`, { exact: true }).waitFor({ timeout: 10_000 });
    });

    log(
      'OK: a plain reload, the toast (on a first visit too) and a dismissed prompt all end on the new build, offline still boots, and a stale older build is never taken up',
    );
  } finally {
    await browser.close();
    server.kill();
    rmSync(resolve(WEB, OUT), { recursive: true, force: true });
    rmSync(resolve(WEB, OUT_B), { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
