import { useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { materialsForType, customMaterialsVersion, onCustomMaterialsChanged } from '../../services/materials/materials';
import { byNameThenDensity, documentMaterialsOf } from '../../services/materials/documentMaterials';
import { useWorkspaceStore } from '../../state/store';
import { ADHESIVE_GROUP, type Material, type MaterialType } from '../../services/materials/materialTypes';
import { UnitChip } from '../common/UnitChip';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { QUANTITY, groupLabel } from './materialUnits';
import { MyMaterialsDialog } from './MyMaterialsDialog';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { mathEquals } from '../../services/motors/mathEquals';
import { StatusLine } from '../common/StatusLine';
import { groupBy } from '../../services/app/collections';
import { CustomMaterialForm } from './CustomMaterialForm';
import { useCustomMaterialForm } from './useCustomMaterialForm';

export type MaterialUse = 'structure' | 'fillet';

// Density 0 with name undefined means the engine default. The `.ork` writer needs the group `onChange` carries.
// eslint-disable-next-line complexity -- one select's option groups and its readout, which read best together
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
  const rawDocMats = useWorkspaceStore((s) => s.tree.documentMaterials);
  const [managing, setManaging] = useState(false);
  const libraryVersion = useSyncExternalStore(onCustomMaterialsChanged, customMaterialsVersion, customMaterialsVersion);
  const u = useUnits();
  const quantity = QUANTITY[type];
  // Per material kind: fabric and cord densities use different units from bulk.
  const scope = unitScope('material', type);
  const fu = u.at(scope, quantity);
  // No fixed decimals: 680 kg/m³ and 0.68 g/cm³ need different counts.
  const density = (si: number) => fu.fmt(si);
  const form = useCustomMaterialForm({ type, design, fu, setMats, onChange });

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
    if (v === '__add__') return form.setAdding(true);
    if (v === '__manage__') return setManaging(true);
    if (v.startsWith(DOC_PREFIX)) {
      const d = docMats[Number(v.slice(DOC_PREFIX.length))];
      if (d) onChange(d.name, d.density, d.group);
      return;
    }
    const m = mats.find((x) => x.name === v);
    if (m) onChange(m.name, m.density, m.group);
  };

  const shown = current ?? docCurrent;
  const shownDensity = shown ? shown.density : own?.density;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-ink-soft">{label ?? t('material.title')}</span>
        <span className="tabular-nums text-xs text-ink-muted">
          {shown || own?.density ? (
            <>
              {density(shownDensity ?? 0)} <UnitChip quantity={quantity} scope={scope} />
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

      {form.adding && <CustomMaterialForm form={form} mats={mats} type={type} design={design} fu={fu} />}
    </div>
  );
}

/** Design materials are keyed by index: a name can match a list entry at another density. */
const DOC_PREFIX = 'doc:';
