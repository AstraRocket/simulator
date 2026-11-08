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
import { listWriteErrorText } from '../../services/storage/jsonListStore';
import { useLatest } from '../common/useLatest';

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
