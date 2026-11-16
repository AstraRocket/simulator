import { describe, it, expect } from 'vitest';
import type { ComponentNode } from '../../../src/engine/openRocketEngine';
import { FILLET_MATERIAL_KEYS, kernelPartMaterial, resolvedMaterial } from '../../../src/services/design/materialSlots';
import { KERNEL_MATERIALS } from '../../../src/tree/kernelDefaults';

const node = (o: Record<string, unknown>) => o as unknown as ComponentNode;

describe('resolvedMaterial', () => {
  it('takes the stated material, with its group and shear modulus', () => {
    const m = resolvedMaterial(
      node({
        type: 'bodytube',
        materialName: 'Fiberglass',
        density: 1850,
        materialGroup: 'Composites',
        shearModulus: 3e9,
      }),
      'bulk',
    );
    expect(m).toEqual({ name: 'Fiberglass', density: 1850, group: 'Composites', shearModulus: 3e9, stated: true });
  });

  it("falls back to the part's own kernel default before the kind's", () => {
    expect(resolvedMaterial(node({ type: 'railbutton' }), 'bulk')).toEqual({
      ...kernelPartMaterial('railbutton', 'bulk'),
      stated: false,
    });
    expect(resolvedMaterial(node({ type: 'bodytube' }), 'bulk')).toEqual({ ...KERNEL_MATERIALS.bulk, stated: false });
    expect(resolvedMaterial(node({ type: 'parachute' }), 'surface')).toEqual({
      ...KERNEL_MATERIALS.surface,
      stated: false,
    });
  });

  it('reads a fillet through its own keys and fallback', () => {
    const m = resolvedMaterial(
      node({ type: 'railbutton', filletDensity: 700, filletShearModulus: 1e9 }),
      'bulk',
      FILLET_MATERIAL_KEYS,
      KERNEL_MATERIALS.bulk,
    );
    expect(m).toEqual({ name: 'custom', density: 700, shearModulus: 1e9, stated: true });
  });
});
