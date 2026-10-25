import { useCallback, useEffect, useState } from 'react';
import i18n from '../../i18n';
import { errorText } from '../../i18n/keyedError';
import { useLatest } from '../common/useLatest';
import { getLaunchLocationStore, type LaunchLocation } from '../../services/storage/launchLocationStore';

/**
 * The saved locations, kept in step with the store.
 *
 * Shared by the launch panel's dropdown and the manage dialog, which both list
 * the same locations and both have to re-read them after a write.
 *
 * The sequence guard is required. The first `list()` of a session waits on
 * IndexedDB opening its database, which on a busy machine takes longer than
 * every later read put together; a save in the meantime refreshes and resolves
 * first, and then that first answer (taken before anything was saved, so empty)
 * would land and overwrite it. The result would be a dropdown with no locations
 * in it over a database that has them, and nothing retries, because nothing
 * knows it is wrong.
 *
 * `null` means not read yet, which is how the manage dialog tells an empty list
 * apart from an unread one and avoids flashing its "no saved locations" card at
 * somebody who has several. A first read that fails is reported in `error`, as
 * Custom Materials reports its own, rather than read as no locations; a read
 * that succeeds clears it.
 *
 * `write` is how both callers save or delete: the write, then a fresh read, and
 * a refused write said in the caller's status line (`setErr`) rather than left
 * as a list that simply does not hold what was just saved. It resolves whether
 * the write went through, so the dialog can move its selection after it.
 */
export function useLocationList(): {
  locations: LaunchLocation[] | null;
  error: string | null;
  refresh: () => Promise<void>;
  write: (fn: () => Promise<void>, setErr: (err: string | null) => void) => Promise<boolean>;
} {
  const [locations, setPads] = useState<LaunchLocation[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  /** Which read is the current one; an older answer, or one after unmount, is dropped. */
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

  // The first read, with an empty list and the failure as its fallback. A
  // caller's `refresh` rejects to that caller instead.
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
