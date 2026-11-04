// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildThreeMf, threeMfModelXml } from '../../../src/services/exports/threeMf';
import { makeWatertight, solidForNode } from '../../../src/services/exports/solidMesh';
import { printableParts } from '../../../src/services/exports/printableParts';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';

const nose = (): THREE_GEOMETRY =>
  makeWatertight(
    solidForNode({ type: 'nosecone', id: 'n', length: 0.1, aftRadius: 0.0124, thickness: 0.0015, shape: 'ogive' })!,
  );
type THREE_GEOMETRY = ReturnType<typeof makeWatertight>;

const parts = [
  { name: 'Nose cone', geometry: nose(), color: '#b9c2cc' },
  { name: 'Second part', geometry: nose() },
];

const archive = unzipSync(buildThreeMf(parts));
const model = strFromU8(archive['3D/3dmodel.model']!);
const doc = new DOMParser().parseFromString(model, 'text/xml');

describe('buildThreeMf', () => {
  it('writes the three members an OPC package needs', () => {
    expect(Object.keys(archive).sort()).toEqual(['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels']);
    expect(strFromU8(archive['[Content_Types].xml']!)).toContain('3dmanufacturing-3dmodel+xml');
    expect(strFromU8(archive['_rels/.rels']!)).toContain('/3D/3dmodel.model');
  });

  it('produces a model that parses, in millimeters', () => {
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.getAttribute('unit')).toBe('millimeter');
  });

  it('gives every part its own named object and build item', () => {
    const objects = Array.from(doc.querySelectorAll('object'));
    expect(objects.map((o) => o.getAttribute('name'))).toEqual(['Nose cone', 'Second part']);
    expect(doc.querySelectorAll('build > item')).toHaveLength(2);

    const ids = objects.map((o) => o.getAttribute('id'));
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of Array.from(doc.querySelectorAll('build > item'))) {
      expect(ids).toContain(item.getAttribute('objectid'));
    }
  });

  it('keeps every triangle index inside its own vertex list', () => {
    for (const obj of Array.from(doc.querySelectorAll('object'))) {
      const count = obj.querySelectorAll('vertices > vertex').length;
      expect(count).toBeGreaterThan(3);
      for (const tri of Array.from(obj.querySelectorAll('triangles > triangle'))) {
        for (const a of ['v1', 'v2', 'v3']) {
          const v = Number(tri.getAttribute(a));
          expect(Number.isInteger(v) && v >= 0 && v < count, `${a}=${v} of ${count}`).toBe(true);
        }
      }
    }
  });

  it('converts meters to millimeters', () => {
    const xs = Array.from(doc.querySelectorAll('object vertices > vertex')).map((v) => Number(v.getAttribute('x')));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 3);
  });

  it('carries the part color, and falls back to neutral', () => {
    const bases = Array.from(doc.querySelectorAll('basematerials > base'));
    expect(bases[0]!.getAttribute('displaycolor')).toBe('#B9C2CCFF');
    expect(bases[1]!.getAttribute('displaycolor')).toBe('#CFCABFFF');
  });

  it('drops each part onto the plate when asked, and not when not', () => {
    const transformOf = (xml: string): number[] =>
      xml
        .match(/transform="([^"]+)"/)![1]!
        .split(' ')
        .map(Number);
    const placed = transformOf(threeMfModelXml(parts, { placeOnPlate: true }));
    expect(placed.slice(9).some((v) => v !== 0)).toBe(true);
    expect(transformOf(threeMfModelXml(parts, { placeOnPlate: false })).slice(9)).toEqual([0, 0, 0]);
  });

  it('refuses to write an empty package', () => {
    expect(() => buildThreeMf([])).toThrow(/nothing to export/i);
  });
});

describe('printableParts', () => {
  const tree: RocketTree = {
    name: 'Printable',
    components: [
      {
        type: 'stage',
        id: 's',
        children: [
          { type: 'nosecone', id: 'n', name: 'Nose' },
          {
            type: 'bodytube',
            id: 'b',
            name: 'Body',
            children: [
              { type: 'trapezoidfinset', id: 'f', name: 'Fins' },
              { type: 'parachute', id: 'p', name: 'Chute' },
              { type: 'masscomponent', id: 'm', name: 'Altimeter' },
              { type: 'centeringring', id: 'r', name: 'Ring' },
            ],
          },
        ],
      } as ComponentNode,
    ],
  };

  it('lists what has a solid and leaves out what does not', () => {
    const names = printableParts(tree).map((p) => p.name);
    expect(names).toEqual(['Nose', 'Body', 'Fins', 'Ring']);
    expect(names).not.toContain('Chute');
    expect(names).not.toContain('Altimeter');
  });

  it('indents a part under the printable part it sits inside', () => {
    const byName = Object.fromEntries(printableParts(tree).map((p) => [p.name, p.depth]));
    expect(byName['Nose']).toBe(0);
    expect(byName['Body']).toBe(0);
    expect(byName['Fins']).toBe(1);
  });
});
