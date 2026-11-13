import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import type { PickerType } from '../../services/parts/componentDb';
import { DEFAULT_CUSTOM_MFR, saveCustomPart, type PartMeta } from '../../services/parts/customParts';
import { PartMetaFields } from './PartMetaFields';
import { Dialog } from '../common/Dialog';
import { errorText } from '../../i18n/keyedError';
import { DialogButton, DialogActions } from '../common/DialogButton';
import { StatusLine } from '../common/StatusLine';
import { smallButton } from '../common/smallButton';
import { DialogOpener } from '../common/DialogOpener';

export function SavePartButton({ node, type }: { node: ComponentNode; type: PickerType }) {
  const { t } = useTranslation();
  // Mounted only while open, so fields seed in their initializers.
  return (
    <DialogOpener
      className={smallButton('row', 'soft', 'w-full')}
      dialog={(close) => <SavePartDialog node={node} type={type} onClose={close} />}
    >
      {t('picker.save')}
    </DialogOpener>
  );
}

function SavePartDialog({ node, type, onClose }: { node: ComponentNode; type: PickerType; onClose: () => void }) {
  const { t } = useTranslation();
  // Seeds are worded at render until the user types (null means untouched): worded in the
  // initializer, a dialog opened before the locale bundle lands would save the English fallback.
  const named = typeof node.name === 'string' && node.name.trim() ? node.name.trim() : null;
  const [typedPartNo, setPartNo] = useState<string | null>(named);
  const [typedMfr, setMfr] = useState<string | null>(null);
  const partNo = typedPartNo ?? t(`part.${node.type}`, { defaultValue: '' });
  const mfr = typedMfr ?? t('picker.saveDefaultMfr', { defaultValue: DEFAULT_CUSTOM_MFR });
  const [desc, setDesc] = useState('');
  const onMeta = (patch: Partial<PartMeta>) => {
    if (patch.partNo !== undefined) setPartNo(patch.partNo);
    if (patch.mfr !== undefined) setMfr(patch.mfr);
    if (patch.desc !== undefined) setDesc(patch.desc);
  };
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!partNo.trim() || saving) return;
    setErr(null);
    setSaving(true);
    try {
      await saveCustomPart(node, type, { mfr, partNo, desc });
      onClose();
    } catch (e) {
      setErr(errorText(e, t));
      setSaving(false);
    }
  };

  return (
    <Dialog id="savePart" title={t('picker.saveTitle')} onClose={onClose} layout="pad" expandable={false}>
      <PartMetaFields
        idPrefix="save"
        autoFocus
        meta={{ partNo, mfr, desc }}
        onChange={onMeta}
        onEnter={() => void submit()}
      />

      <p className="mt-4 text-xs leading-snug text-ink-faint">{t('picker.saveHint')}</p>
      {node.children && node.children.length > 0 && (
        <p className="mt-2 text-xs leading-snug text-warn-300">{t('picker.saveNoChildren')}</p>
      )}
      {/* Always mounted: a live region created with its text is not announced. */}
      <StatusLine tone="danger" className="mt-2">
        {err}
      </StatusLine>

      <DialogActions>
        <DialogButton onClick={onClose} variant="secondary">
          {t('common.cancel')}
        </DialogButton>
        <DialogButton onClick={() => void submit()} disabled={!partNo.trim() || saving} variant="primary">
          {t('common.save')}
        </DialogButton>
      </DialogActions>
    </Dialog>
  );
}
