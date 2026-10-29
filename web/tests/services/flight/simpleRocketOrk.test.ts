// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { C6 } from '../../../src/engine/api';
import { exportOrk } from '../../../src/services/files/orkExport';
import { importOrk } from '../../../src/services/files/orkImport';
import { simpleRocketTree } from '../../../src/services/flight/simpleRocket';

/**
 * A simple rocket saved and opened again is still pinned to the weighed mass
 * and measured CG as a whole: the stage's overrides keep covering its parts.
 */
describe('a simple rocket through an .ork file', () => {
  it.each([
    ['with a mount tube', 0.018],
    ['at minimum diameter', 0.024],
  ])('keeps its stage overrides over the whole stage, %s', (_, mountDiameterM) => {
    const inputs = { diameterM: 0.0248, lengthM: 0.45, dryMassKg: 0.04, mountDiameterM, cgM: 0.25 };
    const xml = exportOrk({ name: 'Simple', tree: simpleRocketTree(inputs, C6) });
    const stage = importOrk(xml).tree.components[0]!;
    expect(stage).toMatchObject({
      overrideMass: 0.04,
      overrideSubcomponentsMass: true,
      overrideCGX: 0.25,
      overrideSubcomponentsCG: true,
    });
  });
});
