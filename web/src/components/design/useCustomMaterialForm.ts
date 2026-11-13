import { useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  materialsForType,
  addCustom,
  checkedMaterialName,
  DEFAULT_CUSTOM_GROUP,
} from '../../services/materials/materials';
import type { DocumentMaterial } from '../../services/materials/documentMaterials';
import { useWorkspaceStore } from '../../state/store';
import type { Material, MaterialType } from '../../services/materials/materialTypes';
import type { FieldUnit } from '../../prefs/useUnits';
import { useLatest } from '../common/useLatest';
import { errorText } from '../../i18n/keyedError';

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
  onChange: (name: string | undefined, density: number, group?: string, shearModulus?: number) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState(DEFAULT_CUSTOM_GROUP);
  // In the field's unit, not SI.
  const [dens, setDens] = useState<number | null>(null);
  // Pa, bulk only; null while empty.
  const [shear, setShear] = useState<number | null>(null);
  // Starts unchecked, as desktop's `MaterialModel` opens `CustomMaterialDialog`.
  const [toLibrary, setToLibrary] = useState(false);
  const addDocumentMaterial = useWorkspaceStore((s) => s.addDocumentMaterial);
  const [addErr, setAddErr] = useState<string | null>(null);
  const { observe } = useLatest();

  const submitCustom = async () => {
    try {
      // `toSi`, not `fromUi`: it applies the density ceiling. NaN makes `addCustom` reject with a message.
      const si = fu.toSi(dens) ?? NaN;
      const shearModulus = type === 'bulk' && shear ? shear : undefined;
      if (design && !toLibrary) {
        const m: DocumentMaterial = {
          name: checkedMaterialName(name, si),
          type,
          density: si,
          ...(shearModulus ? { shearModulus } : {}),
          group,
        };
        addDocumentMaterial(m);
        onChange(m.name, m.density, m.group, m.shearModulus);
      } else {
        const live = observe();
        const next = await addCustom(name, type, si, group, shearModulus);
        const list = await materialsForType(type);
        if (!live()) return; // selecting another component unmounts this
        setMats(list);
        const added = next[0];
        if (added) onChange(added.name, added.density, added.group, added.shearModulus);
      }
      setAdding(false);
      setToLibrary(false);
      setName('');
      setDens(null);
      setShear(null);
      setGroup(DEFAULT_CUSTOM_GROUP);
      setAddErr(null);
    } catch (e) {
      setAddErr(errorText(e, t));
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
    shear,
    setShear,
    toLibrary,
    setToLibrary,
    addErr,
    setAddErr,
    submitCustom,
  };
}
