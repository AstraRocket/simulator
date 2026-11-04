import { create } from 'zustand';

interface HelpState {
  /** Null while closed; `''` is the docs index, a different state. */
  page: string | null;
  openHelp: (page?: string) => void;
  closeHelp: () => void;
}

export const useHelpStore = create<HelpState>((set) => ({
  page: null,
  openHelp: (page = '') => set({ page }),
  closeHelp: () => set({ page: null }),
}));
