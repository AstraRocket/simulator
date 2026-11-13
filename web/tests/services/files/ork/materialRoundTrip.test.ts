// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { exportOrk } from '../../../../src/services/files/orkExport';
import { importOrk } from '../../../../src/services/files/orkImport';
import { defaultNode, hasMaterial } from '../../../../src/services/design/treeEdit';
import { readData } from '../../../testing/dataDir';
import type { MaterialRow } from '../../../../src/services/materials/materialTypes';
import type { ComponentNode, ComponentType, RocketTree } from '../../../../src/engine/openRocketEngine';

const CATALOG = readData<MaterialRow[]>('materials.generated.json');
const ADHESIVE_MATERIALS = CATALOG.filter((m) => m.kind === 'adhesive');
const CORRECTED_MATERIALS = CATALOG.filter((m) => m.kind === 'corrected');

const node = (o: object) => o as unknown as ComponentNode;

const BULK_TYPES: ComponentType[] = (
  [
    'nosecone',
    'bodytube',
    'transition',
    'fairing',
    'trapezoidfinset',
    'ellipticalfinset',
    'freeformfinset',
    'tubefinset',
    'innertube',
    'tubecoupler',
    'centeringring',
    'bulkhead',
    'engineblock',
    'launchlug',
    'railbutton',
  ] as ComponentType[]
).filter(hasMaterial);

const CHAIN = new Set(['nosecone', 'bodytube', 'transition']);

const findByName = (tree: RocketTree, name: string): ComponentNode | undefined => {
  const all: ComponentNode[] = [];
  (function collect(ns: ComponentNode[]) {
    for (const n of ns) {
      all.push(n);
      collect(n.children ?? []);
    }
  })(tree.components);
  return all.find((n) => n.name === name);
};

const roundTrip = (tree: RocketTree): RocketTree => importOrk(exportOrk({ name: 'RT', tree })).tree;

describe('a material the editor offers survives a .ork round trip', () => {
  it.each(BULK_TYPES)('%s keeps its bulk material name and density', (type) => {
    const part = defaultNode(type) as unknown as Record<string, unknown>;
    part.id = 'probe';
    part.name = 'Probe';
    part.materialName = 'Epoxy - RocketPoxy G5000';
    part.density = 1500;

    const host = node({ type: 'bodytube', id: 'host', name: 'Host', length: 0.3, outerRadius: 0.013 });
    const inStage = CHAIN.has(type) ? [part as unknown as ComponentNode] : [host];
    if (!CHAIN.has(type)) (host as unknown as Record<string, unknown>).children = [part];

    const tree = {
      name: 'RT',
      components: [node({ type: 'stage', id: 's', name: 'S', children: inStage })],
    } as unknown as RocketTree;

    const back = findByName(roundTrip(tree), 'Probe') as unknown as Record<string, unknown> | undefined;
    expect(back?.materialName, `${type} lost its material name`).toBe('Epoxy - RocketPoxy G5000');
    expect(back?.density, `${type} lost its density`).toBe(1500);
  });

  it('a fin set keeps its FILLET material, which is a second material on one part', () => {
    const tree = {
      name: 'RT',
      components: [
        node({
          type: 'stage',
          id: 's',
          name: 'S',
          children: [
            node({
              type: 'bodytube',
              id: 'b',
              name: 'B',
              length: 0.3,
              outerRadius: 0.013,
              children: [
                node({
                  type: 'trapezoidfinset',
                  id: 'f',
                  name: 'Probe',
                  finCount: 3,
                  rootChord: 0.06,
                  height: 0.05,
                  thickness: 0.003,
                  materialName: 'Plywood (birch)',
                  density: 630,
                  filletRadius: 0.005,
                  filletMaterialName: 'Epoxy - West System 105/205 Fast',
                  filletDensity: 1180,
                  filletMaterialGroup: 'Adhesives',
                  filletShearModulus: 1.5e9,
                }),
              ],
            }),
          ],
        }),
      ],
    } as unknown as RocketTree;

    const back = findByName(roundTrip(tree), 'Probe') as unknown as Record<string, unknown>;
    expect(back['materialName']).toBe('Plywood (birch)');
    expect(back['density']).toBe(630);
    expect(back['filletMaterialName']).toBe('Epoxy - West System 105/205 Fast');
    expect(back['filletDensity']).toBe(1180);
    expect(back['filletShearModulus']).toBe(1.5e9);
  });

  it.each([
    ['parachute', { diameter: 0.3, cd: 0.8, lineCount: 6, lineLength: 0.3 }],
    ['streamer', { stripLength: 0.4, stripWidth: 0.05, cd: 0.6 }],
  ])('%s keeps its surface material', (type, extra) => {
    const tree = {
      name: 'RT',
      components: [
        node({
          type: 'stage',
          id: 's',
          name: 'S',
          children: [
            node({
              type: 'bodytube',
              id: 'b',
              name: 'B',
              length: 0.3,
              outerRadius: 0.013,
              children: [
                node({
                  type,
                  id: 'r',
                  name: 'Probe',
                  ...extra,
                  surfaceMaterialName: 'My own silk',
                  surfaceDensity: 0.041,
                }),
              ],
            }),
          ],
        }),
      ],
    } as unknown as RocketTree;

    const back = findByName(roundTrip(tree), 'Probe') as unknown as Record<string, unknown>;
    expect(back['surfaceMaterialName']).toBe('My own silk');
    expect(back['surfaceDensity']).toBe(0.041);
  });

  it.each([
    ['parachute', { diameter: 0.3, cd: 0.8, lineCount: 6, lineLength: 0.3 }],
    ['shockcord', { cordLength: 3 }],
  ])('%s keeps its line material, including one of ours', (type, extra) => {
    const corrected = CORRECTED_MATERIALS[0]!;
    const tree = {
      name: 'RT',
      components: [
        node({
          type: 'stage',
          id: 's',
          name: 'S',
          children: [
            node({
              type: 'bodytube',
              id: 'b',
              name: 'B',
              length: 0.3,
              outerRadius: 0.013,
              children: [
                node({
                  type,
                  id: 'l',
                  name: 'Probe',
                  ...extra,
                  lineMaterialName: corrected.name,
                  lineDensity: corrected.density,
                }),
              ],
            }),
          ],
        }),
      ],
    } as unknown as RocketTree;

    const back = findByName(roundTrip(tree), 'Probe') as unknown as Record<string, unknown>;
    expect(back['lineMaterialName']).toBe(corrected.name);
    expect(back['lineDensity']).toBe(corrected.density);
  });

  it('writes the name into the file, not just into the tree it reads back', () => {
    // Round trips would pass with a private tag desktop cannot read, so check the XML.
    const adhesive = ADHESIVE_MATERIALS[0]!;
    const tree = {
      name: 'RT',
      components: [
        node({
          type: 'stage',
          id: 's',
          name: 'S',
          children: [
            node({
              type: 'bodytube',
              id: 'b',
              name: 'B',
              length: 0.3,
              outerRadius: 0.013,
              materialName: adhesive.name,
              density: adhesive.density,
              materialGroup: 'Adhesives',
            }),
          ],
        }),
      ],
    } as unknown as RocketTree;

    const xml = exportOrk({ name: 'RT', tree });
    // No group: desktop has no adhesives group and warns on an unknown one.
    expect(xml).toContain(`<material type="bulk" density="${adhesive.density}">${adhesive.name}</material>`);
  });

  // Desktop spells "Paper" as `PaperProducts` (`MaterialGroup.getDatabaseString`).
  it("writes a group in desktop's own words", () => {
    const tree = {
      name: 'RT',
      components: [
        node({
          type: 'stage',
          id: 's',
          name: 'S',
          children: [
            node({
              type: 'bodytube',
              id: 'b',
              name: 'B',
              length: 0.3,
              outerRadius: 0.013,
              materialName: 'Kraft phenolic',
              density: 950,
              materialGroup: 'Paper',
            }),
          ],
        }),
      ],
    } as unknown as RocketTree;
    expect(exportOrk({ name: 'RT', tree })).toContain(
      '<material type="bulk" density="950" group="PaperProducts">Kraft phenolic</material>',
    );
  });
});
