import type { RocketTree } from '../../engine/openRocketEngine';
import { findStages } from './treeEdit';
import { stageNodes } from '../../tree/treeWalk';

/**
 * Every stage id (nested parallel boosters included) under each top-level
 * stage, sustainer first: a parallel booster counts with the stage it is
 * attached to. The design report and the RASAero export both weigh a stack by
 * these, so the stack rule has one copy.
 */
export function stageIdsByTopStage(tree: RocketTree): string[][] {
  return stageNodes(tree).map((st) => findStages({ ...tree, components: [st] }).map((n) => n.id as string));
}

/** What switching a stage on or off needs of a built rocket. */
export interface StageSwitch {
  setStageActiveById(id: string, active: boolean): void;
}

/**
 * The stack from the sustainer through top-level stage `k` switched on, every
 * stage below it off, so the build's mass and CG are that stack's with the
 * motors it carries. Every stage is set, so the answer does not depend on what
 * the handle was left at.
 */
export function activateThrough(rocket: StageSwitch, stageIds: readonly (readonly string[])[], k: number): void {
  stageIds.forEach((ids, i) => ids.forEach((id) => rocket.setStageActiveById(id, i <= k)));
}
