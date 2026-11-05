import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readData, DATA_DIR } from '../../testing/dataDir';
import { isMaterialCatalog, type MaterialRow } from '../../../src/services/materials/materialTypes';
const CATALOG = readData<MaterialRow[]>('materials.generated.json');
const APP = (
  JSON.parse(readFileSync(join(DATA_DIR, '..', '..', 'scripts', 'data', 'materials.app.json'), 'utf8')) as {
    materials: (MaterialRow & { source?: string; note?: string; corrects?: string })[];
  }
).materials;

const of = (kind: string) => CATALOG.filter((m) => m.kind === kind);
const UPSTREAM = of('upstream');
const ADHESIVES = of('adhesive');
const CORRECTED = of('corrected');

describe('the catalog the app fetches', () => {
  it('passes the shape guard the fetch applies to it', () => {
    expect(isMaterialCatalog(CATALOG)).toBe(true);
  });

  it('is exactly its two inputs, and nothing else', () => {
    expect(UPSTREAM.length + ADHESIVES.length + CORRECTED.length).toBe(CATALOG.length);
    expect(ADHESIVES.length + CORRECTED.length).toBe(APP.length);
  });

  it('has no duplicate name within a material type', () => {
    const keys = CATALOG.map((m) => `${m.type}\u0000${m.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ships no maintainer-only field', () => {
    for (const m of CATALOG) expect(Object.keys(m).sort()).toEqual(['density', 'group', 'kind', 'name', 'type']);
  });
});
describe('adhesive materials', () => {
  it('is every adhesive in the table', () => {
    expect(CATALOG.filter((m) => m.group === 'Adhesives')).toEqual(ADHESIVES);
  });

  it('is all bulk, since a fillet has volume', () => {
    // A kg/m^2 or kg/m value read as a density is silently off by orders of magnitude.
    for (const m of ADHESIVES) expect(m.type).toBe('bulk');
  });

  it('gives every entry a plausible cured density', () => {
    for (const m of ADHESIVES) {
      expect(m.density, m.name).toBeGreaterThan(900);
      expect(m.density, m.name).toBeLessThan(2500);
    }
  });
});
describe('upstream material counts', () => {
  const countOf = (type: string) => UPSTREAM.filter((m) => m.type === type).length;

  it('carries all 42 of upstream line materials', () => {
    expect(countOf('line')).toBe(42);
  });

  it('carries all 32 bulk and 8 surface materials', () => {
    expect(countOf('bulk')).toBe(32);
    expect(countOf('surface')).toBe(8);
  });
});

// Upstream's 19 and 25 mm elastic cords dropped a digit; kept so saved designs read back the same.
describe('corrected materials', () => {
  it("keeps upstream's wrong elastic cords, wrong", () => {
    expect(CATALOG.find((m) => m.name === 'Elastic cord (flat 19 mm, 3/4 in)')?.density).toBe(0.0012);
  });

  it('offers a corrected one that is heavier than the narrower cord', () => {
    const twelve = CATALOG.find((m) => m.name === 'Elastic cord (flat 12 mm, 1/2 in)')!;
    for (const m of CORRECTED) expect(m.density).toBeGreaterThan(twelve.density);
  });

  it('is line material', () => {
    for (const m of CORRECTED) expect(m.type).toBe('line');
  });
});

describe('the app material file', () => {
  it('cites a source and a note for every entry', () => {
    for (const r of APP) {
      expect(r.source, `${r.name} has no source`).toBeTruthy();
      expect(r.note, `${r.name} has no note`).toBeTruthy();
    }
  });

  it('names the upstream entry each correction replaces, and that entry exists', () => {
    for (const r of APP.filter((x) => x.kind === 'corrected')) {
      expect(r.corrects, `${r.name} does not say what it corrects`).toBeTruthy();
      expect(UPSTREAM.some((m) => m.name === r.corrects)).toBe(true);
    }
  });

  it('uses only kinds the sync script knows', () => {
    for (const r of APP) expect(['adhesive', 'corrected']).toContain(r.kind);
  });

  it('reaches the catalog entry for entry', () => {
    for (const r of APP) {
      expect(CATALOG, r.name).toContainEqual({
        name: r.name,
        type: r.type,
        density: r.density,
        group: r.group,
        kind: r.kind,
      });
    }
  });
});
