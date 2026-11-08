import type { RocketTree } from '../../engine/openRocketEngine';
import { findStages } from './treeEdit';
import { stageNodes } from '../../tree/treeWalk';

/** A parallel booster counts with the stage it is attached to. */
export function stageIdsByTopStage(tree: RocketTree): string[][] {
  return stageNodes(tree).map((st) => findStages({ ...tree, components: [st] }).map((n) => n.id as string));
}

export interface StageSwitch {
  setStageActiveById(id: string, active: boolean): void;
}

/** Sets every stage, so the result does not depend on the handle's prior state. */
export function activateThrough(rocket: StageSwitch, stageIds: readonly (readonly string[])[], k: number): void {
  stageIds.forEach((ids, i) => ids.forEach((id) => rocket.setStageActiveById(id, i <= k)));
}
