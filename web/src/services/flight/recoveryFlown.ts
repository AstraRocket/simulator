import type { ComponentNode, FlightEvent, FlightEventType, FlightResult } from '../../engine/openRocketEngine';
import { kernelComponentName } from '../app/warningText';
import { walkNodes } from '../../tree/treeWalk';
import { isRecoveryDevice } from '../design/treeEdit';
import { eventTime, seriesAt } from './flightEvents';
import { flightBranches } from './flightColumns';

const DEPLOYMENT: FlightEventType = 'RECOVERY_DEVICE_DEPLOYMENT';

const GROUND_HIT: FlightEventType = 'GROUND_HIT';

// Apogee deployments are queued 1 ms after apogee, so near-simultaneous openings count as one step.
const TOGETHER_S = 0.2;

// A charge fired on the ground still raises its event, but nothing descends under it.
function airborneDeployments(events: readonly FlightEvent[]) {
  const landed = eventTime(events, GROUND_HIT) ?? Infinity;
  return events.filter((e) => e.type === DEPLOYMENT && e.time < landed);
}

export interface DeviceDescent {
  branch: string;
  /** s. */
  time: number;
  /** kg. */
  mass: number;
  /** m/s, read at the end of the device's phase, since just after opening it is still slowing. */
  rate: number | null;
}

export function sharedDeviceNames(nodes: readonly ComponentNode[]): Set<string> {
  const seen = new Set<string>();
  const shared = new Set<string>();
  for (const n of walkNodes(nodes)) {
    if (!isRecoveryDevice(n.type)) continue;
    const name = kernelComponentName(n);
    if (seen.has(name)) shared.add(name);
    seen.add(name);
  }
  return shared;
}

export interface RecoveryDeviceRef {
  id?: string;
  /** The kernel's name (`kernelComponentName`). */
  name: string;
  nameShared: boolean;
}

// Matched on `sourceId`, since unnamed parachutes share a kernel name; a shared name never matches.
export function deviceDescent(
  result: FlightResult | null | undefined,
  device: RecoveryDeviceRef,
): DeviceDescent | null {
  if (!result) return null;
  const branches = flightBranches(result);
  const byId = branches.some((b) => (b.events ?? []).some((e) => e.type === DEPLOYMENT && e.sourceId != null));
  if (byId ? !device.id : !device.name || device.nameShared) return null;
  const isDevice = (e: { sourceId?: string; source?: string }) =>
    byId ? e.sourceId === device.id : e.source === device.name;
  for (const branch of branches) {
    const events = branch.events ?? [];
    const deployments = airborneDeployments(events);
    const opened = deployments.find(isDevice);
    if (!opened) continue;
    const mass = seriesAt(branch.series, 'mass', opened.time);
    if (mass == null || !(mass > 0)) return null;
    const stepStart = (deployments.find((e) => opened.time - e.time < TOGETHER_S && e.time <= opened.time) ?? opened)
      .time;
    const next = events.find(
      (e) =>
        (e.type === GROUND_HIT && e.time > opened.time) || (e.type === DEPLOYMENT && e.time >= stepStart + TOGETHER_S),
    );
    const times = branch.series.time ?? [];
    const endsAt = next?.time ?? times[times.length - 1];
    // Vertical speed when recorded, so wind does not count as descent.
    const vertical = Array.isArray(branch.series['Vz']) ? 'Vz' : 'velocity';
    const rate = endsAt == null ? null : seriesAt(branch.series, vertical, endsAt);
    return {
      branch: branch.name,
      time: opened.time,
      mass,
      rate: rate == null ? null : Math.abs(rate),
    };
  }
  return null;
}

export function sustainerDescentMass(result: FlightResult | null | undefined): number | null {
  if (!result) return null;
  const branch = flightBranches(result)[0];
  if (!branch) return null;
  const opened = airborneDeployments(branch.events ?? [])[0];
  if (!opened) return null;
  const mass = seriesAt(branch.series, 'mass', opened.time);
  return mass != null && mass > 0 ? mass : null;
}
