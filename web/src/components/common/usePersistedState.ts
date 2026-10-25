import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLatestRef } from './useLatestRef';

/**
 * `useState` for a preference kept across sessions: starts from `load()` and
 * writes every change through `save`, but not the value it loaded, which is
 * already stored, so opening a panel writes nothing.
 */
export function usePersistedState<T>(load: () => T, save: (value: T) => void): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(load);
  const saveRef = useLatestRef(save);
  const loaded = useRef(true);
  useEffect(() => {
    if (loaded.current) {
      loaded.current = false;
      return;
    }
    saveRef.current(value);
  }, [value, saveRef]);
  return [value, setValue];
}
