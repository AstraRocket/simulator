import { useCallback, useEffect, useRef } from 'react';

export interface Latest {
  claim: () => () => boolean;
  /** Like `claim` but without superseding a sibling attempt. */
  observe: () => () => boolean;
  claimSignal: () => AbortSignal;
  /** Aborts the claimed signal without superseding: a `claim` still holds. */
  cancel: () => void;
}

export function useLatest(): Latest {
  const gen = useRef(0);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      gen.current++;
      request.current?.abort();
    },
    [],
  );
  const claim = useCallback(() => {
    const mine = ++gen.current;
    return () => mine === gen.current;
  }, []);
  const observe = useCallback(() => {
    const mine = gen.current;
    return () => mine === gen.current;
  }, []);
  const claimSignal = useCallback(() => {
    request.current?.abort();
    const ctl = new AbortController();
    request.current = ctl;
    return ctl.signal;
  }, []);
  const cancel = useCallback(() => {
    request.current?.abort();
    request.current = null;
  }, []);
  return { claim, observe, claimSignal, cancel };
}
