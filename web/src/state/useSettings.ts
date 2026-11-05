import { createContext, useContext } from 'react';
import type { Settings } from '../services/storage/settings';

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const SettingsContext = createContext<SettingsCtx | null>(null);

export function useSettings(): SettingsCtx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
