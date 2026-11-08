import { create } from 'zustand';
import { onCatalogChange, type CatalogChange } from '../services/app/catalogUpdates';

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

onCatalogChange((change) => useCatalogNoticeStore.getState().report(change));
