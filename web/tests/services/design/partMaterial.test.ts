// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportOrk } from '../../../src/services/files/orkExport';
import {
  FILLET_MATERIAL_KEYS,
  MATERIAL_KEYS,
  kernelPartMaterial,
  statedMaterial,
} from '../../../src/services/design/materialSlots';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';

/**
 * The material a part flies, as every writer names it: the `.ork`, `.rkt` and
 * Onshape writers each decided it on their own, and disagreed on an empty name
 * (`custom`, an empty string, or an empty `<filletmaterial>` that desktop
 * refuses as an "Illegal material specification").
 */
const node = (o: Record<string, unknown>) => o as unknown as ComponentNode;

describe('statedMaterial', () => {
  it('names a material with no name, or a blank one, custom', () => {
    expect(statedMaterial(node({ density: 680, materialName: '' }), MATERIAL_KEYS.bulk, true)?.name).toBe('custom');
    expect(statedMaterial(node({ density: 680, materialName: '  ' }), MATERIAL_KEYS.bulk, true)?.name).toBe('custom');
    expect(statedMaterial(node({ density: 680 }), MATERIAL_KEYS.bulk, true)?.name).toBe('custom');
    expect(statedMaterial(node({ density: 680, materialName: 'Kraft' }), MATERIAL_KEYS.bulk, true)?.name).toBe('Kraft');
  });

  it('takes a bulk material only from a positive density, a surface one from any finite one', () => {
    expect(statedMaterial(node({ density: 0 }), MATERIAL_KEYS.bulk, true)).toBeNull();
    expect(statedMaterial(node({ surfaceDensity: 0 }), MATERIAL_KEYS.surface, false)?.density).toBe(0);
    expect(statedMaterial(node({ surfaceDensity: Number.NaN }), MATERIAL_KEYS.surface, false)).toBeNull();
  });

  it('knows the rail button is Delrin when it states none', () => {
    expect(kernelPartMaterial('railbutton', 'bulk')?.name).toMatch(/Delrin/);
    expect(kernelPartMaterial('bodytube', 'bulk')).toBeUndefined();
  });
});

describe('the .ork fillet material', () => {
  it('names a fillet with an empty material name custom, which desktop opens', () => {
    const tree = {
      name: 'R',
      components: [
        {
          type: 'stage',
          id: 's',
          children: [
            {
              type: 'bodytube',
              id: 't',
              length: 0.3,
              outerRadius: 0.025,
              children: [
                { type: 'trapezoidfinset', id: 'f', filletRadius: 0.002, filletDensity: 1200, filletMaterialName: '' },
              ],
            },
          ],
        },
      ],
    } as unknown as RocketTree;
    const xml = exportOrk({ name: 'R', tree });
    expect(xml).toContain('<filletmaterial type="bulk" density="1200">custom</filletmaterial>');
    expect(xml).not.toMatch(/<filletmaterial[^>]*><\/filletmaterial>/);
    expect(FILLET_MATERIAL_KEYS.density).toBe('filletDensity');
  });
});
