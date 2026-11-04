import { useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import {
  materialsForType,
  addCustom,
  customMaterialsVersion,
  onCustomMaterialsChanged,
  groupsOf,
  checkedMaterialName,
  DEFAULT_CUSTOM_GROUP,
} from '../../services/materials/materials';
import {
  byNameThenDensity,
  documentMaterialsOf,
  type DocumentMaterial,
} from '../../services/materials/documentMaterials';
import { useWorkspaceStore } from '../../state/store';
import { ADHESIVE_GROUP, type Material, type MaterialType } from '../../services/materials/materialTypes';
import { UnitChip } from '../common/UnitChip';
import { NumberInput } from '../common/NumberInput';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { DENSITY_LABEL, QUANTITY, groupLabel } from './materialUnits';
import { MyMaterialsDialog } from './MyMaterialsDialog';
import { listWriteErrorText } from '../../services/storage/jsonListStore';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { useLatest } from '../common/useLatest';
import { mathEquals } from '../../services/motors/mathEquals';
import { Check } from '../common/Check';
import { DialogButton } from '../common/DialogButton';
import { StatusLine } from '../common/StatusLine';
import { groupBy } from '../../services/app/collections';

export type MaterialUse = 'structure' | 'fillet';

// Density 0 with name undefined means the engine default. The `.ork` writer needs the group `onChange` carries.
export function MaterialPicker({
  value,
  density: ownDensity,
  onChange,
  type = 'bulk',
  label,
  use = 'structure',
  unsetLabel,
  design = true,
}: {
  value?: string;
  /** SI. */
  density?: number;
  onChange: (name: string | undefined, density: number, group?: string) => void;
  type?: MaterialType;
  label?: string;
  use?: MaterialUse;
  unsetLabel?: string;
  design?: boolean;
}) {
  const { t } = useTranslation();
  const [mats, setMats] = useState<Material[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState(DEFAULT_CUSTOM_GROUP);
  // In the field's unit, not SI.
  const [dens, setDens] = useState<number | null>(null);
  // Starts unchecked, as desktop's `MaterialModel` opens `CustomMaterialDialog`.
  const [toLibrary, setToLibrary] = useState(false);
  const rawDocMats = useWorkspaceStore((s) => s.tree.documentMaterials);
  const addDocumentMaterial = useWorkspaceStore((s) => s.addDocumentMaterial);
  const [addErr, setAddErr] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const libraryVersion = useSyncExternalStore(onCustomMaterialsChanged, customMaterialsVersion, customMaterialsVersion);
  const { observe } = useLatest();
  const u = useUnits();
  const quantity = QUANTITY[type];
  // Per material kind: fabric and cord densities use different units from bulk.
  const scope = unitScope('material', type);
  const fu = u.at(scope, quantity);
  // No fixed decimals: 680 kg/m³ and 0.68 g/cm³ need different counts.
  const density = (si: number) => fu.fmt(si);

  const loaded = useAsyncLoad(() => materialsForType(type), type, { onLoaded: setMats, refresh: libraryVersion });
  const loadErr = loaded.error !== null ? t('material.loadFailed') : null;

  // The whole list, never the filtered one. Density must agree too, as in desktop's `Material.equals`.
  const current = mats.find(
    (m) => m.name === value && (!(ownDensity && ownDensity > 0) || mathEquals(m.density, ownDensity)),
  );
  const docMats = useMemo(
    () =>
      design
        ? documentMaterialsOf({ documentMaterials: rawDocMats }, type)
            .filter((d) => !mats.some((m) => m.name === d.name && mathEquals(m.density, d.density)))
            .sort(byNameThenDensity)
        : [],
    [design, rawDocMats, type, mats],
  );
  const docCurrent = current
    ? undefined
    : docMats.find((m) => m.name === value && (!(ownDensity && ownDensity > 0) || mathEquals(m.density, ownDensity)));
  const own =
    value && !current && !docCurrent
      ? { name: value, density: ownDensity && ownDensity > 0 ? ownDensity : null }
      : null;

  // The current material stays even if filtered, or the select reads as "no material".
  const visible = useMemo(() => {
    if (use === 'fillet') return mats;
    return mats.filter((m) => m.group !== ADHESIVE_GROUP || m.name === current?.name);
  }, [mats, use, current?.name]);

  const groups = useMemo(() => [...groupBy(visible, (m) => m.group).entries()], [visible]);

  const handleSelect = (v: string) => {
    if (v === '__default__') return onChange(undefined, 0);
    if (v === '__add__') return setAdding(true);
    if (v === '__manage__') return setManaging(true);
    if (v.startsWith(DOC_PREFIX)) {
      const d = docMats[Number(v.slice(DOC_PREFIX.length))];
      if (d) onChange(d.name, d.density, d.group);
      return;
    }
    const m = mats.find((x) => x.name === v);
    if (m) onChange(m.name, m.density, m.group);
  };

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

  const shown = current ?? docCurrent;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-ink-soft">{label ?? t('material.title')}</span>
        <span className="tabular-nums text-xs text-ink-muted">
          {shown || own?.density ? (
            <>
              {density(shown ? shown.density : own!.density!)} <UnitChip quantity={quantity} scope={scope} />
            </>
          ) : own ? null : (
            t('material.default')
          )}
        </span>
      </div>
      <select
        value={
          current
            ? current.name
            : docCurrent
              ? `${DOC_PREFIX}${docMats.indexOf(docCurrent)}`
              : own
                ? own.name
                : '__default__'
        }
        onChange={(e) => handleSelect(e.target.value)}
        aria-label={label ?? t('material.title')}
        className="w-full rounded-lg bg-canvas px-2 py-2 text-sm text-ink-strong ring-1 ring-line/10"
      >
        <option value="__default__">{unsetLabel ?? t('material.defaultOption')}</option>
        {/* First, so its value wins over a list entry of the same name. */}
        {own && (
          <optgroup label={t('material.thisPart')}>
            <option value={own.name}>
              {own.name}
              {own.density ? ` · ${fu.fmtSym(own.density)}` : ''}
            </option>
          </optgroup>
        )}
        {docMats.length > 0 && (
          <optgroup label={t('material.inDesign')}>
            {docMats.map((m, i) => (
              <option key={`${m.name}:${m.density}`} value={`${DOC_PREFIX}${i}`}>
                {m.name} · {fu.fmtSym(m.density)}
              </option>
            ))}
          </optgroup>
        )}
        {groups.map(([g, list]) => (
          <optgroup key={g} label={groupLabel(t, g)}>
            {list.map((m) => (
              <option key={`${g}:${m.name}`} value={m.name}>
                {m.custom ? '★ ' : ''}
                {m.name} · {fu.fmtSym(m.density)}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__add__">{t('material.addCustom')}</option>
        <option value="__manage__">{t('material.manage')}</option>
      </select>

      {!shown && !own && !loadErr && (
        <p className="mt-1 text-[11px] leading-snug text-ink-faint">{t('material.defaultHint')}</p>
      )}
      {/* Always mounted: a live region created with its text is not announced. */}
      <StatusLine tone="danger" className="mt-1">
        {loadErr}
      </StatusLine>
      {managing && <MyMaterialsDialog onClose={() => setManaging(false)} />}

      {adding && (
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
      )}
    </div>
  );
}

/** Design materials are keyed by index: a name can match a list entry at another density. */
const DOC_PREFIX = 'doc:';
