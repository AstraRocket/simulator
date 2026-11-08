import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirm } from '../../state/confirmStore';

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

  return { selectedId, dirty, select, settle, close, onDirtyChange, err, setErr };
}

export function useReportDirty(dirty: boolean, onDirtyChange: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
}
