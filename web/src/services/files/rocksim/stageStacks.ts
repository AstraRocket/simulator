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

type StageBuild = Pick<OpenRocketDesign, 'setStageActiveById' | 'staticInfo'>;

/** Borrows the build's stage activeness and restores it, re-grounding `grounded` stages afterward. */
export function stageStacks(
  build: StageBuild,
  tree: RocketTree,
  grounded: (id: string) => boolean,
): StageFigures[] | undefined {
  const stages = tree.components.filter((n) => n.type === 'stage');
  const ids = stages.map((s) => s.id).filter((id): id is string => typeof id === 'string');
  if (stages.length === 0 || ids.length !== stages.length) return undefined;
  const only = (active: (i: number) => boolean) => ids.forEach((id, i) => build.setStageActiveById(id, active(i)));
  try {
    return stages.slice(0, STAGE_ELEMENTS.length).map((_, i) => {
      only((j) => j === i);
      const mass = build.staticInfo().massEmpty;
      only((j) => j <= i);
      return { mass, stackCg: build.staticInfo().cgEmpty };
    });
  } catch {
    return undefined;
  } finally {
    only(() => true);
    for (const stage of findStages(tree)) {
      if (typeof stage.id === 'string' && grounded(stage.id)) build.setStageActiveById(stage.id, false);
    }
  }
}
