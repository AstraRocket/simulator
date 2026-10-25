import { describe, expect, it } from 'vitest';
import { activateThrough, stageIdsByTopStage } from '../../../src/services/design/stageStack';
import type { RocketTree } from '../../../src/engine/openRocketEngine';

/**
 * The stack the design report and the RASAero export both weigh: the sustainer
 * through one top-level stage, a parallel booster counted with the stage it is
 * attached to.
 */
const tree = {
  name: 'R',
  components: [
    { type: 'stage', id: 'sus', children: [{ type: 'bodytube', id: 'b1' }] },
    {
      type: 'stage',
      id: 'boost',
      children: [{ type: 'bodytube', id: 'b2', children: [{ type: 'parallelstage', id: 'side', children: [] }] }],
    },
  ],
} as unknown as RocketTree;

describe('the stage stack', () => {
  it('groups a parallel booster with the stage it hangs on', () => {
    expect(stageIdsByTopStage(tree)).toEqual([['sus'], ['boost', 'side']]);
  });

  it('switches on the sustainer through stage k and nothing below it', () => {
    const on = new Map<string, boolean>();
    const rocket = { setStageActiveById: (id: string, active: boolean) => void on.set(id, active) };
    const ids = stageIdsByTopStage(tree);
    activateThrough(rocket, ids, 0);
    expect(Object.fromEntries(on)).toEqual({ sus: true, boost: false, side: false });
    activateThrough(rocket, ids, 1);
    expect(Object.fromEntries(on)).toEqual({ sus: true, boost: true, side: true });
  });
});
