import { test, expect, type Page } from './base';
import { THEMES } from './axe';

test.describe('2D schematic interaction', () => {
  const schematic = (page: Page) =>
    page
      .locator('svg')
      .filter({ has: page.locator('title') })
      .first();

  // Not the svg's middle: the drawing centers between the enabled ruler lanes.
  const centerlineY = async (page: Page) => {
    const nose = (await schematic(page)
      .locator('title', { hasText: /^Nose cone$/ })
      .first()
      .locator('..')
      .boundingBox())!;
    return nose.y + nose.height / 2;
  };

  // The schematic has its final size only once the stats strip renders.
  const ready = async (page: Page) => {
    await page.goto('/');
    await expect(page.getByText('L/D', { exact: true })).toBeVisible({ timeout: 20_000 });
  };

  test('clicking a component on the canvas selects it (property editor opens)', async ({ page }) => {
    await ready(page);
    const hint = page.getByText(/Select a component in the tree or drawing/i);
    await expect(hint).toBeVisible();

    const svg = schematic(page);
    const box = (await svg.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.45, await centerlineY(page));

    await expect(hint).toBeHidden();
  });

  test('hovering a component shows its name tag on the canvas', async ({ page }) => {
    await ready(page);
    const svg = schematic(page);
    const box = (await svg.boundingBox())!;
    // Aft of the internals packed in the forward half, so the tag names the body tube.
    await page.mouse.move(box.x + box.width * 0.62, await centerlineY(page));
    await expect(svg.locator('text', { hasText: /Body tube/i })).toBeVisible();
  });

  test('dragging horizontally on the drawing rolls the rocket', async ({ page }) => {
    await ready(page);
    const roll = page.getByRole('slider', { name: /roll/i });
    const before = await roll.inputValue();

    const svg = schematic(page);
    const box = (await svg.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.3, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, y, { steps: 15 });
    await page.mouse.up();

    await expect.poll(() => roll.inputValue()).not.toBe(before);
  });

  test('the length caliper shows a live measurement readout', async ({ page }) => {
    await ready(page);
    await page.getByTitle(/Length calipers/i).click();
    const svg = schematic(page);
    await expect(svg.locator('text[fill="var(--accent)"]', { hasText: /cm/ }).first()).toBeVisible();
  });

  // axe does not judge SVG text, so contrast is measured here.
  for (const theme of THEMES) {
    test(`the caliper readouts hold 4.5:1 in the ${theme} theme`, async ({ page }) => {
      await ready(page);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.getByTitle(/Length calipers/i).click();
      await page.getByTitle(/Diameter calipers/i).click();
      const tags = schematic(page).locator('text[fill="var(--accent)"]');
      await expect(tags).toHaveCount(2);

      const ratios = await tags.evaluateAll((texts) => {
        // Through a canvas so any resolved color (oklch included) comes back as sRGB.
        const ctx = document.createElement('canvas').getContext('2d')!;
        const rgb = (css: string) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
        };
        const lum = (c: number[]) => {
          const [r, g, b] = c.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
        };
        return texts.map((text) => {
          const fg = lum(rgb(getComputedStyle(text).fill));
          const bg = lum(rgb(getComputedStyle(text.previousElementSibling!).fill));
          return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        });
      });
      for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
});
