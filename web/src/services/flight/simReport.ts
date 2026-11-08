export type StabilityState = 'ok' | 'under' | 'over';

export function stabilityState(cal: number | null | undefined): StabilityState | null {
  if (cal == null || !Number.isFinite(cal)) return null;
  if (cal < 1.0) return 'under';
  if (cal > 6.0) return 'over';
  return 'ok';
}

export function stabilityToneOf(state: StabilityState): string {
  return state === 'ok' ? 'text-ok-400' : state === 'over' ? 'text-warn-400' : 'text-danger-400';
}

export type RailBand = 'stable' | 'marginal' | 'unstable';
export const railBand = (cal: number): RailBand => (cal >= 1 ? 'stable' : cal >= 0 ? 'marginal' : 'unstable');
const RAIL_TONE: Record<RailBand, string> = {
  stable: 'text-ok-400',
  marginal: 'text-warn-400',
  unstable: 'text-danger-400',
};
const RAIL_VERDICT: Record<RailBand, string> = {
  stable: 'stability.stable',
  marginal: 'stability.marginal',
  unstable: 'stability.unstable',
};

// Rail-exit margin only (no over-stable band); on-pad uses stabilityToneOf.
export function stabilityTone(cal: number): string {
  return RAIL_TONE[railBand(cal)];
}

export function railVerdictKey(cal: number): string {
  return RAIL_VERDICT[railBand(cal)];
}

export function stabilityVerdictKey(cal: number): string {
  if (cal > 6) return 'schematic.overStable';
  return cal >= 1 ? 'stability.stable' : cal >= 0 ? 'stability.marginal' : 'stability.unstable';
}

export const EVENT_LABEL: Record<string, string> = {
  APOGEE: 'flight.apogee',
  BURNOUT: 'flight.burnout',
  RECOVERY_DEVICE_DEPLOYMENT: 'flight.deploy',
  EJECTION_CHARGE: 'flight.ejection',
  GROUND_HIT: 'flight.landing',
};

export const EVENT_PRIORITY = ['APOGEE', 'BURNOUT', 'RECOVERY_DEVICE_DEPLOYMENT', 'EJECTION_CHARGE', 'GROUND_HIT'];

const DEPLOY = 'RECOVERY_DEVICE_DEPLOYMENT';

// Deployments never merge, or a drogue at apogee would vanish; ties sort non-deploys first.
export function clusterEventLabels(
  events: { time: number; type: string }[],
  xOf: (t: number) => number,
  minGap = 20,
): { x: number; type: string }[] {
  const groups: { x: number; type: string }[] = [];
  const sorted = [...events].sort((a, b) => a.time - b.time || Number(a.type === DEPLOY) - Number(b.type === DEPLOY));
  for (const e of sorted) {
    const x = xOf(e.time);
    const last = groups[groups.length - 1];
    if (last && e.type !== DEPLOY && last.type !== DEPLOY && x - last.x < minGap) {
      if (EVENT_PRIORITY.indexOf(e.type) < EVENT_PRIORITY.indexOf(last.type)) last.type = e.type;
    } else {
      groups.push({ x, type: e.type });
    }
  }
  return groups;
}
