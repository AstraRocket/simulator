import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { PropertyPanel } from './PropertyPanel';
import { useSelectedComponent } from './useSelectedComponent';

// Opens on `selectionSeq`, not the id, so tapping the same part after closing opens it again.
export function ComponentDialog() {
  const { t } = useTranslation();
  const seq = useWorkspaceStore((s) => s.selectionSeq);
  const sel = useSelectedComponent();

  // During render, not an effect, which would paint a frame with the editor closed.
  const [seen, setSeen] = useState(seq);
  const [open, setOpen] = useState(false);
  if (seq !== seen) {
    setSeen(seq);
    setOpen(true);
  }

  if (!open || !sel.node) return null;

  return (
    <Dialog id="component-editor" title={t('prop.editTitle')} onClose={() => setOpen(false)}>
      <PropertyPanel key={sel.node.id ?? ''} flush {...sel} />
    </Dialog>
  );
}
