import { create } from 'zustand';

type UpdateCheckResult = 'idle' | 'checking' | 'upToDate' | 'available' | 'failed';

interface UpdateState {
  /** Always null on the dev server, which registers no worker. */
  checker: (() => Promise<'upToDate' | 'available'>) | null;
  result: UpdateCheckResult;
  setChecker: (checker: UpdateState['checker']) => void;
  checkNow: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  checker: null,
  result: 'idle',
  setChecker: (checker) => set({ checker }),
  checkNow: async () => {
    const { checker } = get();
    if (!checker) return;
    set({ result: 'checking' });
    try {
      set({ result: await checker() });
    } catch {
      set({ result: 'failed' });
    }
  },
}));
