import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { DEFAULT_CUSTOM_GROUP } from '../../services/materials/materials';
import { MATERIAL_TYPES, type MaterialType } from '../../services/materials/materialTypes';
import type { ScopedMaterial } from '../../services/materials/myMaterials';
import { EditorFooter, EditorHeading } from '../common/MasterDetail';
import { useReportDirty } from '../common/useGuardedSelection';
import { NumberInput } from '../common/NumberInput';
import { UnitChip } from '../common/UnitChip';
import { DENSITY_LABEL, QUANTITY, groupLabel } from './materialUnits';
import { Check } from '../common/Check';
import { ShearModulusInput } from './ShearModulusInput';
import { fmtList } from '../../i18n/format';
import { STACKED_INPUT, STACKED_LABEL as labelClass, StackedField } from '../common/StackedField';

const field = `mt-1 ${STACKED_INPUT}`;

// Keyed on the selection by the parent, so remounting re-seeds the state.
export function MaterialEditor({
  material,
  groups,
  usedBy,
  onSave,
  onDelete,
  onDirtyChange,
  onBack,
}: {
  material: ScopedMaterial | null;
  groups: (type: MaterialType) => string[];
  usedBy: string[];
  onSave: (draft: ScopedMaterial) => Promise<string | null>;
  onDelete?: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const start: ScopedMaterial = material ?? {
    name: '',
    type: 'bulk',
    density: 0,
    group: DEFAULT_CUSTOM_GROUP,
    scope: 'library',
  };
  const [name, setName] = useState(start.name);
  const [type, setType] = useState<MaterialType>(start.type);
  const fu = useUnits().at(unitScope('material', type), QUANTITY[type]);
  // In the field's unit; null while empty.
  const [dens, setDens] = useState<number | null>(material ? fu.toUi(material.density) : null);
  // Pa; null while empty.
  const [shear, setShear] = useState<number | null>(material?.shearModulus || null);
  const [group, setGroup] = useState(start.group || DEFAULT_CUSTOM_GROUP);
  const [toLibrary, setToLibrary] = useState(start.scope === 'library');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const si = fu.toSi(dens) ?? NaN;
  const draft: ScopedMaterial = {
    name,
    type,
    density: si,
    ...(type === 'bulk' && shear ? { shearModulus: shear } : {}),
    group,
    scope: toLibrary ? 'library' : 'design',
  };
  const dirty = material
    ? name !== material.name ||
      !(si === material.density || fu.fmt(si) === fu.fmt(material.density)) ||
      (draft.shearModulus ?? 0) !== (material.shearModulus ?? 0) ||
      group !== (material.group || DEFAULT_CUSTOM_GROUP) ||
      draft.scope !== material.scope
    : name.trim() !== '' || dens !== null || shear !== null;

  useReportDirty(dirty, onDirtyChange);

  const revert = () => {
    setName(start.name);
    setType(start.type);
    setDens(material ? fu.toUi(material.density) : null);
    setShear(material?.shearModulus || null);
    setGroup(start.group || DEFAULT_CUSTOM_GROUP);
    setToLibrary(start.scope === 'library');
    setErr(null);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    // A density typed as it was shown is the stored one, not a rounding of it.
    const unchanged = material && fu.fmt(si) === fu.fmt(material.density);
    setErr(await onSave(unchanged ? { ...draft, density: material.density } : draft));
    setSaving(false);
  };

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
        <EditorHeading
          onBack={onBack}
          backLabel={t('myMaterials.back')}
          title={material ? t(`myMaterials.type.${material.type}`) : t('myMaterials.new')}
        />

        <StackedField
          id="mat-name"
          label={t('myMaterials.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        {!material && (
          <>
            <label htmlFor="mat-type" className={labelClass}>
              {t('myMaterials.typeLabel')}
            </label>
            <select
              id="mat-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as MaterialType);
                setDens(null);
                setShear(null);
                setGroup(DEFAULT_CUSTOM_GROUP);
              }}
              className={field}
            >
              {MATERIAL_TYPES.map((k) => (
                <option key={k} value={k}>
                  {t(`myMaterials.type.${k}`)}
                </option>
              ))}
            </select>
          </>
        )}

        {/* The box has no id to label, so its aria-label (with the unit) names it. */}
        <span className={labelClass} aria-hidden="true">
          {t(DENSITY_LABEL[type])}
        </span>
        <div className="mt-1 flex items-center gap-2">
          <NumberInput
            value={dens}
            onChange={setDens}
            min={0}
            step={fu.step(10)}
            ariaLabel={`${t(DENSITY_LABEL[type])} (${fu.sym})`}
            className="w-full rounded-lg bg-raised px-3 py-2 text-sm tabular-nums text-ink-strong ring-1 ring-line/10"
          />
          <UnitChip quantity={QUANTITY[type]} scope={unitScope('material', type)} />
        </div>

        {type === 'bulk' && (
          <>
            <span className={labelClass} aria-hidden="true">
              {t('material.shearModulus')}
            </span>
            <div className="mt-1">
              <ShearModulusInput
                value={shear}
                onChange={setShear}
                className="w-full rounded-lg bg-raised px-3 py-2 text-sm tabular-nums text-ink-strong ring-1 ring-line/10"
              />
            </div>
          </>
        )}

        <label htmlFor="mat-group" className={labelClass}>
          {t('material.group')}
        </label>
        <select id="mat-group" value={group} onChange={(e) => setGroup(e.target.value)} className={field}>
          {[...new Set([...groups(type), group])].map((g) => (
            <option key={g} value={g}>
              {groupLabel(t, g)}
            </option>
          ))}
        </select>

        <Check
          checked={toLibrary}
          onChange={setToLibrary}
          label={t('material.addToLibrary')}
          className="mt-4 text-sm text-ink"
        />
        <p className="mt-2 text-xs leading-snug text-ink-faint">{t('myMaterials.scopeNote')}</p>

        {material && (
          <p className="mt-4 text-xs leading-snug text-ink-muted">
            {usedBy.length ? t('myMaterials.usedBy', { parts: fmtList(usedBy) }) : t('myMaterials.usedByNone')}
          </p>
        )}
      </div>

      <EditorFooter
        onDelete={onDelete}
        dirty={dirty}
        onRevert={revert}
        onSave={() => void submit()}
        saveDisabled={!name.trim() || dens === null || saving}
        err={err}
      />
    </>
  );
}
