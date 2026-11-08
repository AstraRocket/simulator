import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error - a plain .mjs build script helper, no types
import { rowCount, writeDataManifest } from '../../scripts/lib/dataManifest.mjs';

let dir: string;
const read = () => readFileSync(join(dir, 'manifest.json'), 'utf8');
const motors = (rows: unknown[]) => writeFileSync(join(dir, 'motors.generated.json'), JSON.stringify(rows));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'manifest-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('writeDataManifest', () => {
  it('dates a catalog it has not seen, and counts its rows', () => {
    motors([{ a: 1 }, { a: 2 }]);
    const m = writeDataManifest(dir, { today: '2026-10-01' });
    expect(m.catalogs.motors).toEqual({ updated: '2026-10-01', count: 2 });
  });

  it('keeps the date and the bytes while the catalog is unchanged', () => {
    motors([{ a: 1 }]);
    writeDataManifest(dir, { today: '2026-10-01' });
    const before = read();
    writeDataManifest(dir, { today: '2026-10-08' });
    expect(read()).toBe(before);
  });

  it('moves the date when the catalog changes', () => {
    motors([{ a: 1 }]);
    writeDataManifest(dir, { today: '2026-10-01' });
    motors([{ a: 1 }, { a: 3 }]);
    const m = writeDataManifest(dir, { today: '2026-10-08' });
    expect(m.catalogs.motors).toEqual({ updated: '2026-10-08', count: 2 });
  });

  it('counts the one array a wrapped catalog holds', () => {
    writeFileSync(
      join(dir, 'components.generated.json'),
      JSON.stringify({ generated: 'x', count: 3, components: [1, 2, 3] }),
    );
    expect(writeDataManifest(dir, { today: '2026-10-01' }).catalogs.components.count).toBe(3);
  });

  it('keeps every hash a string, as the app reads them', () => {
    motors([{ a: 1 }]);
    const m = writeDataManifest(dir, { today: '2026-10-01' });
    expect(typeof m.motors).toBe('string');
    expect(
      Object.entries(m)
        .filter(([, v]) => typeof v !== 'string')
        .map(([k]) => k),
    ).toEqual(['catalogs']);
  });
});

describe('rowCount', () => {
  it('counts the array a catalog is', () => {
    expect(rowCount([{}, {}, {}])).toBe(3);
  });

  it('counts the one array a catalog wraps, not its keys', () => {
    expect(rowCount({ generated: 'x', count: 2, components: [{}, {}] })).toBe(2);
    expect(rowCount({ generated: 'x', count: 0, components: [] })).toBe(0);
  });
});
