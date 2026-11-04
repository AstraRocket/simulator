import { nsKey } from '../../src/services/storage/storageKeys';
import { afterEach } from 'vitest';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { SettingsProvider } from '../../src/state/SettingsProvider';
import '../../src/i18n';

// RTL only auto-cleans with Vitest globals on, which this project does not use.
afterEach(cleanup);

/** `SettingsProvider` reads localStorage synchronously; call `seedSettings` before rendering. */
export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

const SETTINGS_KEY = nsKey('settings:v1');

export function seedSettings(partial: Record<string, unknown>): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(partial));
}

export function readSettings(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
}
