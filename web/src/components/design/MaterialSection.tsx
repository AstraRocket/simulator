import { useTranslation } from 'react-i18next';
import { MaterialPicker } from './MaterialPicker';
import { FieldRow, sectionFields, type CommitEditProps } from './DimensionFields';

export function MaterialSection({ node, onCommitChange }: CommitEditProps) {
  return (
    <div className="space-y-2 border-t border-line/5 pt-3">
      <MaterialPicker
        value={typeof node.materialName === 'string' ? node.materialName : undefined}
        density={typeof node.density === 'number' ? node.density : undefined}
        onChange={(name, d, group) =>
          onCommitChange({
            materialName: name,
            density: d || undefined,
            // Without the group the .ork writer files it under the previous material's.
            materialGroup: (name && group) || undefined,
          })
        }
      />
      {sectionFields(node, 'material').map((f) => (
        <FieldRow key={f.key} node={node} field={f} onChange={onCommitChange} />
      ))}
    </div>
  );
}

function LineMaterialPicker({ label, node, onCommitChange }: CommitEditProps & { label: string }) {
  return (
    <MaterialPicker
      type="line"
      label={label}
      value={typeof node.lineMaterialName === 'string' ? node.lineMaterialName : undefined}
      density={typeof node.lineDensity === 'number' ? node.lineDensity : undefined}
      onChange={(name, d) => onCommitChange({ lineMaterialName: name, lineDensity: d || undefined })}
    />
  );
}

export function RecoveryMaterialSection({ node, onCommitChange }: CommitEditProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 border-t border-line/5 pt-3">
      <MaterialPicker
        type="surface"
        label={t(node.type === 'streamer' ? 'material.strip' : 'material.canopy')}
        value={typeof node.surfaceMaterialName === 'string' ? node.surfaceMaterialName : undefined}
        density={typeof node.surfaceDensity === 'number' ? node.surfaceDensity : undefined}
        onChange={(name, d) => onCommitChange({ surfaceMaterialName: name, surfaceDensity: d || undefined })}
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
