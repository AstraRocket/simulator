// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useForecastRequest, type ForecastState } from '../../../src/components/common/useForecastRequest';

type Answer = { speedMs: number };

/** The request the forecast tools share: one at a time, nothing written from a replaced one. */
describe('useForecastRequest', () => {
  it('writes loading, then the ready answer, and resolves it', async () => {
    const { result } = renderHook(() => useForecastRequest());
    const set = vi.fn<(s: ForecastState<{ answer: Answer }>) => void>();
    let got: Answer | null = null;
    await act(async () => {
      got = await result.current.run(
        set,
        () => Promise.resolve({ speedMs: 4 }),
        (answer) => ({ answer }),
      );
    });
    expect(set.mock.calls.map(([s]) => s.kind)).toEqual(['loading', 'ready']);
    expect(got).toEqual({ speedMs: 4 });
  });

  it('reads a missing hour as an error in words, not as an answer', async () => {
    const { result } = renderHook(() => useForecastRequest());
    const set = vi.fn<(s: ForecastState<{ answer: Answer }>) => void>();
    let got: Answer | null = { speedMs: 0 };
    await act(async () => {
      got = await result.current.run<Answer, { answer: Answer }>(
        set,
        () => Promise.resolve('noHour'),
        (answer) => ({ answer }),
      );
    });
    const last = set.mock.calls.at(-1)![0];
    expect(last.kind).toBe('error');
    expect(last.kind === 'error' && last.message).not.toBe('weather.noHour');
    expect(got).toBeNull();
  });

  it('writes nothing from a request a newer one replaced', async () => {
    const { result } = renderHook(() => useForecastRequest());
    const first = vi.fn<(s: ForecastState<{ answer: Answer }>) => void>();
    let release!: (a: Answer) => void;
    let pending!: Promise<Answer | null>;
    act(() => {
      pending = result.current.run(
        first,
        () => new Promise<Answer>((r) => (release = r)),
        (answer) => ({ answer }),
      );
    });
    act(() => result.current.cancel());
    release({ speedMs: 9 });
    await act(async () => {
      expect(await pending).toBeNull();
    });
    expect(first.mock.calls.map(([s]) => s.kind)).toEqual(['loading']);
  });

  it('writes the failure as the weather error text', async () => {
    const { result } = renderHook(() => useForecastRequest());
    const set = vi.fn<(s: ForecastState<{ answer: Answer }>) => void>();
    await act(async () => {
      await result.current.run<Answer, { answer: Answer }>(
        set,
        () => Promise.reject(new Error('down')),
        (answer) => ({ answer }),
      );
    });
    const last = set.mock.calls.at(-1)![0];
    expect(last.kind === 'error' && last.message.length > 0).toBe(true);
  });
});
