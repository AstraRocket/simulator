import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { MaterialPicker } from './MaterialPicker';
import { FieldRow, type CommitEditProps } from './DimensionFields';
import { sectionFields } from './fieldHelpers';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { MATERIAL_KEYS, type MaterialKeys } from '../../services/design/materialSlots';
import type { MaterialType } from '../../services/materials/materialTypes';

/** One material slot's picker, read and written through its persistence keys. */
export function MaterialSlotPicker({
  node,
  keys,
  type,
  label,
  use,
  onCommitChange,
}: {
  node: ComponentNode;
  keys: MaterialKeys;
  type?: MaterialType;
  label?: string;
  use?: ComponentProps<typeof MaterialPicker>['use'];
  onCommitChange: (patch: Partial<ComponentNode>) => void;
}) {
  const name = node[keys.name];
  const density = node[keys.density];
  return (
    <MaterialPicker
      type={type}
      label={label}
      use={use}
      value={typeof name === 'string' ? name : undefined}
      density={typeof density === 'number' && Number.isFinite(density) ? density : undefined}
      onChange={(picked, d, group, shear) =>
        onCommitChange({
          [keys.name]: picked,
          [keys.density]: d || undefined,
          // Without the group the .ork writer files it under the previous material's, or the fallback's.
          ...(keys.group ? { [keys.group]: (picked && group) || undefined } : {}),
          // Unset, desktop takes the modulus of its own material of that name and density.
          ...(keys.shear ? { [keys.shear]: (picked && shear) || undefined } : {}),
        })
      }
    />
  );
}

export function MaterialSection({ node, onCommitChange }: CommitEditProps) {
  return (
    <div className="space-y-2 border-t border-line/5 pt-3">
      <MaterialSlotPicker node={node} keys={MATERIAL_KEYS.bulk} onCommitChange={onCommitChange} />
      {sectionFields(node, 'material').map((f) => (
        <FieldRow key={f.key} node={node} field={f} onChange={onCommitChange} />
      ))}
    </div>
  );
}

function LineMaterialPicker({ label, node, onCommitChange }: CommitEditProps & { label: string }) {
  return (
    <MaterialSlotPicker
      node={node}
      keys={MATERIAL_KEYS.line}
      type="line"
      label={label}
      onCommitChange={onCommitChange}
    />
  );
}

export function RecoveryMaterialSection({ node, onCommitChange }: CommitEditProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 border-t border-line/5 pt-3">
      <MaterialSlotPicker
        node={node}
        keys={MATERIAL_KEYS.surface}
        type="surface"
        label={t(node.type === 'streamer' ? 'material.strip' : 'material.canopy')}
        onCommitChange={onCommitChange}
      />
      {node.type === 'parachute' && (
        <LineMaterialPicker label={t('material.lines')} node={node} onCommitChange={onCommitChange} />
      )}
    </div>
  );
}

export function CordMaterialSection({ node, onCommitChange }: CommitEditProps) {
  const { t } = useTranslation();
  return (
    <div className="border-t border-line/5 pt-3">
      <LineMaterialPicker label={t('material.cord')} node={node} onCommitChange={onCommitChange} />
    </div>
  );
}
