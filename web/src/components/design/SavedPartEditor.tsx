import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { hasMaterial, isRecoveryDevice } from '../../services/design/treeEdit';
import { updateCustomPart, type PartMeta } from '../../services/parts/customParts';
import type { CustomPart } from '../../services/parts/presetStore';
import { AppearanceSection } from './AppearanceSection';
import { FieldRow, FieldSection, ShoulderSections } from './DimensionFields';
import { sectionFields, visibleFields } from './fieldHelpers';
import { OverridesSection } from './OverridesSection';
import { CordMaterialSection, MaterialSection, RecoveryMaterialSection } from './MaterialSection';
import { errorText } from '../../i18n/keyedError';
import { EditorFooter, EditorHeading } from '../common/MasterDetail';
import { useReportDirty } from '../common/useGuardedSelection';
import { PartMetaFields } from './PartMetaFields';

export function SavedPartEditor({
  part,
  onDirtyChange,
  onDelete,
  onBack,
}: {
  part: CustomPart;
  onDirtyChange: (dirty: boolean) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [meta, setMeta] = useState<PartMeta>({ mfr: part.mfr, partNo: part.partNo, desc: part.desc });
  // The field tables key off `type`, which customParts.presetNode strips from the stored node.
  const [node, setNode] = useState<ComponentNode>({ ...part.node, type: part.type } as ComponentNode);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Against the stored part, not a keystroke flag, so typing and deleting a character stays clean.
  const dirty =
    meta.mfr !== part.mfr ||
    meta.partNo !== part.partNo ||
    meta.desc !== part.desc ||
    JSON.stringify(savedShape(node)) !== JSON.stringify(part.node);

  useReportDirty(dirty, onDirtyChange);

  const change = (patch: Partial<ComponentNode>) => setNode((n) => ({ ...n, ...patch }));
  const setMetaField = (patch: Partial<PartMeta>) => setMeta((m) => ({ ...m, ...patch }));

  const revert = () => {
    setMeta({ mfr: part.mfr, partNo: part.partNo, desc: part.desc });
    setNode({ ...part.node, type: part.type } as ComponentNode);
    setErr(null);
  };

  const submit = async () => {
    if (!meta.partNo.trim() || saving) return;
    setErr(null);
    setSaving(true);
    try {
      const saved = await updateCustomPart(part.id, meta, savedShape(node));
      // The labels as stored (trimmed, blank maker filled), so dirty clears.
      setMeta({ mfr: saved.mfr, partNo: saved.partNo, desc: saved.desc });
    } catch (e) {
      setErr(errorText(e, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
        <EditorHeading
          onBack={onBack}
          backLabel={t('picker.savedBack')}
          title={t(`part.${part.type}`, { defaultValue: part.type })}
        />

        <PartMetaFields idPrefix="edit" meta={meta} onChange={setMetaField} />

        <div className="mt-5 space-y-3 border-t border-line/10 pt-4">
          {visibleFields(node, false).map((f) => (
            <FieldRow key={f.key} node={node} field={f} onChange={change} />
          ))}

          <ShoulderSections node={node} onChange={change} />
          <FieldSection node={node} title={t('prop.motor')} fields={sectionFields(node, 'motor')} onChange={change} />

          {hasMaterial(node.type) && <MaterialSection node={node} onCommitChange={change} />}
          {isRecoveryDevice(node.type) && <RecoveryMaterialSection node={node} onCommitChange={change} />}
          {node.type === 'shockcord' && <CordMaterialSection node={node} onCommitChange={change} />}
          <AppearanceSection node={node} onCommitChange={change} />
          <OverridesSection node={node} onChange={change} />
        </div>
      </div>

      <EditorFooter
        onDelete={onDelete}
        dirty={dirty}
        onRevert={revert}
        onSave={() => void submit()}
        saveDisabled={!meta.partNo.trim() || saving}
        err={err}
      />
    </>
  );
}

// Shared by save and the dirty check so they agree.
function savedShape(node: ComponentNode): Partial<ComponentNode> {
  const { type: _type, ...rest } = node;
  return rest;
}
