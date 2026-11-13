import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';
import { DialogButton, DialogActions } from '../common/DialogButton';

import { nameTaken } from '../../services/app/names';
import { StackedField } from '../common/StackedField';
export function DesignPropertiesDialog({
  title,
  confirmLabel,
  initialName,
  takenNames = [],
  duplicateText,
  onCancel,
  onConfirm,
}: {
  title: string;
  confirmLabel: string;
  initialName: string;
  takenNames?: string[];
  duplicateText?: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  // A frame later, or the focus trap's own focus move undoes the select().
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.select());
    return () => cancelAnimationFrame(id);
  }, []);

  const trimmed = name.trim();
  const duplicate = nameTaken(trimmed, takenNames);
  const submit = () => {
    if (trimmed === '') return;
    onConfirm(trimmed);
  };

  return (
    <Dialog id="designProperties" title={title} onClose={onCancel} layer="top" layout="pad" expandable={false}>
      <StackedField
        id="design-name"
        label={t('library.name')}
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        maxLength={80}
      />

      {duplicate && <p className="mt-2 text-xs text-warn-300">{duplicateText ?? t('library.duplicateName')}</p>}

      <DialogActions>
        <DialogButton onClick={onCancel} variant="secondary">
          {t('common.cancel')}
        </DialogButton>
        <DialogButton onClick={submit} disabled={trimmed === ''} variant="primary">
          {confirmLabel}
        </DialogButton>
      </DialogActions>
    </Dialog>
  );
}
