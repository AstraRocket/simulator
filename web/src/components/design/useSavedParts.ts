import { useSyncExternalStore } from 'react';
import { useAsyncLoad } from '../common/useAsyncLoad';
import {
  listSavedParts,
  onSavedPartsChanged,
  savedPartsVersion,
  type SavedPartEntry,
} from '../../services/parts/customParts';

/**
 * Every saved part, kept in step with the store.
 *
 * Re-read on `onSavedPartsChanged`, so saving a part in the property panel or
 * deleting one from the component picker updates this list without the dialog
 * being reopened. That signal is the same one the picker uses, and the load is
 * the picker's too (`useAsyncLoad` with the version as its `refresh`): a read
 * that lands after a newer one is dropped, so the session's first read, which
 * waits on IndexedDB opening its database, cannot land last and overwrite a
 * save made in the meantime.
 *
 * `entries` is `null` while the first read is out, so the view can tell an
 * unread library from an empty one instead of flashing "nothing saved" at
 * somebody who has parts. A read that fails is reported in `error`, as Custom
 * Materials reports its own, rather than read as an empty library.
 */
export function useSavedParts(): { entries: SavedPartEntry[] | null; error: string | null } {
  const version = useSyncExternalStore(onSavedPartsChanged, savedPartsVersion, savedPartsVersion);
  const list = useAsyncLoad(listSavedParts, 'savedParts', { refresh: version });
  return { entries: list.data ?? (list.error !== null ? [] : null), error: list.error };
}
