import { create } from 'zustand';

/** A catalog that changed since this browser last loaded it. */
export interface CatalogChange {
  name: 'motors' | 'components';
  added: number;
  removed: number;
}

interface CatalogNoticeState {
  changes: CatalogChange[];
  /** Report a change; a second report for the same catalog replaces the first. */
  report: (change: CatalogChange) => void;
  dismiss: () => void;
}

/** The catalog-updated banner's state (CatalogNotice.tsx). Fed by catalogUpdates.ts. */
export const useCatalogNoticeStore = create<CatalogNoticeState>((set) => ({
  changes: [],
  report: (change) => set((s) => ({ changes: [...s.changes.filter((c) => c.name !== change.name), change] })),
  dismiss: () => set({ changes: [] }),
}));
