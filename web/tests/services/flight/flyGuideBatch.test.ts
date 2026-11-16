import { describe, it, expect, vi } from 'vitest';
import { flyGuideBatch } from '../../../src/services/flight/motorGuide';
import type { CatalogMotor } from '../../../src/services/motors/motorDb';

const motor = (designation: string, delays?: string): CatalogMotor =>
  ({ designation, manufacturer: 'Estes', class: 'C', diameter: 18, ...(delays ? { delays } : {}) }) as CatalogMotor;

const flown = (delay: number, optimumDelay: number | null) => ({ delay, optimumDelay });

describe('flyGuideBatch', () => {
  it('re-flies at the nearest listed delay only when asked, and keeps the asked order', async () => {
    const a = motor('A', '3,5,7');
    const b = motor('B', '4');
    const fly = vi.fn(async (m: CatalogMotor, delay: number) => {
      // B finishes first, so the result must still come back in the asked order.
      if (m === a) await new Promise((r) => setTimeout(r, 5));
      return flown(delay, 6.6);
    });
    const onSettled = vi.fn();
    const batch = await flyGuideBatch([a, b], {
      fly,
      refly: true,
      row: (m, key, f, nearest) => ({ key, name: m.designation, delay: f.delay, nearest }),
      signal: new AbortController().signal,
      onSettled,
      reason: String,
    });
    expect(batch.rows.map((r) => [r.name, r.delay, r.nearest])).toEqual([
      ['A', 7, 7],
      ['B', 4, 4],
    ]);
    // A: probe 5, then 7. B: its only delay is the probe, so one flight.
    expect(fly.mock.calls.map(([m, d]) => [m.designation, d])).toEqual([
      ['A', 5],
      ['B', 4],
      ['A', 7],
    ]);
    expect(onSettled).toHaveBeenCalledTimes(2);
    expect(batch.partial).toBe(false);

    fly.mockClear();
    const once = await flyGuideBatch([a], {
      fly,
      refly: false,
      row: (_m, key, f, nearest) => ({ key, delay: f.delay, nearest }),
      signal: new AbortController().signal,
      onSettled: () => {},
      reason: String,
    });
    expect(fly).toHaveBeenCalledTimes(1);
    expect(once.rows[0]).toMatchObject({ delay: 5, nearest: 7 });
  });

  it('reports a failure with its reason, and drops what a cancel stopped', async () => {
    const ok = motor('OK', '5');
    const bad = motor('BAD', '5');
    const failing = await flyGuideBatch([bad, ok], {
      fly: async (m, delay) => {
        if (m === bad) throw new Error('no curve');
        return flown(delay, null);
      },
      refly: true,
      row: (_m, key) => ({ key }),
      signal: new AbortController().signal,
      onSettled: () => {},
      reason: (e) => (e as Error).message,
    });
    expect(failing.rows).toHaveLength(1);
    expect(failing.failed).toEqual([expect.objectContaining({ motor: bad, reason: 'no curve' })]);

    const abort = new AbortController();
    const onSettled = vi.fn();
    const canceled = await flyGuideBatch([ok, bad], {
      fly: async () => {
        abort.abort();
        throw new Error('canceled');
      },
      refly: true,
      row: (_m, key) => ({ key }),
      signal: abort.signal,
      onSettled,
      reason: String,
    });
    expect(canceled).toEqual({ rows: [], failed: [], partial: true });
    expect(onSettled).toHaveBeenCalledTimes(2);
  });
});
