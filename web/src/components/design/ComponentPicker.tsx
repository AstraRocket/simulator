import { useMemo, useState, useSyncExternalStore } from 'react';
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
  describeNotes,
  emptyQuery,
  fitRuleFor,
  queryComponents,
  type ComponentQuery,
  type FitContext,
  type Ranked,
} from '../../services/parts/componentFilter';
import { confirmDelete } from '../../state/confirmStore';
import { colWithUnit, fmtNum, fmtPercent } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { useUnits, type Units } from '../../prefs/useUnits';
import { useCatalogProgress } from '../common/useCatalogProgress';
import { Dialog } from '../common/Dialog';
import { errorText } from '../../i18n/keyedError';
import { progressPercent } from '../../services/app/remoteData';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { PickerFilters } from './PickerFilters';
import { PickerTable, type Col, type CurrentPart } from './PickerTable';
import { KERNEL_DEFAULTS } from '../../tree/kernelDefaults';
import { StatusLine } from '../common/StatusLine';

const ROW_CAP = 200;

type CatalogState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; all: Component[] };

async function loadRows(type: PickerType): Promise<Component[]> {
  const catalogType = catalogTypeFor(type);
  const [saved, catalog] = await Promise.all([customRowsForType(catalogType), componentsForType(catalogType)]);
  return [...saved, ...catalog];
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
      : rows.data
        ? { status: 'ready', all: rows.data }
        : { status: 'loading' };
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

function columnsFor(type: ComponentType, u: Units, t: (k: string) => string, ranked: boolean): Col[] {
  const len = (v: number | null | undefined) => (v == null ? NO_VALUE : u.fmt('length', v));
  const withUnit = (label: string) => colWithUnit(label, u.sym('length'));
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
                ? `(${fmtNum(KERNEL_DEFAULTS.parachute.cd, 2)})`
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
  const ranked = useMemo(() => queryComponents(all, q, type, fit), [all, q, type, fit]);
  const shown = ranked.slice(0, ROW_CAP);
  const baseCols = useMemo(() => columnsFor(catType, u, t, canFit), [catType, u, t, canFit]);
  const [delErr, setDelErr] = useState<string | null>(null);
  const remove = async (p: Component) => {
    if (!p.id) return;
    const ok = await confirmDelete(t('picker.deleteSavedConfirm', { name: p.partNo }));
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

  return (
    <Dialog
      id="componentPicker"
      title={t('picker.dialogTitle')}
      onClose={onClose}
      size="4xl"
      toolbar={<PickerFilters all={all} q={q} set={set} canFit={canFit} />}
      footer={
        <div className="p-2 text-center text-[11px] uppercase tracking-wide text-ink-faint">
          {ranked.length > shown.length
            ? t('picker.showing', { shown: shown.length, total: ranked.length })
            : t('picker.results', { count: ranked.length })}
          <StatusLine tone="danger" size="fine" className="mt-1 normal-case tracking-normal">
            {delErr}
          </StatusLine>
        </div>
      }
    >
      <PickerTable cols={cols} shown={shown} q={q} set={set} current={current} onApply={onApply} />
    </Dialog>
  );
}
