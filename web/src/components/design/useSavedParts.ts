import { useSyncExternalStore } from 'react';
import { useAsyncLoad } from '../common/useAsyncLoad';
import {
  listSavedParts,
  onSavedPartsChanged,
  savedPartsVersion,
  type SavedPartEntry,
} from '../../services/parts/customParts';

/** `entries` is `null` until the first read, to tell unread from empty. */
export function useSavedParts(): { entries: SavedPartEntry[] | null; error: string | null } {
  const version = useSyncExternalStore(onSavedPartsChanged, savedPartsVersion, savedPartsVersion);
  const list = useAsyncLoad(listSavedParts, 'savedParts', { refresh: version });
  return { entries: list.data ?? (list.error !== null ? [] : null), error: list.error };
}
