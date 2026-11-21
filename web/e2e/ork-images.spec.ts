// cspell:ignore IHDR -- the PNG header chunk
import { test, expect, ready } from './base';

// PNG IHDR: width and height, big-endian, at bytes 16 and 20.
const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

test('a saved .ork carries the preview and thumbnail desktop shows in file browsers', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: /^Export$/ }).click();
  const wait = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export OpenRocket (.ork)' }).click();
  const dl = await wait;

  const { readFile } = await import('node:fs/promises');
  const { unzipSync } = await import('fflate');
  const archive = unzipSync(new Uint8Array(await readFile(await dl.path())));
  expect(Object.keys(archive).slice(0, 3)).toEqual(['rocket.ork', 'preview.png', 'thumbnail.png']);

  const thumbnail = archive['thumbnail.png']!;
  expect(pngSize(thumbnail)).toEqual({ width: 1024, height: 1024 });
  expect(pngSize(archive['preview.png']!).width).toBe(1000);

  // White corners, and a rocket across the middle: not a blank or black frame.
  const { corner, drawn } = await page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let drawn = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i]! + data[i + 1]! + data[i + 2]! < 700) drawn++;
      return { corner: [...data.slice(0, 3)], drawn: drawn / (data.length / 4) };
    },
    [...thumbnail],
  );
  expect(corner).toEqual([255, 255, 255]);
  expect(drawn).toBeGreaterThan(0.01);
});
