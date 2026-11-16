// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { defaultMaterialKey, defaultMaterialPatch } from '../../../src/services/design/materialSlots';
import { KERNEL_MATERIALS } from '../../../src/tree/kernelDefaults';
import { addPart } from '../../../src/services/design/treeEdit';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../../../src/services/storage/settings';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';

const PLY = { name: 'Plywood (birch)', density: 630 };
const KEVLAR = { name: 'Kevlar 12-strand (3.2 mm, 1/8 in)', density: 0.00967306 };

describe('defaultMaterialPatch', () => {
  it('falls back to the material the kernel would weigh the part with', () => {
    // Not empty: `ComponentFactory` keeps the constructor's material, so an unset part flies as cardboard.
    expect(defaultMaterialPatch('bodytube', {})).toEqual({
      materialName: KERNEL_MATERIALS.bulk.name,
      density: KERNEL_MATERIALS.bulk.density,
      materialGroup: KERNEL_MATERIALS.bulk.group,
      shearModulus: KERNEL_MATERIALS.bulk.shearModulus,
    });
  });

  it('fills both slots of a recovery device', () => {
    expect(defaultMaterialPatch('parachute', {})).toEqual({
      surfaceMaterialName: KERNEL_MATERIALS.surface.name,
      surfaceDensity: KERNEL_MATERIALS.surface.density,
      lineMaterialName: KERNEL_MATERIALS.line.name,
      lineDensity: KERNEL_MATERIALS.line.density,
    });
  });

  it('gives a part with no material slot nothing at all', () => {
    for (const type of ['stage', 'podset', 'parallelstage', 'masscomponent']) {
      expect(defaultMaterialPatch(type, {}), type).toEqual({});
    }
  });

  it('maps a bulk default onto the keys a part carries its material in', () => {
    const patch = defaultMaterialPatch('trapezoidfinset', { 'trapezoidfinset:bulk': PLY });
    expect(patch).toEqual({ materialName: 'Plywood (birch)', density: 630 });
  });

  it('carries the catalog group stored with a bulk default', () => {
    const patch = defaultMaterialPatch('trapezoidfinset', { 'trapezoidfinset:bulk': { ...PLY, group: 'Woods' } });
    expect(patch).toEqual({ materialName: 'Plywood (birch)', density: 630, materialGroup: 'Woods' });
  });

  it('carries the shear modulus stored with a bulk default', () => {
    const patch = defaultMaterialPatch('trapezoidfinset', { 'trapezoidfinset:bulk': { ...PLY, shearModulus: 0.6e9 } });
    expect(patch).toEqual({ materialName: 'Plywood (birch)', density: 630, shearModulus: 0.6e9 });
  });

  it('maps surface and line onto their own keys, on one part', () => {
    const patch = defaultMaterialPatch('parachute', {
      'parachute:surface': { name: 'Silk', density: 0.06 },
      'parachute:line': KEVLAR,
    });
    expect(patch).toEqual({
      surfaceMaterialName: 'Silk',
      surfaceDensity: 0.06,
      lineMaterialName: KEVLAR.name,
      lineDensity: KEVLAR.density,
    });
  });

  it('takes only the entry for THIS part type', () => {
    const patch = defaultMaterialPatch('bodytube', {
      'trapezoidfinset:bulk': PLY,
      'bodytube:bulk': { name: 'Blue tube', density: 1300 },
    });
    expect(patch).toEqual({ materialName: 'Blue tube', density: 1300 });
  });

  it('builds the key the settings map is keyed by', () => {
    expect(defaultMaterialKey('parachute', 'line')).toBe('parachute:line');
  });
});

describe('a new part is seeded with it', () => {
  const stage = { type: 'stage', id: 's', name: 'S', children: [] } as unknown as ComponentNode;
  const tree = { name: 'T', components: [stage] } as unknown as RocketTree;

  it('carries the material outright, so the panel and the .ork both see it', () => {
    const seed = defaultMaterialPatch('bodytube', { 'bodytube:bulk': { name: 'Blue tube', density: 1300 } });
    const { tree: next, id } = addPart(tree, 'bodytube', null, seed as Partial<ComponentNode>);
    const added = next.components[0]!.children!.find((n) => n.id === id) as unknown as Record<string, unknown>;
    expect(added['materialName']).toBe('Blue tube');
    expect(added['density']).toBe(1300);
  });

  it('carries the kernel material when there is no preference', () => {
    const seed = defaultMaterialPatch('bodytube', {});
    const { tree: next, id } = addPart(tree, 'bodytube', null, seed as Partial<ComponentNode>);
    const added = next.components[0]!.children!.find((n) => n.id === id) as unknown as Record<string, unknown>;
    expect(added['materialName']).toBe(KERNEL_MATERIALS.bulk.name);
    expect(added['density']).toBe(KERNEL_MATERIALS.bulk.density);
  });

  it('does not overwrite the dimensions a part is created with', () => {
    const bare = addPart(tree, 'bodytube', null);
    const seeded = addPart(tree, 'bodytube', null, {
      materialName: 'Blue tube',
      density: 1300,
    } as Partial<ComponentNode>);
    const pick = (t: RocketTree) => {
      const n = { ...(t.components[0]!.children![0] as unknown as Record<string, unknown>) };
      delete n['id'];
      delete n['materialName'];
      delete n['density'];
      return n;
    };
    expect(pick(seeded.tree)).toEqual(pick(bare.tree));
  });
});

describe('the stored preference', () => {
  beforeEach(() => localStorage.clear());

  it('survives a save and load', () => {
    saveSettings({ ...DEFAULT_SETTINGS, defaultMaterials: { 'trapezoidfinset:bulk': PLY } });
    expect(loadSettings().defaultMaterials).toEqual({ 'trapezoidfinset:bulk': PLY });
  });

  it('keeps a stored group, and drops one that is blank or not a string', () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      defaultMaterials: {
        'trapezoidfinset:bulk': { ...PLY, group: 'Woods' },
        'bodytube:bulk': { ...PLY, group: 7 },
        'nosecone:bulk': { ...PLY, group: ' ' },
      } as unknown as Record<string, { name: string; density: number }>,
    });
    expect(loadSettings().defaultMaterials).toEqual({
      'trapezoidfinset:bulk': { ...PLY, group: 'Woods' },
      'bodytube:bulk': PLY,
      'nosecone:bulk': PLY,
    });
  });

  it('drops anything that would reach the kernel as a bad mass', () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      defaultMaterials: {
        'bodytube:bulk': PLY,
        'bodytube:bogus': PLY,
        'bodytube:bulk:extra': PLY,
        bad: PLY,
        'nosecone:bulk': { name: 'X', density: -1 },
        'transition:bulk': { name: '', density: 500 },
        'innertube:bulk': { name: 'Y', density: Number.NaN },
        'bulkhead:bulk': { name: 'Z', density: '900' },
      } as unknown as Record<string, { name: string; density: number }>,
    });
    expect(loadSettings().defaultMaterials).toEqual({ 'bodytube:bulk': PLY });
  });
});
