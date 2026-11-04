import { useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  catalogTypeFor,
  componentsForType,
  type Component,
  type ComponentType,
  type PickerType,
  lengthOf,
  outerDiameterOf,
} from '../../services/parts/componentDb';
import {
  customRowsForType,
  deleteCustomPart,
  onSavedPartsChanged,
  savedPartsVersion,
} from '../../services/parts/customParts';
import {
  DEFAULT_CHUTE_CD,
  describeNotes,
  emptyQuery,
  fitRuleFor,
  manufacturers,
  materialFamilies,
  noseShapes,
  queryComponents,
  queryIsEmpty,
  type ComponentQuery,
  type FitContext,
  type Ranked,
  type SortKey,
} from '../../services/parts/componentFilter';
import { confirm } from '../../state/confirmStore';
import { fmtNum, fmtPercent } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { useUnits, type Units } from '../../prefs/useUnits';
import { useCatalogProgress } from '../common/CatalogLoading';
import { Dialog } from '../common/Dialog';
import { errorText } from '../../i18n/keyedError';
import { progressPercent } from '../../services/app/remoteData';
import { SortHeader } from '../common/SortHeader';
import { UnitBound } from '../common/UnitBound';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { Check } from '../common/Check';

const ROW_CAP = 200;

type CatalogState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; all: Component[] };

async function loadRows(type: PickerType): Promise<Component[]> {
  const catalogType = catalogTypeFor(type);
  const [saved, catalog] = await Promise.all([customRowsForType(catalogType), componentsForType(catalogType)]);
  return [...saved, ...catalog];
}

export interface CurrentPart {
  manufacturer?: string;
  partNo?: string;
}

const sameText = (a: string | undefined, b: string | undefined): boolean =>
  a != null && b != null && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Part numbers are unique only within a manufacturer, so both must match. */
function isCurrent(part: Pick<Component, 'mfr' | 'partNo'>, current: CurrentPart | undefined): boolean {
  return current != null && sameText(part.partNo, current.partNo) && sameText(part.mfr, current.manufacturer);
}

export function ComponentPicker({
  type,
  fit,
  current,
  onApply,
}: {
  /** The node's type, not the catalog's: an inner tube reads body tube rows but has its own fit rule. */
  type: PickerType;
  fit?: FitContext;
  current?: CurrentPart;
  onApply: (p: Component) => void;
}) {
  const { t } = useTranslation();
  const version = useSyncExternalStore(onSavedPartsChanged, savedPartsVersion, savedPartsVersion);
  const rows = useAsyncLoad(() => loadRows(type), type, { refresh: version });
  const state: CatalogState = rows.loading
    ? { status: 'loading' }
    : rows.error !== null
      ? { status: 'error', message: rows.error }
      : { status: 'ready', all: rows.data! };
  const progress = useCatalogProgress('components');
  const pct = progressPercent(progress);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => (state.status === 'error' ? rows.retry() : setOpen(true))}
        disabled={state.status === 'loading'}
        title={state.status === 'error' ? state.message : undefined}
        className={`w-full rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-elevated disabled:text-ink-faint ${
          state.status === 'error' ? 'bg-raised text-warn-300' : 'bg-raised text-ink'
        }`}
      >
        {state.status === 'error'
          ? t('catalog.retry')
          : state.status === 'loading'
            ? `${t('common.loading')}${pct == null ? '' : ` ${fmtPercent(pct)}`}`
            : t('picker.pick', { count: state.all.length })}
      </button>

      {/* Mounted only while open so the query resets on unmount. */}
      {open && state.status === 'ready' && (
        <PickerDialog
          type={type}
          all={state.all}
          fit={fit}
          current={current}
          onApply={(p) => {
            onApply(p);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface Col {
  key: string;
  head: string;
  sort?: SortKey;
  num?: boolean;
  /** Required on every column but the slack one: with `table-layout: auto` columns jump on every keystroke. */
  w?: string;
  hide?: string;
  cell: (r: Ranked<Component>) => string;
  title?: (r: Ranked<Component>) => string;
  render?: (r: Ranked<Component>) => ReactNode;
  headSrOnly?: boolean;
}

function columnsFor(type: ComponentType, u: Units, t: (k: string) => string, ranked: boolean): Col[] {
  const len = (v: number | null | undefined) => (v == null ? NO_VALUE : u.fmt('length', v));
  const withUnit = (label: string) => `${label} (${u.sym('length')})`;
  const od = (r: Ranked<Component>) => outerDiameterOf(r.part);
  const inner = (r: Ranked<Component>) => ('innerDiameter' in r.part ? r.part.innerDiameter : null);
  const length = (r: Ranked<Component>) => lengthOf(r.part);

  const fitCol: Col[] = ranked
    ? [
        {
          key: 'fit',
          head: withUnit(t('picker.colFit')),
          sort: 'fit',
          num: true,
          w: 'w-20',
          // The gap: 0 is a perfect fit, blank means the part does not fit at all.
          cell: (r) => (r.fit == null ? '' : u.fmt('length', r.fit)),
        },
      ]
    : [];

  const ident: Col[] = [
    {
      key: 'mfr',
      head: t('picker.colMfr'),
      sort: 'mfr',
      w: 'w-36',
      cell: (r) => (r.part.custom ? `★ ${r.part.mfr}` : r.part.mfr),
      title: (r) => (r.part.custom ? t('picker.savedTitle') : r.part.mfr),
    },
    {
      key: 'partNo',
      head: t('picker.colPartNo'),
      sort: 'partNo',
      w: 'w-32',
      cell: (r) => r.part.partNo,
      title: (r) => r.part.partNo,
    },
  ];
  // The raw catalog name, not the facet's family: G10 and G12 fiberglass differ.
  const material: Col = {
    key: 'material',
    head: t('material.title'),
    w: 'w-36',
    hide: 'hidden lg:table-cell',
    cell: (r) => ('material' in r.part ? (r.part.material ?? NO_VALUE) : NO_VALUE),
    title: (r) => ('material' in r.part ? (r.part.material ?? '') : ''),
  };
  // The one column with no width: it absorbs the slack.
  const notes: Col = {
    key: 'notes',
    head: t('picker.colNotes'),
    hide: 'hidden md:table-cell',
    cell: (r) => describeNotes(r.part),
    title: (r) => r.part.desc,
  };
  const odCol: Col = {
    key: 'od',
    head: withUnit(t('picker.colOd')),
    sort: 'od',
    num: true,
    w: 'w-24',
    cell: (r) => len(od(r)),
  };
  const idCol: Col = {
    key: 'id',
    head: withUnit(t('picker.colId')),
    sort: 'id',
    num: true,
    w: 'w-24',
    cell: (r) => len(inner(r)),
  };
  const lenCol: Col = {
    key: 'length',
    head: withUnit(t('picker.colLen')),
    sort: 'length',
    num: true,
    w: 'w-28',
    cell: (r) => len(length(r)),
  };
  // A ring's and a bulkhead's `length` is its thickness.
  const thickCol: Col = { ...lenCol, head: withUnit(t('prop.thickness')) };

  const shapeCol: Col = {
    key: 'shape',
    head: t('prop.shape'),
    sort: 'shape',
    w: 'w-28',
    cell: (r) => ('shape' in r.part ? t(`noseShape.${r.part.shape}`) : NO_VALUE),
  };

  switch (type) {
    case 'bodytube':
    case 'tubecoupler':
    case 'engineblock':
    case 'launchlug':
      return [...fitCol, ...ident, odCol, idCol, lenCol, material, notes];
    case 'transition':
      return [
        ...fitCol,
        ...ident,
        shapeCol,
        {
          key: 'fore',
          head: withUnit(t('prop.foreDiameter')),
          sort: 'fore',
          num: true,
          w: 'w-28',
          cell: (r) => len(r.part.type === 'transition' ? r.part.foreOuterDiameter : null),
        },
        // Sorted as the OD: the aft end is the one that meets the tube below.
        { ...odCol, head: withUnit(t('prop.aftDiameter')), w: 'w-28' },
        lenCol,
        material,
        notes,
      ];
    case 'streamer':
      return [
        ...ident,
        lenCol,
        {
          key: 'width',
          head: withUnit(t('prop.width')),
          sort: 'width',
          num: true,
          w: 'w-24',
          cell: (r) => len(r.part.type === 'streamer' ? r.part.stripWidth : null),
        },
        material,
        notes,
      ];
    case 'centeringring':
      return [...fitCol, ...ident, odCol, idCol, thickCol, material, notes];
    // A rail button's length is its height off the airframe.
    case 'railbutton':
      return [...ident, odCol, idCol, { ...lenCol, head: withUnit(t('prop.height')) }, material, notes];
    case 'bulkhead':
      return [...fitCol, ...ident, odCol, thickCol, material, notes];
    case 'nosecone':
      return [...fitCol, ...ident, shapeCol, odCol, lenCol, material, notes];
    case 'parachute':
      return [
        ...ident,
        { ...odCol, head: withUnit(t('prop.diameter')), w: 'w-32' },
        {
          key: 'cd',
          head: t('prop.dragCoeff'),
          sort: 'cd',
          num: true,
          w: 'w-24',
          // A missing Cd shows the applied default in parentheses, so it does not read as manufacturer data.
          cell: (r) =>
            r.part.type === 'parachute'
              ? r.part.cd == null
                ? `(${fmtNum(DEFAULT_CHUTE_CD, 2)})`
                : fmtNum(r.part.cd, 2)
              : NO_VALUE,
          title: (r) => (r.part.type === 'parachute' && r.part.cd == null ? t('picker.cdDefault') : ''),
        },
        notes,
      ];
  }
}

function PickerDialog({
  type,
  all,
  fit,
  current,
  onApply,
  onClose,
}: {
  type: PickerType;
  all: Component[];
  fit?: FitContext;
  current?: CurrentPart;
  onApply: (p: Component) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const canFit = fitRuleFor(type, fit) != null;
  const [q, setQ] = useState<ComponentQuery>({ ...emptyQuery, sort: canFit ? 'fit' : 'mfr' });
  const set = (patch: Partial<ComponentQuery>) => setQ((prev) => ({ ...prev, ...patch }));

  // Fit uses the node's type, columns the catalog's; they differ for an inner tube.
  const catType = catalogTypeFor(type);
  const mfrs = useMemo(() => manufacturers(all), [all]);
  const mats = useMemo(() => materialFamilies(all), [all]);
  const shapes = useMemo(() => noseShapes(all), [all]);
  // Legacy rows are hidden until checked, as desktop's chooser does.
  const hasLegacy = useMemo(() => all.some((p) => p.legacy), [all]);
  const ranked = useMemo(() => queryComponents(all, q, type, fit), [all, q, type, fit]);
  const shown = ranked.slice(0, ROW_CAP);
  const baseCols = useMemo(() => columnsFor(catType, u, t, canFit), [catType, u, t, canFit]);
  const [delErr, setDelErr] = useState<string | null>(null);
  const remove = async (p: Component) => {
    if (!p.id) return;
    const ok = await confirm({
      message: t('picker.deleteSavedConfirm', { name: p.partNo }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    setDelErr(null);
    try {
      await deleteCustomPart(p.id);
    } catch (e) {
      setDelErr(errorText(e, t));
    }
  };
  const hasSaved = useMemo(() => all.some((p) => p.custom), [all]);
  const cols: Col[] = hasSaved
    ? [
        ...baseCols,
        {
          key: 'del',
          head: t('common.delete'),
          headSrOnly: true,
          w: 'w-10',
          cell: () => '',
          render: (r) =>
            r.part.custom ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(r.part);
                }}
                aria-label={t('picker.deleteSaved', { name: r.part.partNo })}
                className="text-danger-400 hover:text-danger-300"
              >
                ✕
              </button>
            ) : null,
        },
      ]
    : baseCols;

  const sortBy = (key: SortKey) => set(key === q.sort ? { dir: q.dir === 1 ? -1 : 1 } : { sort: key, dir: 1 });

  return (
    <Dialog
      id="componentPicker"
      title={t('picker.dialogTitle')}
      onClose={onClose}
      size="4xl"
      toolbar={
        <div className="flex flex-col gap-2 p-3">
          <input
            value={q.text}
            onChange={(e) => set({ text: e.target.value })}
            autoFocus
            placeholder={t('picker.search')}
            aria-label={t('picker.search')}
            className="w-full rounded-lg bg-canvas px-3 py-2 text-sm text-ink-strong ring-1 ring-line/10 placeholder:text-ink-faint focus:outline-none focus:ring-accent-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={q.mfr}
              onChange={(e) => set({ mfr: e.target.value })}
              aria-label={t('picker.colMfr')}
              className="rounded-lg bg-raised px-2 py-2 text-xs text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
            >
              <option value="">{t('picker.allMfrs')}</option>
              {mfrs.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {mats.length > 1 && (
              <select
                value={q.material}
                onChange={(e) => set({ material: e.target.value })}
                aria-label={t('material.title')}
                className="rounded-lg bg-raised px-2 py-2 text-xs text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
              >
                <option value="">{t('picker.allMaterials')}</option>
                {mats.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            {shapes.length > 1 && (
              <select
                value={q.shape}
                onChange={(e) => set({ shape: e.target.value })}
                aria-label={t('prop.shape')}
                className="rounded-lg bg-raised px-2 py-2 text-xs text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
              >
                <option value="">{t('picker.allShapes')}</option>
                {shapes.map((sh) => (
                  <option key={sh} value={sh}>
                    {t(`noseShape.${sh}`)}
                  </option>
                ))}
              </select>
            )}
            <span className="flex items-center gap-1 text-xs text-ink-muted">
              <span className="text-ink-faint">⌀</span>
              <UnitBound
                quantity="length"
                value={q.odMin}
                onChange={(si) => set({ odMin: si })}
                placeholder={t('picker.odFrom')}
                ariaLabel={t('picker.odFrom')}
                className="w-16 rounded-md bg-canvas px-2 py-1.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
              />
              <span aria-hidden="true">–</span>
              <UnitBound
                quantity="length"
                value={q.odMax}
                onChange={(si) => set({ odMax: si })}
                placeholder={t('picker.odTo')}
                ariaLabel={t('picker.odTo')}
                className="w-16 rounded-md bg-canvas px-2 py-1.5 text-right tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
              />
              <span className="text-ink-faint">{u.sym('length')}</span>
            </span>
            {canFit && (
              <Check
                checked={q.fitsOnly}
                onChange={(v) => set({ fitsOnly: v })}
                label={t('picker.fitsOnly')}
                title={t('picker.fitsHint')}
                className="text-xs text-ink-soft"
              />
            )}
            {hasLegacy && (
              <Check
                checked={q.showLegacy}
                onChange={(v) => set({ showLegacy: v })}
                label={t('picker.showLegacy')}
                className="text-xs text-ink-soft"
              />
            )}
            {!queryIsEmpty(q) && (
              <button
                onClick={() =>
                  set({ text: '', mfr: '', material: '', shape: '', odMin: null, odMax: null, fitsOnly: false })
                }
                className="ml-auto rounded-md bg-raised px-2 py-1.5 text-xs text-ink-soft hover:bg-elevated"
              >
                {t('picker.clear')}
              </button>
            )}
          </div>
        </div>
      }
      footer={
        <div className="p-2 text-center text-[11px] uppercase tracking-wide text-ink-faint">
          {ranked.length > shown.length
            ? t('picker.showing', { shown: shown.length, total: ranked.length })
            : t('picker.results', { count: ranked.length })}
          {/* Always mounted: a live region created with its text is not announced. */}
          <div role="status" aria-live="polite" className="mt-1 normal-case tracking-normal text-danger-400">
            {delErr}
          </div>
        </div>
      }
    >
      {/* `table-fixed`: see Col.w. */}
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface text-[11px] uppercase tracking-wide text-ink-muted">
          <tr>
            {cols.map((c) => (
              <SortHeader
                key={c.key}
                className={`border-b border-line/10 px-2 py-2 font-medium ${c.num ? 'text-right' : 'text-left'} ${c.w ?? ''} ${c.hide ?? ''}`}
                active={c.sort === q.sort}
                dir={q.dir === 1 ? 1 : -1}
                onSort={c.sort ? () => sortBy(c.sort!) : undefined}
              >
                {c.headSrOnly && !c.sort ? <span className="sr-only">{c.head}</span> : c.head}
              </SortHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr
              key={r.part.id ?? `${r.part.mfr}:${r.part.partNo}:${i}`}
              // Pointer only; the part-number button is the keyboard target. A button row would swallow delete.
              onClick={() => onApply(r.part)}
              aria-current={isCurrent(r.part, current) ? 'true' : undefined}
              className={`cursor-pointer border-b border-line/5 hover:bg-raised focus-within:bg-raised ${
                isCurrent(r.part, current) ? 'bg-raised font-semibold text-accent-300' : 'text-ink-soft'
              }`}
            >
              {cols.map((c) => (
                <td
                  key={c.key}
                  title={c.title?.(r) || undefined}
                  className={`truncate px-2 py-1.5 ${c.num ? 'text-right tabular-nums' : ''} ${
                    c.key === 'partNo' ? 'font-medium text-ink-strong' : ''
                  } ${c.key === 'notes' || c.key === 'material' ? 'text-ink-faint' : ''} ${c.hide ?? ''}`}
                >
                  {c.key === 'partNo' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // the row's own click would apply it twice
                        onApply(r.part);
                      }}
                      aria-current={isCurrent(r.part, current) ? 'true' : undefined}
                      className="max-w-full truncate text-left focus:outline-none focus-visible:underline"
                    >
                      {c.cell(r)}
                    </button>
                  ) : c.render ? (
                    c.render(r)
                  ) : (
                    c.cell(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="px-3 py-8 text-center text-sm text-ink-faint">
                {t('picker.noResults')}
                {q.fitsOnly && <div className="mt-1 text-xs text-ink-dim">{t('picker.fitsHint')}</div>}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Dialog>
  );
}
