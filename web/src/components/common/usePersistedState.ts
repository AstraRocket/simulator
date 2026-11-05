import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useLatestRef } from './useLatestRef';

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
