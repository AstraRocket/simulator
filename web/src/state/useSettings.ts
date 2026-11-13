import { createContext, useContext } from 'react';
import type { Settings } from '../services/storage/settings';

/** The settings keys that hold an object, so a patch can merge into them. */
export type SettingsSection = {
  [K in keyof Settings]: Settings[K] extends readonly unknown[] ? never : Settings[K] extends object ? K : never;
}[keyof Settings];

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** Merges into the latest copy, so two patches in one tick both land. */
  updateSection: <K extends SettingsSection>(key: K, patch: Partial<Settings[K]>) => void;
  reset: () => void;
}

export const SettingsContext = createContext<SettingsCtx | null>(null);

export function useSettings(): SettingsCtx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
