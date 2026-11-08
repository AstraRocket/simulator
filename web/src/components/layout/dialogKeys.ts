// No imports: the e2e specs import this without pulling components into their typecheck.

export type HeaderDialog =
  | 'motors'
  | 'report'
  | 'about'
  | 'updates'
  | 'privacy'
  | 'settings'
  | 'library'
  | 'examples'
  | 'print'
  | 'locations'
  | 'parts'
  | 'materials'
  | 'backup'
  | 'restore'
  | 'saveAs';

export type SettingsTab =
  'general' | 'units' | 'colors' | 'materials' | 'playback' | 'sketch' | 'sim' | 'launch' | 'flyer';

export const LIBRARY_TABS = ['mine', 'examples'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];
