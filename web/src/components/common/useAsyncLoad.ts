import { useEffect, useState } from 'react';
import i18n from '../../i18n';
import { errorText } from '../../i18n/keyedError';
import { useLatestRef } from './useLatestRef';

type Landed<T> = { key: string; attempt: number } & ({ ok: true; data: T } | { ok: false; error: unknown });

// `loading` is derived: setting it in the effect is a cascading render the lint rejects.
export function useAsyncLoad<T>(
  load: () => Promise<T>,
  key: string,
  { refresh, onLoaded }: { refresh?: unknown; onLoaded?: (data: T) => void } = {},
): { data: T | undefined; error: string | null; loading: boolean; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [landed, setLanded] = useState<Landed<T> | null>(null);
  // Callers pass inline closures; as deps they would reload on every render.
  const latest = useLatestRef({ load, onLoaded });
  useEffect(() => {
    let live = true;
    latest.current
      .load()
      .then((data) => {
        if (!live) return;
        setLanded({ key, attempt, ok: true, data });
        latest.current.onLoaded?.(data);
      })
      .catch((e: unknown) => {
        if (live) setLanded({ key, attempt, ok: false, error: e });
      });
    return () => {
      live = false;
    };
  }, [key, attempt, refresh, latest]);
  const current = landed !== null && landed.key === key && landed.attempt === attempt ? landed : null;
  return {
    data: current?.ok ? current.data : undefined,
    error: current && !current.ok ? errorText(current.error, i18n.t) : null,
    loading: current === null,
    retry: () => setAttempt((n) => n + 1),
  };
}
