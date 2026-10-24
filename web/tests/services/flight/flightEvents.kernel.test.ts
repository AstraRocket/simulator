import { describe, expect, it, vi } from 'vitest';
import { eventRows } from '../../../src/services/flight/flightEvents';
import { flightBranches } from '../../../src/services/flight/flightColumns';
import { flyTwoStage } from '../../testing/twoStageFlight';
import { KERNEL_TEST_TIMEOUT_MS } from '../../testing/kernelTimeout';

vi.setConfig({ testTimeout: KERNEL_TEST_TIMEOUT_MS, hookTimeout: KERNEL_TEST_TIMEOUT_MS });

/**
 * A booster's branch begins as a copy of the flight up to its separation, events
 * included (FlightDataBranch's copy constructor), so the kernel reports the
 * booster's ignition, burnout and separation in both branches. The timeline
 * lists each event the flight had once, and every event after the separation
 * under the stage it happened to.
 */
describe('the flight timeline of a two-stage flight', () => {
  it('lists each event once, and the booster’s own after separation', async () => {
    const result = await flyTwoStage();
    const branches = flightBranches(result);
    expect(branches.length).toBeGreaterThan(1);
    const rows = eventRows(result);
    const key = (e: { type: string; time: number; source?: string }) => `${e.type}|${e.time}|${e.source ?? ''}`;
    const keys = rows.map(key);
    expect(new Set(keys).size).toBe(keys.length);

    const listed = new Set(keys);
    const booster = branches[1]!;
    const separated = booster.events!.find((e) => e.type === 'STAGE_SEPARATION')!.time;
    for (const e of booster.events!.filter((ev) => ev.time > separated)) {
      if (rows.some((r) => r.type === e.type)) expect(listed.has(key(e)), key(e)).toBe(true);
    }
    // The booster's copied events are the sustainer's: the separation is there once.
    expect(rows.filter((r) => r.type === 'STAGE_SEPARATION')).toHaveLength(
      new Set(branches.flatMap((b) => (b.events ?? []).filter((e) => e.type === 'STAGE_SEPARATION').map(key))).size,
    );
  });
});
