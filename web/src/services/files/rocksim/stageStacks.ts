import type { OpenRocketDesign, RocketTree } from '../../../engine/openRocketEngine';
import { asStageNodes } from '../../design/orkTree';
import { findStages } from '../../design/treeEdit';
import { numOpt } from '../../../tree/nodeProps';
import { STAGE_ELEMENTS } from './schema';

/** Dry mass of the stage alone (kg); dry CG of the stack from the sustainer through it (m from the nose tip). */
export interface StageFigures {
  mass: number;
  stackCg: number;
}

export function overridesStages(tree: RocketTree): boolean {
  return asStageNodes(tree)
    .slice(0, STAGE_ELEMENTS.length)
    .some((s) => numOpt(s, 'overrideMass') !== undefined || numOpt(s, 'overrideCGX') !== undefined);
}

type StageBuild = Pick<OpenRocketDesign, 'setStageActiveById' | 'rockSimStageFigures'>;

/** Weighed with every stage on, as desktop opens the file; `grounded` stages are grounded again afterward. */
export function stageStacks(
  build: StageBuild,
  tree: RocketTree,
  grounded: (id: string) => boolean,
): StageFigures[] | undefined {
  const stages = findStages(tree).filter((s): s is typeof s & { id: string } => typeof s.id === 'string');
  try {
    for (const stage of stages) build.setStageActiveById(stage.id, true);
    return build.rockSimStageFigures();
  } catch {
    return undefined;
  } finally {
    for (const stage of stages) if (grounded(stage.id)) build.setStageActiveById(stage.id, false);
  }
}
