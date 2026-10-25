import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { DEFAULT_CUSTOM_GROUP } from '../../services/materials/materials';
import { MATERIAL_TYPES, type MaterialType } from '../../services/materials/materialTypes';
import type { ScopedMaterial } from '../../services/materials/myMaterials';
import { EditorFooter, useReportDirty, EditorHeading } from '../common/MasterDetail';
import { NumberInput } from '../common/NumberInput';
import { UnitChip } from '../common/UnitChip';
import { DENSITY_LABEL, QUANTITY, groupLabel } from './materialUnits';
import { Check } from '../common/Check';
import { fmtList } from '../../i18n/format';

const field =
  'mt-1 w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink-strong ring-1 ring-line/10 focus:ring-accent-500';
const labelClass = 'mt-4 block text-xs font-medium text-ink-muted';

/**
 * The detail half of Custom Materials: desktop's `CustomMaterialDialog` as a pane.
 *
 * Name, density and group, and for a new material its type, which desktop also
 * fixes once a material exists. The box under them is desktop's "Add material
 * to application database": ticked, the material is the user's own in this
 * browser; clear, it belongs to the open design and is saved in its `.ork`.
 * A new material starts ticked, as desktop's manager opens the dialog; an
 * existing one starts where it is.
 *
 * Edits are held here and written on Save. The parent mounts it keyed on the
 * selection, so choosing another material re-seeds the fields by remounting.
 */
export function MaterialEditor({
  material,
  groups,
  usedBy,
  onSave,
  onDelete,
  onDirtyChange,
  onBack,
}: {
  /** null for a new material. */
  material: ScopedMaterial | null;
  /** The groups a material of each type can be filed under. */
  groups: (type: MaterialType) => string[];
  /** The parts of the open design made of it, by name. */
  usedBy: string[];
  onSave: (draft: ScopedMaterial) => Promise<string | null>;
  onDelete?: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /** Phone only: the two panes share the width, so the list needs a way back. */
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
  // In the field's unit, as the picker's add form holds it; null while empty.
  const [dens, setDens] = useState<number | null>(material ? fu.toUi(material.density) : null);
  const [group, setGroup] = useState(start.group || DEFAULT_CUSTOM_GROUP);
  const [toLibrary, setToLibrary] = useState(start.scope === 'library');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const si = fu.toSi(dens) ?? NaN;
  const draft: ScopedMaterial = { name, type, density: si, group, scope: toLibrary ? 'library' : 'design' };
  const dirty = material
    ? name !== material.name ||
      !(si === material.density || fu.fmt(si) === fu.fmt(material.density)) ||
      group !== (material.group || DEFAULT_CUSTOM_GROUP) ||
      draft.scope !== material.scope
    : name.trim() !== '' || dens !== null;

  useReportDirty(dirty, onDirtyChange);

  const revert = () => {
    setName(start.name);
    setType(start.type);
    setDens(material ? fu.toUi(material.density) : null);
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

        <label htmlFor="mat-name" className={labelClass}>
          {t('myMaterials.name')}
        </label>
        <input id="mat-name" value={name} onChange={(e) => setName(e.target.value)} className={field} />

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
                // The box reads another quantity now; a figure typed for the old one means nothing.
                setDens(null);
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

        {/* Named by its aria-label, which carries the unit: the box has no id to point a label at. */}
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
