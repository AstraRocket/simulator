// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { finiteNum } from '../../../src/services/files/ork/numbers';
import { numTag } from '../../../src/services/files/ork/importTags';
import { takeDocumentMaterials } from '../../../src/services/files/ork/docMaterials';

describe('finiteNum', () => {
  it.each([
    ['0.012', 0.012],
    [' -3.5e-2 ', -0.035],
    ['+7', 7],
    ['.5', 0.5],
  ])('reads %j as Java parseDouble does', (raw, v) => {
    expect(finiteNum(raw)).toBe(v);
  });

  it.each(['', '  ', '0x10', '0b1', '0o7', 'Infinity', 'NaN', '1 2', null, undefined])(
    'refuses %j, which Java parseDouble refuses or reads as not finite',
    (raw) => {
      expect(finiteNum(raw)).toBeUndefined();
    },
  );
});

const xml = (body: string) => new DOMParser().parseFromString(body, 'application/xml').documentElement;

describe('numTag', () => {
  it.each([
    ['0.012', 0.012],
    ['auto 0.012', 0.012],
    ['-3.5e-2', -0.035],
  ])('reads %j as Java parseDouble does', (raw, v) => {
    expect(numTag(xml(`<part><length>${raw}</length></part>`), 'length', -1)).toBe(v);
  });

  it.each(['0x10', '0b1', '0o7', 'auto 0x10', 'Infinity'])('falls back on %j, which parseDouble refuses', (raw) => {
    expect(numTag(xml(`<part><length>${raw}</length></part>`), 'length', -1)).toBe(-1);
  });
});

describe("a document's stored materials", () => {
  const read = (...stored: string[]) =>
    takeDocumentMaterials(
      xml(
        `<openrocket><docprefs><docmaterials>${stored.map((s) => `<material>${s}</material>`).join('')}</docmaterials></docprefs></openrocket>`,
      ),
    );

  it('refuses a density parseDouble refuses (Material.fromStorableString)', () => {
    expect(read('BULK|Hex|0x10|0|Other')).toEqual({ materials: [], skipped: 1 });
  });

  it('reads a fourth piece parseDouble refuses as the group, not as a shear modulus', () => {
    const { materials } = read('BULK|Odd|500|0x10');
    expect(materials[0]?.shearModulus).toBeUndefined();
    expect(materials[0]?.group).toBe('0x10');
  });
});
