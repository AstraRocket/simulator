// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { __setEngineForTests, type ComponentNode, type RocketTree } from '../../../src/engine/openRocketEngine';
import { buildRocketTree } from '../../../src/engine/api';
import { exportRkt } from '../../../src/services/files/rktExport';
import { importRkt } from '../../../src/services/files/rktImport';
import { stageStacks } from '../../../src/services/files/rocksim/stageStacks';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

beforeAll(async () => {
  /* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
  (globalThis as any).$rt_putStdoutCustom ??= () => {};
  (globalThis as any).$rt_putStderrCustom ??= () => {};
  __setEngineForTests(await import('../../../src/engine/vendor/openrocket-engine.mjs' as string));
  /* eslint-enable @typescript-eslint/no-explicit-any */
});

/**
 * RockSim's stage overrides, through the kernel, as `RockSimStageOverrideExportTest`
 * and `RockSimLoaderTest.testStageMassAndCGOverrides` check them upstream.
 *
 * RockSim flies each stack of stages at the sum of the stage masses and at the
 * stack's CG from the nose tip, and its overrides are all or nothing. So
 * overriding only the booster still writes every stage and every stack, and
 * the file read back flies the same stacks as the design written.
 */

const tube = (id: string, length: number): ComponentNode => ({
  type: 'bodytube',
  id,
  name: id,
  length,
  outerRadius: 0.03,
  thickness: 0.001,
});

const design: RocketTree = {
  name: 'Stacks',
  components: [
    {
      type: 'stage',
      id: 'sustainer',
      name: 'Sustainer',
      children: [{ type: 'nosecone', id: 'nose', name: 'nose', length: 0.2, aftRadius: 0.03 }, tube('upper', 0.6)],
    },
    {
      type: 'stage',
      id: 'booster',
      name: 'Booster',
      overrideMass: 0.3,
      overrideSubcomponentsMass: true,
      overrideCGX: 0.15,
      overrideSubcomponentsCG: true,
      children: [tube('lower', 0.4)],
    },
  ],
};

/** The dry mass and CG of the first `count` stages, from a build with the others removed. */
function stack(tree: RocketTree, count: number): { mass: number; cg: number } {
  const info = buildRocketTree({ ...tree, components: tree.components.slice(0, count) }).staticInfo();
  return { mass: info.massEmpty, cg: info.cgEmpty };
}

describe('RockSim stage overrides through the kernel', () => {
  it("weighs each stage alone and each stack, and puts the build's stages back", () => {
    // Each build frees the one before it, so the stacks are weighed first.
    const top = stack(design, 1);
    const both = stack(design, 2);
    const built = buildRocketTree(design);
    const before = built.staticInfo();
    const figures = stageStacks(built, design, () => false)!;
    expect(figures[0]!.mass).toBeCloseTo(top.mass, 9);
    expect(figures[0]!.stackCg).toBeCloseTo(top.cg, 9);
    expect(figures[1]!.mass).toBeCloseTo(0.3, 9);
    expect(figures[1]!.stackCg).toBeCloseTo(both.cg, 9);
    const after = built.staticInfo();
    expect(after.massEmpty).toBeCloseTo(before.massEmpty, 12);
    expect(after.cgEmpty).toBeCloseTo(before.cgEmpty, 12);
  });

  it('leaves a grounded stage grounded', () => {
    const built = buildRocketTree(design);
    built.setStageActiveById('booster', false);
    const grounded = built.staticInfo().massEmpty;
    stageStacks(built, design, (id) => id === 'booster');
    expect(built.staticInfo().massEmpty).toBeCloseTo(grounded, 12);
  });

  it('reads back as a design that flies the same stacks', () => {
    const figures = stageStacks(buildRocketTree(design), design, () => false);
    const { xml, skipped } = exportRkt('Stacks', design, undefined, figures);
    expect(skipped).toEqual([]);
    expect(xml).toContain('<UseKnownMass>1</UseKnownMass>');
    const back = importRkt(xml).tree;
    for (const count of [1, 2]) {
      const want = stack(design, count);
      const got = stack(back, count);
      expect(got.mass, `mass of ${count}`).toBeCloseTo(want.mass, 6);
      expect(got.cg, `CG of ${count}`).toBeCloseTo(want.cg, 6);
    }
  });
});
