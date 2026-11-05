import { useTranslation } from 'react-i18next';
import { weatherErrorText } from '../../services/weather/weatherErrorText';
import { useLatest } from './useLatest';

export type ForecastState<T> =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | ({ kind: 'ready' } & T);

type ForecastGap = 'noHour' | 'noElevation';

const GAP_TEXT: Record<ForecastGap, string> = { noHour: 'weather.noHour', noElevation: 'weather.needElevation' };

export function useForecastRequest() {
  const { t } = useTranslation();
  const request = useLatest();

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

  const cancel = () => {
    request.claimSignal();
  };

  return { run, cancel };
}
