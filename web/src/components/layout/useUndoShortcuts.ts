import { useEffect } from 'react';
import { useWorkspaceStore } from '../../state/store';
import { isTextEntry } from '../common/isTextEntry';
import { topmostSurface } from '../common/useFocusTrap';

// Skipped in a text field: edits commit on blur, so it would undo the last design edit, not the typing.
const UNDO_SURFACE = '[data-dialog="component-editor"]';

const blockedBySurface = (): boolean => {
  const top = topmostSurface();
  return top !== null && !top.matches(UNDO_SURFACE);
};

export function useUndoShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (isTextEntry(document.activeElement) || blockedBySurface()) return;
      // A non-Latin layout sends its own letter, so fall back to the key position.
      const key = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : /^Key([A-Z])$/.exec(e.code)?.[1]?.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useWorkspaceStore.getState().undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        useWorkspaceStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
