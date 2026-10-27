import { describe, it, expect } from 'vitest';
import { guideVerdict, verdictRank } from '../../../src/components/sim/motorGuideIssues';
import type { GuideRow } from '../../../src/services/flight/motorGuide';

const row = (p: Partial<GuideRow>): GuideRow =>
  ({
    key: 'k',
    delay: 5,
    apogee: 300,
    railExit: 20,
    railMargin: 2,
    railTwr: 8,
    deployVelocity: 5,
    warnings: [],
    deployEvents: [],
    ...p,
  }) as GuideRow;

const LIMITS = { railExitVelocityMin: 15, deploymentSpeedWarn: 20 };

/**
 * The guide's status column is the app's existing warnings, one line per motor:
 * the same limits the results tiles judge a flight by, and no new ones.
 */
describe('a guide row verdict', () => {
  it('finds nothing wrong with a clean flight', () => {
    expect(guideVerdict(row({}), LIMITS)).toEqual({ issues: [], warnings: 0 });
  });

  it('judges the rail-exit speed against the setting', () => {
    expect(guideVerdict(row({ railExit: 14.9 }), LIMITS).issues).toEqual(['slowExit']);
    expect(guideVerdict(row({ railExit: 15 }), LIMITS).issues).toEqual([]);
  });

  it('judges the margin at rail exit by the tile bands', () => {
    expect(guideVerdict(row({ railMargin: 0.5 }), LIMITS).issues).toEqual(['railMarginal']);
    expect(guideVerdict(row({ railMargin: -0.2 }), LIMITS).issues).toEqual(['railUnstable']);
    expect(guideVerdict(row({ railMargin: null }), LIMITS).issues).toEqual([]);
  });

  /** With the kernel's warnings present, the kernel decides, as the Deploy tile does. */
  it('takes the deployment verdict from the kernel warnings', () => {
    const fast = row({
      deployVelocity: 30,
      warnings: [{ key: 'HighSpeedDeployment', message: '"Parachute"', sourceIds: ['p1'] }],
      deployEvents: [{ type: 'RECOVERY_DEVICE_DEPLOYMENT', time: 9, source: 'Parachute', sourceId: 'p1' }],
    });
    expect(guideVerdict(fast, LIMITS)).toEqual({ issues: ['deployFast'], warnings: 1 });
  });

  it('ranks clean rows ahead of troubled ones', () => {
    const clean = guideVerdict(row({}), LIMITS);
    const noted = guideVerdict(row({ warnings: [{ key: 'x', message: 'x' }] }), LIMITS);
    const bad = guideVerdict(row({ railExit: 3 }), LIMITS);
    expect(verdictRank(clean)).toBeLessThan(verdictRank(noted));
    expect(verdictRank(noted)).toBeLessThan(verdictRank(bad));
  });
});
