import { useTranslation } from 'react-i18next';
import { weatherErrorText } from '../../services/weather/weatherErrorText';
import { useLatest } from './useLatest';

/** A forecast request's state, as a tool or dialog holds it; `T` is what a ready answer carries. */
export type ForecastState<T> =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | ({ kind: 'ready' } & T);

/** The answers that are a gap in what was asked rather than a failure of the service. */
type ForecastGap = 'noHour' | 'noElevation';

const GAP_TEXT: Record<ForecastGap, string> = { noHour: 'weather.noHour', noElevation: 'weather.needElevation' };

/**
 * One forecast request at a time. A new one aborts the one before, and so does
 * unmounting, and nothing an aborted request returns is written. The state
 * stays the caller's (one remembers it across tabs, one does not), so `run`
 * writes through the setter it is given.
 */
export function useForecastRequest() {
  const { t } = useTranslation();
  const request = useLatest();

  /**
   * Ask, and write loading, then the answer or the failure's words. Resolves
   * the answer, or null when it failed, was a gap, or was replaced, so the
   * caller can do what follows a good answer (fill a field, scroll to it).
   */
  const run = async <R extends object, T>(
    set: (s: ForecastState<T>) => void,
    ask: (signal: AbortSignal) => Promise<R | ForecastGap>,
    ready: (answer: R) => T,
  ): Promise<R | null> => {
    const signal = request.claimSignal();
    set({ kind: 'loading' });
    try {
      const answer = await ask(signal);
      if (signal.aborted) return null;
      if (typeof answer === 'string') {
        set({ kind: 'error', message: t(GAP_TEXT[answer]) });
        return null;
      }
      set({ kind: 'ready', ...ready(answer) });
      return answer;
    } catch (err) {
      if (!signal.aborted) set({ kind: 'error', message: weatherErrorText(err, t) });
      return null;
    }
  };

  /** Drop the request in flight, as a changed question does. */
  const cancel = () => {
    request.claimSignal();
  };

  return { run, cancel };
}
