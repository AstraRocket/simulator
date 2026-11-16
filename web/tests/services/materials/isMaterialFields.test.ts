import { describe, it, expect } from 'vitest';
import { isMaterialFields, isMaterialCatalog } from '../../../src/services/materials/materialTypes';

const ok = { name: 'Balsa', type: 'bulk', density: 160, group: 'Woods' };

describe('isMaterialFields', () => {
  it('takes a well-formed record, with or without a group', () => {
    expect(isMaterialFields(ok)).toBe(true);
    expect(isMaterialFields({ ...ok, group: undefined })).toBe(true);
  });

  it('refuses a blank name, a density that is not above 0 and a bad shear modulus', () => {
    expect(isMaterialFields({ ...ok, name: '  ' })).toBe(false);
    expect(isMaterialFields({ ...ok, density: 0 })).toBe(false);
    expect(isMaterialFields({ ...ok, density: Number.NaN })).toBe(false);
    expect(isMaterialFields({ ...ok, shearModulus: -1 })).toBe(false);
  });

  it('requires a group in the shipped catalog', () => {
    expect(isMaterialCatalog([ok])).toBe(true);
    expect(isMaterialCatalog([{ ...ok, group: undefined }])).toBe(false);
    expect(isMaterialCatalog([{ ...ok, name: ' ' }])).toBe(false);
  });
});
