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
import { withUnit } from '../../i18n/format';
import { listWriteErrorText } from '../../services/storage/jsonListStore';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { useLatest } from '../common/useLatest';
import { mathEquals } from '../../services/motors/mathEquals';

/**
 * What the material is for, which decides whether the adhesives belong in the
 * list. A structural part drops them; a fillet is offered the whole bulk list,
 * as desktop's fin fillet material box is (`FinSetConfig`, a `MaterialModel`
 * over the bulk database). Nothing else is filtered: every other
 * bulk material in the table is something a part can legitimately be made of,
 * and guessing which ones suit which component would block real builds (an
 * aluminum fin, a printed nose cone) to save a little scrolling.
 */
export type MaterialUse = 'structure' | 'fillet';

/**
 * Assigns a material (name + density) to a component, from the built-in
 * catalog plus the user's custom materials (swappable MaterialStore). `type`
 * picks the catalog (bulk / surface / line); `label` names the row. Emits
 * `onChange(name, density, group)`; density 0 / name undefined means the
 * engine default.
 *
 * The group rides along because the picker is the only place that knows it:
 * the catalog is fetched, so a caller cannot look a name up synchronously in
 * its own handler, and a custom material is not in the catalog at all. The
 * `.ork` writer wants it, to file the material under its own category.
 */
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
  /**
   * The density the part carries with `value`, SI. Shown when the list holds
   * no entry of that name and density: a catalog part brings its maker's
   * material ("Balsa, bulk, BMS typical") at its own density, which is what the
   * part is weighed with, and almost none of those names are in the list.
   */
  density?: number;
  onChange: (name: string | undefined, density: number, group?: string) => void;
  type?: MaterialType;
  label?: string;
  use?: MaterialUse;
  /**
   * What the "no material chosen" option is called. It means two different
   * things depending on where the picker is, so it cannot be one string: on a
   * part it means the part is weighed with the built-in density, and in
   * Settings ▸ Materials it means new parts of that type get no material at
   * all. Defaults to the part wording.
   */
  unsetLabel?: string;
  /**
   * Whether the picker is choosing for a part of the open design. It then
   * offers the design's own materials (desktop's document materials) and a new
   * custom material is kept in the design unless the user also adds it to their
   * custom list. Settings ▸ Materials picks for no design and passes false.
   */
  design?: boolean;
}) {
  const { t } = useTranslation();
  // Empty until the catalog arrives. It is a runtime file (public/data), the
  // same as the motor and component catalogs, so there is nothing to seed a
  // first paint with; `useAsyncLoad` below fetches it with the user's custom
  // materials merged in. The select renders its "no material" option meanwhile,
  // which is what a part with no material would show anyway.
  const [mats, setMats] = useState<Material[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  // Which group the new material joins. A `Custom` group of their own puts every
  // one of them at the top of the list, away from the material it is usually a
  // variant of.
  const [group, setGroup] = useState(DEFAULT_CUSTOM_GROUP);
  // In the field's unit; converted to SI on save. null while empty.
  const [dens, setDens] = useState<number | null>(null);
  // Desktop's "Add material to application database", which starts unchecked
  // (`MaterialModel` opens `CustomMaterialDialog` with it off): a material
  // defined on a part belongs to that design unless the user asks for more.
  const [toLibrary, setToLibrary] = useState(false);
  const rawDocMats = useWorkspaceStore((s) => s.tree.documentMaterials);
  const addDocumentMaterial = useWorkspaceStore((s) => s.addDocumentMaterial);
  const [addErr, setAddErr] = useState<string | null>(null);
  // Custom Materials, opened from the list. Custom materials are edited and
  // deleted there, as saved parts are in Custom Parts, so there is one place to
  // manage them.
  const [managing, setManaging] = useState(false);
  // An add here and an edit in Custom Materials both change the list, so it is
  // reloaded on the library's change signal.
  const libraryVersion = useSyncExternalStore(onCustomMaterialsChanged, customMaterialsVersion, customMaterialsVersion);
  // The add's store round trip finishes after an await, and selecting a
  // different component unmounts this picker in between.
  const { observe } = useLatest();
  const u = useUnits();
  const quantity = QUANTITY[type];
  // One scope per material kind: fabric and cord densities are read in quite
  // different units from bulk stock, so they must not share a choice.
  const scope = unitScope('material', type);
  const fu = u.at(scope, quantity);
  // No fixed decimal count: one that suits kg/m³ (680) is wrong for g/cm³
  // (0.68), and the unit can change under this readout at any time.
  const density = (si: number) => fu.fmt(si);

  // The catalog is a download, so it can fail: offline, or a data host that is
  // there but wrong. Say so instead of rendering an empty list, which is
  // indistinguishable from "this app has no materials".
  const loaded = useAsyncLoad(() => materialsForType(type), type, { onLoaded: setMats, refresh: libraryVersion });
  // Set when the catalog could not be fetched. Distinct from "no materials":
  // the list is empty either way, and only one of them is the app's fault.
  const loadErr = loaded.error !== null ? t('material.loadFailed') : null;

  // Resolved against the whole list, never the filtered one: a design can
  // already name a material this picker would not offer (a `.ork` with an
  // epoxy body tube), and the row has to keep showing what the part is made of.
  //
  // A list entry is the part's material only when the density agrees too, as
  // desktop's `Material.equals` has it: a file's own "Balsa" at 200 kg/m³ flies
  // at 200, not at the list's 170. A part that carries no density is matched by
  // name, since it has nothing else to compare.
  const current = mats.find(
    (m) => m.name === value && (!(ownDensity && ownDensity > 0) || mathEquals(m.density, ownDensity)),
  );
  /**
   * The design's own materials of this type, in desktop's order, less any the
   * list above already holds at the same density: that entry is the same
   * material, and two rows for it would only differ in where they sit.
   */
  const docMats = useMemo(
    () =>
      design
        ? documentMaterialsOf({ documentMaterials: rawDocMats }, type)
            .filter((d) => !mats.some((m) => m.name === d.name && mathEquals(m.density, d.density)))
            .sort(byNameThenDensity)
        : [],
    [design, rawDocMats, type, mats],
  );
  // The part's material when it is one of the design's own, by the same rule
  // as `current`.
  const docCurrent = current
    ? undefined
    : docMats.find((m) => m.name === value && (!(ownDensity && ownDensity > 0) || mathEquals(m.density, ownDensity)));
  // A material the part names that neither list holds at the part's
  // density. It is still the part's material, so it is shown as chosen rather
  // than as "not specified".
  const own =
    value && !current && !docCurrent
      ? { name: value, density: ownDensity && ownDensity > 0 ? ownDensity : null }
      : null;

  /**
   * The list is the materials for this use.
   *
   * A structural part drops the adhesives: nothing is built out of glue, and
   * they would add a block of rows under every body tube and centering ring. A
   * fillet keeps the whole bulk list, adhesives included, since a bead can be
   * any bulk material desktop offers.
   *
   * Whatever the part already uses stays in the list either way. Dropping it
   * would leave the select showing no option for the value it holds, which
   * reads as "no material" on a part that has one.
   */
  const visible = useMemo(() => {
    if (use === 'fillet') return mats;
    return mats.filter((m) => m.group !== ADHESIVE_GROUP || m.name === current?.name);
  }, [mats, use, current?.name]);

  const groups = useMemo(() => {
    const g = new Map<string, Material[]>();
    for (const m of visible) {
      if (!g.has(m.group)) g.set(m.group, []);
      g.get(m.group)!.push(m);
    }
    return [...g.entries()];
  }, [visible]);

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
      // `toSi`, not `fromUi`: the box holds the user's density unit and the
      // store holds SI, and a bulk density also has a physical ceiling
      // (prefs/entryValue). A refused entry arrives as NaN, which `addCustom`
      // already rejects with the message the form shows.
      const si = fu.toSi(dens) ?? NaN;
      if (design && !toLibrary) {
        // Kept in the design, as desktop keeps a material defined without
        // "Add material to application database" in the document.
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
        {/* The part's own material, when the list does not hold it at its
            density: a catalog part's maker's material, a file's own density
            under a list name, or any material while the list failed to load.
            It comes first, so its value picks it over a list entry of the same
            name. Without this the select falls back to "no material", so the
            row would describe a part that has one as a part that does not. */}
        {own && (
          <optgroup label={t('material.thisPart')}>
            <option value={own.name}>
              {own.name}
              {own.density ? ` · ${withUnit(density(own.density), fu.sym)}` : ''}
            </option>
          </optgroup>
        )}
        {docMats.length > 0 && (
          <optgroup label={t('material.inDesign')}>
            {docMats.map((m, i) => (
              <option key={`${m.name}:${m.density}`} value={`${DOC_PREFIX}${i}`}>
                {m.name} · {density(m.density)} {fu.sym}
              </option>
            ))}
          </optgroup>
        )}
        {groups.map(([g, list]) => (
          <optgroup key={g} label={groupLabel(t, g)}>
            {list.map((m) => (
              <option key={`${g}:${m.name}`} value={m.name}>
                {m.custom ? '★ ' : ''}
                {m.name} · {density(m.density)} {fu.sym}
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
      {/* Always mounted, empty until there is something to say: a live region
          created together with its text is not announced (see UpdateToast). */}
      <p role="status" aria-live="polite" className="mt-1 text-xs text-danger-400">
        {loadErr}
      </p>
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
              className="w-40 rounded bg-surface px-2 py-1.5 text-sm text-ink-strong ring-1 ring-line/10"
            >
              {groupsOf(mats).map((g) => (
                <option key={g} value={g}>
                  {groupLabel(t, g)}
                </option>
              ))}
            </select>
          </label>
          {/* NumberInput, not a raw <input> + parseFloat: the same draft
              handling every other numeric field has, and the value arrives
              as a number in the field's unit. */}
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
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input type="checkbox" checked={toLibrary} onChange={(e) => setToLibrary(e.target.checked)} />
              {t('material.addToLibrary')}
            </label>
          )}
          {/* Always mounted, as the two lines above the form are. */}
          <p role="status" aria-live="polite" className="text-xs text-danger-400">
            {addErr}
          </p>
          <div className="flex gap-2">
            <button
              onClick={submitCustom}
              className="flex-1 rounded bg-accent-600 py-1.5 text-sm font-medium text-on-accent"
            >
              {t('material.save')}
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setToLibrary(false);
                setAddErr(null);
              }}
              className="flex-1 rounded bg-raised py-1.5 text-sm text-ink-soft"
            >
              {t('material.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The option value of one of the design's own materials: its index in the
 * picker's list, since its name can also be a list entry's at another density.
 */
const DOC_PREFIX = 'doc:';
