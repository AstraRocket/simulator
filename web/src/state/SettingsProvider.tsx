import { createContext, useCallback, useContext, useMemo, useState, type ReactNode, useEffect, useRef } from 'react';
import {
  defaultSettings,
  isSettingsStorageKey,
  loadSettings,
  loadStoredSettings,
  saveSettings,
  unknownStoredSettings,
  type Settings,
} from '../services/storage/settings';
import { applyTheme, followSystemTheme } from '../services/app/theme';
import { useWorkspaceStore } from './store';

// Deferred: a zustand write inside `setSettings`'s updater is a store write during render.
const reportRefused = () => {
  queueMicrotask(() => useWorkspaceStore.getState().warnStorageFull());
};

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    applyTheme(settings.theme);
    return followSystemTheme(settings.theme);
  }, [settings.theme]);

  // Only read, never written, so two tabs cannot echo one change.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (isSettingsStorageKey(e.key)) setSettings(loadSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Persist from events, never an effect on `settings`: that would drop a newer build's keys on mount.
  const unsaved = useRef<Partial<Settings>>({});
  const update = useCallback(
    (patch: Partial<Settings>) =>
      setSettings((s) => {
        const next = { ...(loadStoredSettings() ?? s), ...unsaved.current, ...patch };
        if (saveSettings({ ...unknownStoredSettings(), ...next })) unsaved.current = {};
        else {
          unsaved.current = { ...unsaved.current, ...patch };
          reportRefused();
        }
        return next;
      }),
    [],
  );
  const reset = useCallback(() => {
    const fresh = defaultSettings();
    if (!saveSettings(fresh)) reportRefused();
    setSettings(fresh);
  }, []);
  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
