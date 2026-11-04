// cspell:ignore Инструменты Hulpmiddelen Opgeslagen язык
import { test, expect, runFlight, ready, box } from './base';

// `system-ui` is about 12% wider on Linux than on Windows, so measure in one wide face everywhere.
const WIDE_FACE = 'html, body, header, header * { font-family: Verdana, sans-serif !important; }';

test('the workbench tabs live in the header rather than a row of their own', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await ready(page);
  await runFlight(page);

  const header = page.locator('header').first();
  // The header is tightest once the debounced save status lands.
  await expect(header.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();
  await page.addStyleTag({ content: WIDE_FACE });

  const nav = page.getByRole('navigation', { name: /Workbench/i });
  await expect(nav.getByRole('button')).toHaveCount(6);

  const h = await box(header);
  const n = await box(nav);

  expect(n.x).toBeGreaterThan(h.x);
  expect(n.y).toBeGreaterThanOrEqual(h.y);
  expect(n.y + n.height).toBeLessThanOrEqual(h.y + h.height + 1);
  expect(n.x + n.width).toBeLessThan(h.x + h.width);

  expect((await box(page.locator('main'))).y).toBeLessThanOrEqual(h.y + h.height + 1);

  // One row in English only: the wordiest languages wrap at 1024.
  expect(h.height).toBeLessThan(70);
});

test('the identity block is the same at every width, and the row fits from 1180', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 900 });
  await ready(page);
  await runFlight(page);

  const header = page.locator('header').first();
  await expect(header.getByRole('status').filter({ hasText: /^Saved/ })).toBeVisible();
  await page.getByRole('combobox', { name: /language|idioma/i }).selectOption('pt-PT');
  await expect(header.getByRole('status').filter({ hasText: /^Guardado/ })).toBeVisible();
  await page.addStyleTag({ content: WIDE_FACE });

  const title = header.getByRole('heading', { level: 1 });
  const mark = header.locator('img[src$="favicon.svg"]');
  // The backend tooltip is latin in every language.
  const version = header.getByRole('button', { name: /^v\d/ });
  const backend = header.getByTitle(/WebAssembly|JavaScript/);

  for (const width of [1440, 1280, 1180, 1120, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(mark).toBeVisible();
    expect((await box(title)).width).toBeGreaterThan(50);
    await expect(version).toBeVisible();
    await expect(backend).toBeVisible();
    expect((await box(version.locator('..'))).width).toBeGreaterThan(90);
  }

  for (const width of [1180, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect((await box(header)).height).toBeLessThan(70);
  }

  await page.setViewportSize({ width: 1180, height: 900 });
  for (const [lang, saved] of [
    ['ru', /^Сохранено/],
    ['nl', /^Opgeslagen/],
  ] as const) {
    await page.getByRole('combobox', { name: /language|idioma|язык|taal/i }).selectOption(lang);
    await expect(header.getByRole('status').filter({ hasText: saved })).toBeVisible();
    expect((await box(header)).height, lang).toBeLessThan(70);
  }
});
