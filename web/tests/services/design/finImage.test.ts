import { describe, expect, it } from 'vitest';
import { FinImageError, finPointsCsv, finPointsFromImage, type Pixels } from '../../../src/services/design/finImage';

// One pixel is one millimeter, upstream's fixed scale.

const image = (rows: string[]): Pixels => {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const v = row[x] === '#' ? 0 : 255;
      const p = (y * width + x) * 4;
      data[p] = v;
      data[p + 1] = v;
      data[p + 2] = v;
      data[p + 3] = 255;
    }
  });
  return { width, height, data };
};

const scaled = (rows: string[], k: number): string[] =>
  rows.flatMap((row) => {
    const wide = [...row].flatMap((c) => Array<string>(k).fill(c)).join('');
    return Array<string>(k).fill(wide);
  });

const mm = (v: number) => Math.round(v * 1000);

describe('tracing a fin from an image', () => {
  const triangle1 = [
    '#.........',
    '##........',
    '###.......',
    '####......',
    '#####.....',
    '######....',
    '#######...',
    '########..',
    '#########.',
    '##########',
  ];
  const triangle = scaled(triangle1, 4);

  it('collapses a straight traced edge to its two ends', () => {
    const points = finPointsFromImage(image(scaled(['##########', '##########', '##########', '##########'], 4)));
    expect(points.length).toBeLessThan(8);
  });

  it('collapses a staircase whose steps are inside the flatness tolerance', () => {
    const points = finPointsFromImage(image(triangle1));
    expect(points.length).toBeLessThan(8);
  });

  it('keeps a staircase whose steps are coarser than the tolerance', () => {
    // Upstream's tolerance is a fixed 0.8 mm, so survival depends on image size.
    expect(finPointsFromImage(image(triangle)).length).toBeGreaterThan(8);
  });

  it('puts the root on y = 0 and measures from the leading root corner', () => {
    const points = finPointsFromImage(image(triangle));
    expect(points[0]).toEqual([0, 0]);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(mm(x)).toBeLessThanOrEqual(40);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(mm(y)).toBeLessThanOrEqual(40);
    }
  });

  it('reaches the top of the shape and the far end of the root', () => {
    const points = finPointsFromImage(image(triangle));
    expect(mm(Math.max(...points.map((p) => p[1])))).toBeGreaterThanOrEqual(36);
    expect(mm(Math.max(...points.map((p) => p[0])))).toBeGreaterThanOrEqual(36);
  });

  it('measures x from the fin, not from the left of the image', () => {
    const inset = triangle.map((row) => '.'.repeat(20) + row);
    const points = finPointsFromImage(image(inset));
    expect(points[0]).toEqual([0, 0]);
    expect(mm(Math.max(...points.map((p) => p[0])))).toBeGreaterThanOrEqual(36);
  });

  it('reads a color image by its brightness, as the desktop does', () => {
    const rows = scaled(['#...', '##..', '###.', '####'], 4);
    const gray = image(rows);
    const color = image(rows);
    for (let i = 0; i < color.data.length; i += 4) {
      const dark = color.data[i] === 0;
      color.data[i] = dark ? 20 : 240;
      color.data[i + 1] = dark ? 40 : 245;
      color.data[i + 2] = dark ? 160 : 250;
    }
    expect(finPointsFromImage(color)).toEqual(finPointsFromImage(gray));
  });

  it('refuses an image whose fin does not touch the bottom edge', () => {
    const floating = [...scaled(['#.', '##'], 4), '........', '........'];
    expect(() => finPointsFromImage(image(floating))).toThrow(FinImageError);
    try {
      finPointsFromImage(image(floating));
    } catch (e) {
      expect((e as FinImageError).reason).toBe('notTouchingBottom');
    }
  });

  it('refuses a blank image', () => {
    expect(() => finPointsFromImage(image(['....', '....']))).toThrow(FinImageError);
  });

  it('refuses an empty image rather than reading past the end of it', () => {
    expect(() => finPointsFromImage({ width: 0, height: 0, data: new Uint8ClampedArray() })).toThrow(FinImageError);
  });

  it('terminates on a shape that fills the whole frame', () => {
    const points = finPointsFromImage(image(scaled(['####', '####', '####', '####'], 3)));
    expect(points.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the exported point table', () => {
  const points: [number, number][] = [
    [0, 0],
    [0.02, 0.05],
    [0.06, 0],
  ];

  it('names the unit in the header and writes the points in it', () => {
    const csv = finPointsCsv(points, 'cm', (m) => m * 100);
    expect(csv.split('\r\n')[0]).toBe('X / cm, Y / cm, ');
    expect(csv.split('\r\n')[1]).toBe('0, 0, ');
    expect(csv.split('\r\n')[2]).toBe('2, 5, ');
  });

  it('keeps the desktop file shape: CRLF, and a trailing separator per line', () => {
    const csv = finPointsCsv(points, 'mm', (m) => m * 1000);
    expect(csv.endsWith('\r\n')).toBe(true);
    for (const line of csv.split('\r\n').filter(Boolean)) expect(line.endsWith(', ')).toBe(true);
  });

  it('writes a header and nothing else for a fin with no points', () => {
    expect(finPointsCsv([], 'cm', (m) => m * 100)).toBe('X / cm, Y / cm, \r\n');
  });
});
