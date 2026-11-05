import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  materialsForType,
  addCustom,
  groupsOf,
  checkedMaterialName,
  DEFAULT_CUSTOM_GROUP,
} from '../../services/materials/materials';
import type { DocumentMaterial } from '../../services/materials/documentMaterials';
import { useWorkspaceStore } from '../../state/store';
import type { Material, MaterialType } from '../../services/materials/materialTypes';
import { NumberInput } from '../common/NumberInput';
import type { FieldUnit } from '../../prefs/useUnits';
import { DENSITY_LABEL, groupLabel } from './materialUnits';
import { listWriteErrorText } from '../../services/storage/jsonListStore';
import { useLatest } from '../common/useLatest';
import { Check } from '../common/Check';
import { DialogButton } from '../common/DialogButton';
import { StatusLine } from '../common/StatusLine';

/** Held by `MaterialPicker`, not the form: Cancel closes the form and the typed name and density wait for its return. */
export function useCustomMaterialForm({
  type,
  design,
  fu,
  setMats,
  onChange,
}: {
  type: MaterialType;
  design: boolean;
  fu: FieldUnit;
  setMats: Dispatch<SetStateAction<Material[]>>;
  onChange: (name: string | undefined, density: number, group?: string) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState(DEFAULT_CUSTOM_GROUP);
  // In the field's unit, not SI.
  const [dens, setDens] = useState<number | null>(null);
  // Starts unchecked, as desktop's `MaterialModel` opens `CustomMaterialDialog`.
  const [toLibrary, setToLibrary] = useState(false);
  const addDocumentMaterial = useWorkspaceStore((s) => s.addDocumentMaterial);
  const [addErr, setAddErr] = useState<string | null>(null);
  const { observe } = useLatest();

  const submitCustom = async () => {
    try {
      // `toSi`, not `fromUi`: it applies the density ceiling. NaN makes `addCustom` reject with a message.
      const si = fu.toSi(dens) ?? NaN;
      if (design && !toLibrary) {
        const m: DocumentMaterial = { name: checkedMaterialName(name, si), type, density: si, group };
        addDocumentMaterial(m);
        onChange(m.name, m.density, m.group);
      } else {
        const live = observe();
        const next = await addCustom(name, type, si, group);
        const list = await materialsForType(type);
        if (!live()) return; // selecting another component unmounts this
        setMats(list);
        const added = next[0];
        if (added) onChange(added.name, added.density, added.group);
      }
      setAdding(false);
      setToLibrary(false);
      setName('');
      setDens(null);
      setGroup(DEFAULT_CUSTOM_GROUP);
      setAddErr(null);
    } catch (e) {
      setAddErr(listWriteErrorText(e, t));
    }
  };

  return {
    adding,
    setAdding,
    name,
    setName,
    group,
    setGroup,
    dens,
    setDens,
    toLibrary,
    setToLibrary,
    addErr,
    setAddErr,
    submitCustom,
  };
}

export function CustomMaterialForm({
  form: {
    setAdding,
    name,
    setName,
    group,
    setGroup,
    dens,
    setDens,
    toLibrary,
    setToLibrary,
    addErr,
    setAddErr,
    submitCustom,
  },
  mats,
  type,
  design,
  fu,
}: {
  form: ReturnType<typeof useCustomMaterialForm>;
  mats: Material[];
  type: MaterialType;
  design: boolean;
  fu: FieldUnit;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-canvas p-2 ring-1 ring-line/10">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('material.namePlaceholder')}
        aria-label={t('material.namePlaceholder')}
        className="w-full rounded bg-surface px-2 py-1.5 text-sm ring-1 ring-line/10 placeholder:text-ink-faint"
      />
      <label className="flex items-center justify-between gap-2 text-xs text-ink-muted">
        {t('material.group')}
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="min-w-0 flex-1 rounded bg-surface px-2 py-1.5 text-sm text-ink-strong ring-1 ring-line/10"
        >
          {groupsOf(mats).map((g) => (
            <option key={g} value={g}>
              {groupLabel(t, g)}
            </option>
          ))}
        </select>
      </label>
      <NumberInput
        value={dens}
        onChange={setDens}
        min={0}
        step={fu.step(10)}
        placeholder={`${t(DENSITY_LABEL[type])} (${fu.sym})`}
        ariaLabel={`${t(DENSITY_LABEL[type])} (${fu.sym})`}
        className="w-full rounded bg-surface px-2 py-1.5 text-sm tabular-nums ring-1 ring-line/10 placeholder:text-ink-faint"
      />
      {design && (
        <Check
          checked={toLibrary}
          onChange={setToLibrary}
          label={t('material.addToLibrary')}
          className="text-xs text-ink-muted"
        />
      )}
      <StatusLine tone="danger">{addErr}</StatusLine>
      <div className="flex gap-2">
        <DialogButton variant="primary" size="sm" className="flex-1" onClick={submitCustom}>
          {t('material.save')}
        </DialogButton>
        <DialogButton
          size="sm"
          className="flex-1"
          onClick={() => {
            setAdding(false);
            setToLibrary(false);
            setAddErr(null);
          }}
        >
          {t('material.cancel')}
        </DialogButton>
      </div>
    </div>
  );
}
