// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AeroSweep } from '../../../src/engine/openRocketEngine';
import { useAeroSweep } from '../../../src/components/canvas/useAeroSweep';

const fakeSweep = (machMax: number) => ({ machs: [0.05, machMax] }) as unknown as AeroSweep;
const rocketFor = (calls: number[]) => ({
  aeroSweep: (o?: { machMax?: number }) => {
    calls.push(o?.machMax ?? NaN);
    return fakeSweep(o?.machMax ?? NaN);
  },
});
const inputs = (machMax: number, altitudeM = 0) => ({ machMax, aoaDeg: 0, thetaDeg: 0, rollRate: 0, altitudeM });

afterEach(() => vi.useRealTimers());

describe('useAeroSweep', () => {
  it('is pending until the deferred run lands, then reports its sweep', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const rocket = rocketFor(calls);
    const { result } = renderHook(() => useAeroSweep(rocket, inputs(1)));
    expect(result.current).toEqual({ sweep: null, pending: true });
    expect(calls).toEqual([]);
    await act(() => vi.runAllTimersAsync());
    expect(calls).toEqual([1]);
    expect(result.current.pending).toBe(false);
    expect(result.current.sweep?.machs).toEqual([0.05, 1]);
  });

  it('keeps the previous sweep up while the next input runs', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const rocket = rocketFor(calls);
    const { result, rerender } = renderHook(({ machMax }) => useAeroSweep(rocket, inputs(machMax)), {
      initialProps: { machMax: 1 },
    });
    await act(() => vi.runAllTimersAsync());
    rerender({ machMax: 2 });
    expect(result.current.pending).toBe(true);
    expect(result.current.sweep?.machs).toEqual([0.05, 1]);
    await act(() => vi.runAllTimersAsync());
    expect(result.current.pending).toBe(false);
    expect(result.current.sweep?.machs).toEqual([0.05, 2]);
  });

  it('skips a run whose inputs changed before it started', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const rocket = rocketFor(calls);
    const { result, rerender } = renderHook(({ machMax }) => useAeroSweep(rocket, inputs(machMax)), {
      initialProps: { machMax: 1 },
    });
    rerender({ machMax: 3 });
    await act(() => vi.runAllTimersAsync());
    expect(calls).toEqual([3]);
    expect(result.current.sweep?.machs).toEqual([0.05, 3]);
  });

  it('shows nothing and is not pending without a rocket', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAeroSweep(null, inputs(1)));
    expect(result.current).toEqual({ sweep: null, pending: false });
    await act(() => vi.runAllTimersAsync());
    expect(result.current).toEqual({ sweep: null, pending: false });
  });

  it('reports null (not a stale sweep) when the kernel throws', async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rocket = {
      aeroSweep: () => {
        throw new Error('boom');
      },
    };
    const { result } = renderHook(() => useAeroSweep(rocket, inputs(1)));
    await act(() => vi.runAllTimersAsync());
    expect(result.current).toEqual({ sweep: null, pending: false });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('flies the sweep at the chosen altitude, and sends no table at sea level', async () => {
    vi.useFakeTimers();
    const seen: unknown[] = [];
    const rocket = {
      aeroSweep: (o?: { machAlt?: unknown }) => {
        seen.push(o?.machAlt);
        return fakeSweep(1);
      },
    };
    const { rerender } = renderHook(({ alt }) => useAeroSweep(rocket, inputs(2, alt)), { initialProps: { alt: 0 } });
    await act(() => vi.runAllTimersAsync());
    rerender({ alt: 1500 });
    await act(() => vi.runAllTimersAsync());
    expect(seen).toEqual([
      undefined,
      [
        [0, 1500],
        [2, 1500],
      ],
    ]);
  });
});
