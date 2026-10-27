import type { GuideRow } from '../../services/flight/motorGuide';
import { deploymentVerdict, lastDeployment } from './speedWarnings';
import { railBand } from '../../services/flight/simReport';

/**
 * What is wrong with one motor guide row, judged the way the results tiles
 * judge a normal flight and against the same settings: the rail-exit speed
 * against `railExitVelocityMin` (the Rod exit tile), the margin at rail exit
 * by its bands (the Static margin tile), the deployment speed by the kernel's
 * own warnings (the Deploy tile), and the kernel's flight warnings as the
 * warnings card counts them.
 *
 * No new limits. A pass/fail grid with thresholds of its own was turned down
 * (TODO.md) because it would be a second opinion beside the warnings the app
 * already gives; this is those warnings, one line per motor.
 */
export type GuideIssue = 'slowExit' | 'railMarginal' | 'railUnstable' | 'deployFast' | 'deploySlow';

export interface GuideVerdict {
  issues: GuideIssue[];
  /** The kernel's warnings for the flight, every kind, as the warnings card lists them. */
  warnings: number;
}

export interface GuideLimits {
  /** Settings > Simulation's minimum rail-exit speed, m/s. */
  railExitVelocityMin: number;
  /** The simulation's effective deployment-speed threshold, m/s. */
  deploymentSpeedWarn: number;
  /** Device names more than one recovery device flies under (`sharedDeviceNames`). */
  sharedNames?: ReadonlySet<string>;
}

export function guideVerdict(row: GuideRow, limits: GuideLimits): GuideVerdict {
  const issues: GuideIssue[] = [];
  if (row.railExit < limits.railExitVelocityMin) issues.push('slowExit');
  const band = row.railMargin == null ? null : railBand(row.railMargin);
  if (band === 'unstable') issues.push('railUnstable');
  else if (band === 'marginal') issues.push('railMarginal');
  if (row.deployVelocity != null) {
    const v = deploymentVerdict(
      row.deployVelocity,
      row.warnings,
      limits.deploymentSpeedWarn,
      lastDeployment(row.deployEvents),
      limits.sharedNames,
    );
    if (v === 'tooFast') issues.push('deployFast');
    else if (v === 'tooSlow') issues.push('deploySlow');
  }
  return { issues, warnings: row.warnings.length };
}

/** A sort key that puts clean rows first and the most troubled last. */
export function verdictRank(v: GuideVerdict): number {
  return v.issues.length * 100 + v.warnings;
}
