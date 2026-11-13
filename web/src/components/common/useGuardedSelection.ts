import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirm, confirmDelete } from '../../state/confirmStore';
import { errorText } from '../../i18n/keyedError';

export function useGuardedSelection(discardMessage: string) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Stable: the editor passes it to an effect that would otherwise rerun every keystroke.
  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  const select = async (id: string | null): Promise<boolean> => {
    if (dirty && id !== selectedId) {
      const ok = await confirm({ message: discardMessage, confirmLabel: t('common.discard'), danger: true });
      if (!ok) return false;
      setDirty(false);
    }
    setSelectedId(id);
    setErr(null);
    return true;
  };

  const close = async (onClose: () => void): Promise<void> => {
    if (dirty && !(await confirm({ message: discardMessage, confirmLabel: t('common.discard'), danger: true }))) return;
    onClose();
  };

  const settle = (id: string | null) => {
    setDirty(false);
    setSelectedId(id);
  };

  /** Asks, then deletes and clears the selection; `remove` returning false keeps it (the error is already set). */
  const removeWith = async (message: string, remove: () => Promise<unknown>): Promise<void> => {
    if (!(await confirmDelete(message))) return;
    setErr(null);
    try {
      if ((await remove()) !== false) settle(null);
    } catch (e) {
      setErr(errorText(e, t));
    }
  };

  return { selectedId, dirty, select, settle, close, onDirtyChange, err, setErr, removeWith };
}

export function useReportDirty(dirty: boolean, onDirtyChange: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
}
