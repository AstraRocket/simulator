import type { OpenRocketDesign, RocketTree } from '../../../engine/openRocketEngine';
import { asStageNodes } from '../../design/orkTree';
import { findStages } from '../../design/treeEdit';
import { numOpt } from '../../../tree/nodeProps';
import { STAGE_ELEMENTS } from './schema';

/**
 * The kernel's figures for one RockSim stage, nose down: the dry structure
 * mass of the stage alone (kg), and the dry CG of the stack from the
 * sustainer down to and including it (m from the nose tip). They are what
 * `RockSimSaver.setStageOverrides` computes with `MassCalculator.calculateStructure`
 * and writes as `StageNMass` and `Stage3CG`, `Stage32CG`, `Stage321CG`.
 */
export interface StageFigures {
  mass: number;
  stackCg: number;
}

/**
 * Whether any stage RockSim holds overrides its mass or its CG. RockSim's stage
 * overrides are all or nothing, so one is enough to have every stage's figures
 * written, and they come from the kernel.
 */
export function overridesStages(tree: RocketTree): boolean {
  return asStageNodes(tree)
    .slice(0, STAGE_ELEMENTS.length)
    .some((s) => numOpt(s, 'overrideMass') !== undefined || numOpt(s, 'overrideCGX') !== undefined);
}

/** What {@link stageStacks} needs of a build. */
type StageBuild = Pick<OpenRocketDesign, 'setStageActiveById' | 'staticInfo'>;

/**
 * Each stage's figures from a build of `tree`, or undefined when the build
 * does not hold every stage.
 *
 * The build's own stage activeness is borrowed and put back: each stage is
 * weighed on its own and each stack with the stages above it, with every other
 * stage off, as `RockSimSaver` does with a fresh configuration. A top-level
 * stage takes its boosters with it (`FlightConfiguration._setStageActive`
 * activates the sub-stages). `grounded` is what the build grounds, which is
 * restored in the order `buildConfiguredRocket` grounded it.
 */
export function stageStacks(
  build: StageBuild,
  tree: RocketTree,
  grounded: (id: string) => boolean,
): StageFigures[] | undefined {
  const stages = tree.components.filter((n) => n.type === 'stage');
  const ids = stages.map((s) => s.id);
  if (stages.length === 0 || ids.some((id) => typeof id !== 'string')) return undefined;
  const only = (active: (i: number) => boolean) => ids.forEach((id, i) => build.setStageActiveById(id!, active(i)));
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
