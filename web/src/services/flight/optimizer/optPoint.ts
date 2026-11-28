import { buildConfiguredRocket } from '../../design/buildRocket';
import type { SimPayload } from '../../../engine/simProtocol';
import { domainDistance, flightFigures, type OptPoint, type StabilityLimits } from './optGoals';

export interface OptPointPayload extends SimPayload {
  limits: StabilityLimits | null;
  /** False for a stability goal: desktop's `StabilityParameter` flies nothing. */
  fly: boolean;
}

/** Desktop checks the limits before flying, so a point outside them costs no flight. */
export function evaluateOptPoint(p: OptPointPayload): OptPoint {
  const design = buildConfiguredRocket(p.tree, p.config, 'flight');
  const info = design.staticInfo();
  const st = { cp: info.cp, cg: info.cg, calibers: info.stabilityCalibers };
  const distance = domainDistance(p.limits, st);
  if (!p.fly || !(distance <= 0)) return { static: st, distance, figures: null };
  return { static: st, distance, figures: flightFigures(design.simulate(p.options)) };
}
