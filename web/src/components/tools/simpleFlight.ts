import { simulateInWorker } from '../../engine/simClient';
import type { MotorSpec } from '../../engine/openRocketEngine';
import {
  simpleConfig,
  simpleFigures,
  simpleOptions,
  simpleRocketTree,
  type SimpleFigures,
  type SimpleInputs,
  type SimpleLaunch,
} from '../../services/flight/simpleRocket';

/**
 * One simple-rocket flight in the worker pool: the rocket built around this
 * motor, flown in calm air, read for its figures. Shared by the tool's Fly and
 * its motor guide, so a motor flown either way gives the same numbers.
 */
export async function flySimple(
  inputs: SimpleInputs,
  launch: SimpleLaunch,
  spec: MotorSpec,
  signal?: AbortSignal,
): Promise<SimpleFigures> {
  const result = await simulateInWorker(
    { tree: simpleRocketTree(inputs, spec), config: simpleConfig(spec), options: simpleOptions(launch) },
    { signal },
  );
  return simpleFigures(result, inputs.chute != null);
}

/** What the inputs were, as one comparable string: a result flown from another is stale. */
export function simpleKey(inputs: SimpleInputs | null, launch: SimpleLaunch, motor?: MotorSpec | null): string {
  return JSON.stringify(motor === undefined ? [inputs, launch] : [inputs, launch, motor]);
}
