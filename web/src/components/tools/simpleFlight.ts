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

export function simpleKey(inputs: SimpleInputs | null, launch: SimpleLaunch, motor?: MotorSpec | null): string {
  return JSON.stringify(motor === undefined ? [inputs, launch] : [inputs, launch, motor]);
}
