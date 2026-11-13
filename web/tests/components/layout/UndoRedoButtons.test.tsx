// @vitest-environment jsdom
// cspell:ignore Strg -- German for Ctrl
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { UndoRedoButtons } from '../../../src/components/layout/UndoRedoButtons';
import { renderWithProviders } from '../../testing/renderWithProviders';
import i18n from '../../../src/i18n';

const platform = (value: string) => vi.spyOn(navigator, 'platform', 'get').mockReturnValue(value);

describe('UndoRedoButtons shortcut tooltips', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
  });

  it('names Ctrl off Apple platforms', () => {
    platform('Win32');
    renderWithProviders(<UndoRedoButtons />);
    expect(screen.getByRole('button', { name: 'Undo' }).title).toBe('Undo (Ctrl+Z)');
    expect(screen.getByRole('button', { name: 'Redo' }).title).toBe('Redo (Ctrl+Shift+Z)');
  });

  it("uses the keyboard's own key name, Strg in German", async () => {
    platform('Win32');
    await i18n.changeLanguage('de');
    renderWithProviders(<UndoRedoButtons />);
    expect(screen.getByRole('button', { name: i18n.t('edit.undo') }).title).toContain('(Strg+Z)');
  });

  it('shows the Command key on a Mac', () => {
    platform('MacIntel');
    renderWithProviders(<UndoRedoButtons />);
    expect(screen.getByRole('button', { name: 'Undo' }).title).toBe('Undo (⌘Z)');
    expect(screen.getByRole('button', { name: 'Redo' }).title).toBe('Redo (⇧⌘Z)');
  });
});
