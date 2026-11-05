import { create } from 'zustand';

interface RequestState<O, R> {
  request: (O & { resolve: (v: R) => void }) | null;
  open: (opts: O) => Promise<R>;
  settle: (result: R) => void;
}

// A new request while one is open resolves the previous one with `dismissed`, so no resolver is dropped.
export function createRequestStore<O extends object, R>(dismissed: R) {
  return create<RequestState<O, R>>((set, get) => ({
    request: null,
    open: (opts) =>
      new Promise<R>((resolve) => {
        get().request?.resolve(dismissed);
        set({ request: { ...opts, resolve } });
      }),
    settle: (result) => {
      const r = get().request;
      if (!r) return;
      set({ request: null });
      r.resolve(result);
    },
  }));
}
