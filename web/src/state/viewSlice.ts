import type { StateCreator } from 'zustand';
import { isResultView, type Tab, type DesignPane, type TwoDView, type ViewMode } from './tabs';
import type { WorkspaceState } from './store';

export interface ViewSlice {
  tab: Tab;
  designPane: DesignPane;
  view: ViewMode;
  twoD: TwoDView;
  roll: number; // radians, kept in [0, 2π)
  resetKey: number;

  setTab: (tab: Tab) => void;
  setDesignPane: (pane: DesignPane) => void;
  setView: (view: ViewMode) => void;
  setTwoD: (v: TwoDView) => void;
  setRoll: (roll: number) => void;
  rollBy: (d: number) => void;
  resetView: () => void;
}

// Every `view` write that can change the tab goes through this, or Results can open empty.
export function showing(s: { tab: Tab; designPane: DesignPane }, view: ViewMode): Partial<WorkspaceState> {
  if (s.tab === 'sim' || (s.tab === 'design' && s.designPane === 'stats')) return { view };
  return isResultView(view) ? { view, tab: 'results' } : { view, tab: 'design', designPane: 'sketch' };
}

export const createViewSlice: StateCreator<WorkspaceState, [], [], ViewSlice> = (set) => ({
  tab: 'design',
  designPane: 'stats',
  view: '2d',
  twoD: 'side',
  roll: 0,
  resetKey: 0,

  setTab: (tab) =>
    set((s) => {
      if (tab === 'results') return { tab, view: isResultView(s.view) ? s.view : 'flight' };
      if (tab === 'design') return { tab, view: isResultView(s.view) ? '2d' : s.view };
      return { tab };
    }),
  setDesignPane: (designPane) =>
    set((s) => ({ tab: 'design', designPane, view: isResultView(s.view) ? '2d' : s.view })),
  setView: (view) => set((s) => showing(s, view)),
  setTwoD: (twoD) => set({ twoD }),
  setRoll: (roll) => set({ roll }),
  rollBy: (d) =>
    set((s) => {
      const x = (s.roll + d) % (2 * Math.PI);
      return { roll: x < 0 ? x + 2 * Math.PI : x };
    }),
  resetView: () => set((s) => ({ roll: 0, resetKey: s.resetKey + 1 })),
});
