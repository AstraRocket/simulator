import { useWorkspaceStore } from '../../src/state/store';
import { newFlightConfig } from '../../src/services/flight/flightConfigs';
import { findMounts } from '../../src/services/design/treeEdit';
import type { MotorSpec } from '../../src/engine/openRocketEngine';

// Configurations are shared, so the row gets its own rather than editing the one it names.
export function seatMotor(name: string, spec: MotorSpec): void {
  const st = useWorkspaceStore.getState();
  const motors = Object.fromEntries(findMounts(st.tree).map((m) => [m.id as string, { spec }]));
  const config = newFlightConfig(motors);
  useWorkspaceStore.setState({
    configs: [...st.configs, config],
    sims: st.sims.map((x) => (x.name === name ? { ...x, configId: config.id } : x)),
  });
}

export const CURVELESS: MotorSpec = {
  designation: 'unresolved',
  diameter: 0.024,
  length: 0.07,
  times: [],
  thrusts: [],
  masses: [],
  cgX: 0.035,
  ejectionDelay: 3,
};
