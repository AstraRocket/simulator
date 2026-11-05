import { useCallback, useEffect, useState } from 'react';
import i18n from '../../i18n';
import { errorText } from '../../i18n/keyedError';
import { useLatest } from '../common/useLatest';
import { getLaunchLocationStore, type LaunchLocation } from '../../services/storage/launchLocationStore';

/**
 * The sequence guard is required: the first `list()` waits on IndexedDB opening
 * and can resolve after a later refresh. `null` means not read yet, distinct from empty.
 */
export function useLocationList(): {
  locations: LaunchLocation[] | null;
  error: string | null;
  refresh: () => Promise<void>;
  write: (fn: () => Promise<void>, setErr: (err: string | null) => void) => Promise<boolean>;
} {
  const [locations, setPads] = useState<LaunchLocation[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const { claim } = useLatest();

  const refresh = useCallback(async () => {
    const mine = claim();
    const list = await getLaunchLocationStore().list();
    if (mine()) {
      setPads(list);
      setFailure(null);
    }
  }, [claim]);

  const write = async (fn: () => Promise<void>, setErr: (err: string | null) => void): Promise<boolean> => {
    setErr(null);
    try {
      await fn();
      await refresh();
      return true;
    } catch {
      setErr(i18n.t('location.saveFailed'));
      return false;
    }
  };

  useEffect(() => {
    const mine = claim();
    // Async, so a store that throws synchronously still lands in the fallback.
    void (async () => getLaunchLocationStore().list())().then(
      (list) => mine() && setPads(list),
      (e: unknown) => {
        if (!mine()) return;
        setPads([]);
        setFailure(e ?? new Error());
      },
    );
  }, [claim]);

  // Worded on every render, so it follows a language switch.
  return { locations, error: failure === null ? null : errorText(failure, i18n.t), refresh, write };
}
