import type { OpenRocketDesign, RocketTree } from '../../../engine/openRocketEngine';
import { activateThrough, stageIdsByTopStage } from '../../design/stageStack';

/** Cumulative from the sustainer through this stage; CG from the nose tip. */
export interface StageLaunch {
  massKg: number;
  cgM: number;
}

export type StageMassBuild = Pick<OpenRocketDesign, 'setStageActiveById' | 'staticInfo'>;

/** Building resets the shared engine, so the caller restores the live handle afterward. */
export function cumulativeStageLaunch(tree: RocketTree, rocket: StageMassBuild): StageLaunch[] {
  const stageIds = stageIdsByTopStage(tree);
  return stageIds.map((_, k) => {
    activateThrough(rocket, stageIds, k);
    const info = rocket.staticInfo();
    return { massKg: info.mass, cgM: info.cg };
  });
}
