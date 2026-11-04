import { create } from 'zustand';

export interface CatalogChange {
  name: 'motors' | 'components';
  added: number;
  removed: number;
}

interface CatalogNoticeState {
  changes: CatalogChange[];
  report: (change: CatalogChange) => void;
  dismiss: () => void;
}

export const useCatalogNoticeStore = create<CatalogNoticeState>((set) => ({
  changes: [],
  report: (change) => set((s) => ({ changes: [...s.changes.filter((c) => c.name !== change.name), change] })),
  dismiss: () => set({ changes: [] }),
}));
