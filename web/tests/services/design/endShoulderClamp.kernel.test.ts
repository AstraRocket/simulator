import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { ComponentNode, RocketTree } from '../../../src/engine/openRocketEngine';
import { updateNode } from '../../../src/services/design/treeEdit';
import { findNode } from '../../../src/tree/treeWalk';
import { loadEngine } from '../../testing/kernelGeometry';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

/* eslint-disable @typescript-eslint/no-explicit-any -- the TeaVM bundle is untyped */
let engine: any;
beforeAll(async () => {
  engine = await loadEngine();
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * An end set narrower than its fixed shoulder cuts the shoulder back to it.
 *
 * Desktop sets the shoulder again through its clamping setter whenever the end
 * radius is set (Transition.java:121 and :232, a nose cone's base being one of
 * the two ends), and that setter holds the shoulder radius to the end and the
 * shoulder wall to the new radius:
 *
 *   shoulderRadius    = min(shoulderRadius, endRadius)        Transition.java:447, :559
 *   shoulderThickness = min(shoulderRadius, shoulderThickness) Transition.java:456, :568
 *
 * The expected values below are that closed form, and the panel's node has to
 * hold what the kernel flies after the build (`getComponentFields`).
 */

const tube = (id: string, outerRadius: number): ComponentNode =>
  ({ type: 'bodytube', id, length: 0.3, outerRadius, thickness: 0.001 }) as ComponentNode;

function design(part: ComponentNode): RocketTree {
  return {
    components: [{ type: 'stage', id: 'st', children: [part, tube('body', 0.025)] } as ComponentNode],
  } as RocketTree;
}

/** What the kernel holds for the part once the edited design is built. */
function kernelFields(tree: RocketTree, id: string): Record<string, number> {
  engine.reset();
  const handle = engine.buildRocket(JSON.stringify(tree));
  const fields = JSON.parse(engine.getComponentFields(handle, id)) as Record<string, number> & { error?: string };
  if (fields.error) throw new Error(fields.error);
  return fields;
}

describe('an end set narrower than its fixed shoulder', () => {
  it("cuts a nose cone's shoulder and its wall back to the new base", () => {
    const nose = {
      type: 'nosecone',
      id: 'nose',
      shape: 'ogive',
      length: 0.1,
      aftRadius: 0.025,
      thickness: 0.002,
      shoulderRadius: 0.024,
      shoulderLength: 0.03,
      shoulderThickness: 0.021,
    } as ComponentNode;
    const edited = updateNode(design(nose), 'nose', { aftRadius: 0.02 });
    const node = findNode(edited.components, 'nose')!;
    const radius = Math.min(0.024, 0.02);
    expect(node['shoulderRadius']).toBeCloseTo(radius, 12);
    expect(node['shoulderThickness']).toBeCloseTo(Math.min(radius, 0.021), 12);
    const kernel = kernelFields(edited, 'nose');
    expect(kernel['shoulderRadius']).toBeCloseTo(node['shoulderRadius'] as number, 9);
    expect(kernel['shoulderThickness']).toBeCloseTo(node['shoulderThickness'] as number, 9);
  });

  it("cuts a transition's aft shoulder, and leaves the fore one standing", () => {
    const transition = {
      type: 'transition',
      id: 'tr',
      shape: 'conical',
      length: 0.06,
      foreRadius: 0.025,
      aftRadius: 0.02,
      thickness: 0.002,
      foreShoulderRadius: 0.023,
      foreShoulderLength: 0.02,
      foreShoulderThickness: 0.002,
      aftShoulderRadius: 0.019,
      aftShoulderLength: 0.02,
      aftShoulderThickness: 0.015,
    } as ComponentNode;
    const tree = {
      components: [
        { type: 'stage', id: 'st', children: [tube('front', 0.025), transition, tube('back', 0.02)] } as ComponentNode,
      ],
    } as RocketTree;
    const edited = updateNode(tree, 'tr', { aftRadius: 0.012 });
    const node = findNode(edited.components, 'tr')!;
    const radius = Math.min(0.019, 0.012);
    expect(node['aftShoulderRadius']).toBeCloseTo(radius, 12);
    expect(node['aftShoulderThickness']).toBeCloseTo(Math.min(radius, 0.015), 12);
    expect(node['foreShoulderRadius']).toBe(0.023);
    const kernel = kernelFields(edited, 'tr');
    for (const key of ['aftShoulderRadius', 'aftShoulderThickness', 'foreShoulderRadius'])
      expect(kernel[key], key).toBeCloseTo(node[key] as number, 9);
  });

  it('leaves a shoulder that still fits', () => {
    const nose = {
      type: 'nosecone',
      id: 'nose',
      shape: 'ogive',
      length: 0.1,
      aftRadius: 0.025,
      shoulderRadius: 0.018,
      shoulderLength: 0.03,
      shoulderThickness: 0.002,
    } as ComponentNode;
    const node = findNode(updateNode(design(nose), 'nose', { aftRadius: 0.02 }).components, 'nose')!;
    expect(node['shoulderRadius']).toBe(0.018);
    expect(node['shoulderThickness']).toBe(0.002);
  });
});
