import type { GuideRow } from '../../services/flight/motorGuide';
import { deploymentVerdict, lastDeployment } from './speedWarnings';
import { railBand } from '../../services/flight/simReport';

export type GuideIssue = 'slowExit' | 'railMarginal' | 'railUnstable' | 'deployFast' | 'deploySlow';

export interface GuideVerdict {
  issues: GuideIssue[];
  warnings: number;
}

export interface GuideLimits {
  /** m/s */
  railExitVelocityMin: number;
  /** m/s */
  deploymentSpeedWarn: number;
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

export function verdictRank(v: GuideVerdict): number {
  return v.issues.length * 100 + v.warnings;
}
