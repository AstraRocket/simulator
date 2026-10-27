import { useMemo, useState } from 'react';
import { loadHideOop, saveHideOop } from './motorPrefs';
import { useTranslation } from 'react-i18next';
import { withUnit } from '../../i18n/format';
import { filterMotors, allClasses, allManufacturers, type CatalogMotor } from '../../services/motors/motorDb';
import { STD_DIAMS, MAX_IDX, fitIdx, type MountFit } from '../../services/motors/motorPicker';
import { useUnits } from '../../prefs/useUnits';
import { RangeSlider } from './RangeSlider';
import { ToggleButton } from '../common/ToggleButton';
import { UnitBound } from '../common/UnitBound';
import { CheckMenu } from '../common/CheckMenu';
import { toggled } from '../../services/app/collections';
import { usePersistedState } from '../common/usePersistedState';
import { Check } from '../common/Check';
import { NumberInput } from '../common/NumberInput';
import type { Quantity } from '../../prefs/units';
import {
  PERF_FIELDS,
  activePerfCount,
  type PerfDef,
  type PerfField,
  type PerfRange,
  type PerfRanges,
} from '../../services/motors/motorPerf';

/**
 * The filter controls the motor picker, the motor dashboard and the motor guide
 * share: the same manufacturer dropdown, class chips, impulse and performance
 * bounds, diameter range and plugged box, over the same filter state. Each dialog lays them out
 * differently (the picker stacks them, the dashboard puts them on two rows), so
 * this is a set of pieces rather than one bar. Kept as two copies they would
 * drift, for example a diameter readout in raw millimeters on one side and the
 * user's unit on the other.
 *
 * One piece is not shared: fitting the mount only means something where there is
 * a mount, which is the picker. The dashboard is a reference browser with no
 * rocket in mind.
 */

export interface MotorFilterInit {
  /** Manufacturers to start checked (the picker remembers the user's set). */
  mfrs?: Set<string>;
  /** Diameter range as [low, high] slider indices. */
  dia?: [number, number];
  /**
   * The mount being loaded, when there is one. Only the picker has it; the
   * dashboard browses the catalog with no rocket in mind, so it has nothing to
   * fit and never shows the checkbox.
   */
  mount?: MountFit | null;
  /**
   * The performance fields offered, when not the standard set: a list with a
   * rocket to lift adds thrust-to-weight (`twrField`).
   */
  perfFields?: readonly PerfDef[];
}

const EMPTY: ReadonlySet<string> = new Set();

/** Total impulse bounds in N·s, either end open. */
export type ImpulseRange = [min: number | null, max: number | null];

/** Filter state over a catalog and the rows that survive it. */
export function useMotorFilter(
  catalog: CatalogMotor[],
  init: MotorFilterInit = {},
  /** Motors already used in the mount, by `keyOf`, for "Hide motors already used in the mount". */
  used: ReadonlySet<string> = EMPTY,
) {
  const [text, setText] = useState('');
  const [hideOop, setHideOop] = usePersistedState(loadHideOop, saveHideOop);
  const [hideUsed, setHideUsed] = useState(false);
  const [cls, setCls] = useState<string | null>(null);
  const [mfrs, setMfrs] = useState<Set<string>>(() => init.mfrs ?? new Set());
  const [imp, setImp] = useState<ImpulseRange>([null, null]);
  const [perf, setPerfAll] = useState<PerfRanges>({});
  const [plugged, setPlugged] = useState(false);
  const mount = init.mount ?? null;
  const perfFields = init.perfFields ?? PERF_FIELDS;
  /** The slider stop the mount can take, and the ceiling the box pulls down to. */
  const mountIdx = mount ? fitIdx(mount.bore) : MAX_IDX;
  // On by default wherever there is a mount. Hiding motors too fat for the bore
  // is a visible checkbox rather than a quietly defaulted top stop on the
  // diameter slider, so a narrowed list has something on screen saying why.
  const [fits, setFits] = useState(mount !== null);
  /**
   * The floor and ceiling the user last asked for, which the mount's cap never
   * overwrites; only a drag sets them.
   *
   * Kept apart from the displayed range, because the slider is showing two
   * different things at different times: what the mount allows while the box
   * is ticked, and what the user chose while it is not. Holding only the
   * displayed value would save the mount's cap as though it were a preference,
   * and the range picked for an 18 mm mount would then follow the user to every
   * other mount. The cap moves both ends (a floor above the mount's stop comes
   * down to it), so both are kept.
   */
  const [freeLow, setFreeLow] = useState(() => (init.dia ?? [0, MAX_IDX])[0]);
  const [freeHigh, setFreeHigh] = useState(() => (init.dia ?? [0, MAX_IDX])[1]);
  const [dia, setDiaRaw] = useState<[number, number]>(() => {
    const d = init.dia ?? [0, MAX_IDX];
    // The box starts ticked where there is a mount, so the slider starts capped.
    return mount ? [Math.min(d[0], mountIdx), Math.min(d[1], mountIdx)] : d;
  });

  /**
   * Ticking pulls the diameter ceiling down to what the mount takes; clearing it
   * gives back whatever range the user had, so the restriction is visible.
   *
   * It never widens a narrower choice: someone who asked for 13 mm and up did
   * not ask for 18 mm just by ticking a box.
   */
  const setFitsAndCeiling = (on: boolean) => {
    setFits(on);
    if (!mount) return;
    setDiaRaw(([low]) => [on ? Math.min(low, mountIdx) : freeLow, on ? Math.min(freeHigh, mountIdx) : freeHigh]);
  };

  /**
   * A drag is always the user's choice, so it is always what gets remembered,
   * and dragging the ceiling above what the mount takes clears the box, because
   * asking to see 38 mm motors in a 24 mm mount is asking to see past the mount.
   * Leaving the box ticked there would leave a control that moved and changed
   * nothing.
   */
  const setDia = (next: [number, number]) => {
    setDiaRaw(next);
    setFreeLow(next[0]);
    setFreeHigh(next[1]);
    if (fits && mount && next[1] > mountIdx) setFits(false);
  };

  const classes = useMemo(() => allClasses(catalog), [catalog]);
  const manufacturers = useMemo(() => allManufacturers(catalog), [catalog]);
  const fit = fits && mount ? mount : undefined;
  const [lowIdx, highIdx] = dia;
  /** What to remember: the user's own range, never the mount's cap. */
  const diaSaved = useMemo(() => [freeLow, freeHigh] as [number, number], [freeLow, freeHigh]);
  const [impMin, impMax] = imp;
  const matches = useMemo(
    () =>
      filterMotors(catalog, {
        text,
        classes: cls ? new Set([cls]) : new Set(),
        manufacturers: mfrs,
        // The extreme stops mean "open end" (no floor / no ceiling).
        minDiameter: lowIdx > 0 ? STD_DIAMS[lowIdx] : undefined,
        maxDiameter: highIdx < MAX_IDX ? STD_DIAMS[highIdx] : undefined,
        minImpulse: impMin ?? undefined,
        maxImpulse: impMax ?? undefined,
        perf,
        perfFields,
        fit,
        plugged,
        hideOop,
        hide: hideUsed ? used : undefined,
      }),
    [
      catalog,
      text,
      cls,
      mfrs,
      lowIdx,
      highIdx,
      impMin,
      impMax,
      perf,
      perfFields,
      fit,
      plugged,
      hideOop,
      hideUsed,
      used,
    ],
  );
  return {
    text,
    setText,
    cls,
    setCls,
    mfrs,
    setMfrs,
    dia,
    setDia,
    diaSaved,
    imp,
    setImp,
    perf,
    perfFields,
    setPerf: (field: PerfField, range: PerfRange) => setPerfAll((cur) => ({ ...cur, [field]: range })),
    clearPerf: () => setPerfAll({}),
    plugged,
    setPlugged,
    hideOop,
    setHideOop,
    hideUsed,
    setHideUsed,
    fits,
    setFits: setFitsAndCeiling,
    mount,
    classes,
    manufacturers,
    matches,
  };
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <ToggleButton active={active} onClick={onClick} className="rounded-full px-2.5 py-1 text-xs font-medium">
      {label}
    </ToggleButton>
  );
}

/** "All" plus one chip per impulse class present in the catalog. */
export function ClassChips({
  classes,
  cls,
  onChange,
}: {
  classes: string[];
  cls: string | null;
  onChange: (cls: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Chip label={t('motor.all')} active={cls === null} onClick={() => onChange(null)} />
      {classes.map((c) => (
        <Chip key={c} label={c} active={cls === c} onClick={() => onChange(cls === c ? null : c)} />
      ))}
    </>
  );
}

/** The manufacturer multi-select: a summary naming the current set, checkboxes below. */
export function ManufacturerMenu({
  manufacturers,
  mfrs,
  onChange,
  align = 'left',
  className = '',
}: {
  manufacturers: string[];
  mfrs: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Which edge the dropdown hangs from. */
  align?: 'left' | 'right';
  className?: string;
}) {
  const { t } = useTranslation();
  const toggle = (m: string) => onChange(toggled(mfrs, m));
  return (
    <CheckMenu
      summary={
        mfrs.size === 0
          ? t('motorDlg.allManufacturers')
          : mfrs.size === 1
            ? [...mfrs][0]
            : t('motorDlg.mfrCount', { n: mfrs.size })
      }
      items={manufacturers.map((m) => ({ key: m, label: m, checked: mfrs.has(m) }))}
      onToggle={toggle}
      width="w-64"
      align={align}
      className={className}
    >
      <button
        onClick={() => onChange(new Set())}
        className="w-full rounded px-2 py-1 text-left text-xs font-medium text-accent-400 hover:bg-raised"
      >
        {t('motorDlg.allManufacturers')}
      </button>
    </CheckMenu>
  );
}

/** The diameter range slider with its readout in the user's motor-dimension unit. */
export function DiameterRange({ dia, onChange }: { dia: [number, number]; onChange: (dia: [number, number]) => void }) {
  const { t } = useTranslation();
  const u = useUnits();
  const [lowIdx, highIdx] = dia;
  // The stops are the standard motor sizes, held in mm because that is what
  // the catalog and the fit query speak; only the readout moves to the user's
  // unit.
  const stop = (i: number) => u.fmt('motorDimensions', STD_DIAMS[i]! / 1000);
  return (
    <div className="flex items-center gap-3 text-xs text-ink-soft">
      <span className="shrink-0 text-ink-faint">{t('motorDlg.diameter')}</span>
      <RangeSlider
        count={STD_DIAMS.length}
        low={lowIdx}
        high={highIdx}
        onChange={(lo, hi) => onChange([lo, hi])}
        label={t('motorDlg.diameter')}
        stops={STD_DIAMS.map((_, i) => withUnit(stop(i), u.sym('motorDimensions')))}
      />
      <span className="w-20 shrink-0 text-right tabular-nums text-ink-muted">
        {lowIdx > 0 ? stop(lowIdx) : t('motorDlg.any')}–{highIdx < MAX_IDX ? stop(highIdx) : t('motorDlg.any')}{' '}
        {u.sym('motorDimensions')}
      </span>
    </div>
  );
}

/**
 * The total-impulse bounds, typed in the user's impulse unit.
 *
 * Numbers rather than a slider over the class boundaries, because that slider
 * would only be the class chips again: a class is a doubling bucket, so H is
 * everything from 160 to 320 N·s, and the question worth asking here is "at
 * least 400", which comes out of a design and lands between letters.
 */
export function ImpulseRange({ imp, onChange }: { imp: ImpulseRange; onChange: (imp: ImpulseRange) => void }) {
  const { t } = useTranslation();
  // Held in N·s like the catalog; only what is typed and shown moves to the
  // user's unit.
  return <BoundPair label={t('motorDlg.totalImpulse')} quantity="impulse" range={imp} onChange={onChange} />;
}

const BOUND_FIELD =
  'w-16 rounded-md bg-canvas px-2 py-1 text-right text-xs tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';

/**
 * A min and a max box under one label, held in SI and typed in the user's unit
 * for `quantity`. Without a quantity the figure has one unit (a burn time in
 * seconds) and is typed as it is held.
 */
function BoundPair({
  label,
  quantity,
  range,
  onChange,
  labelClass = 'shrink-0',
  ratio = false,
}: {
  label: string;
  quantity?: Quantity;
  /** A plain ratio, with no unit to name (thrust-to-weight). */
  ratio?: boolean;
  range: [number | null, number | null];
  onChange: (range: [number | null, number | null]) => void;
  labelClass?: string;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const end = (i: 0 | 1) => {
    const word = i === 0 ? t('motorDlg.min') : t('motorDlg.max');
    const set = (si: number | null) => onChange(i === 0 ? [si, range[1]] : [range[0], si]);
    return quantity ? (
      <UnitBound
        quantity={quantity}
        min={0}
        value={range[i]}
        onChange={set}
        placeholder={word}
        ariaLabel={`${label} ${word}`}
        className={BOUND_FIELD}
      />
    ) : (
      <NumberInput
        value={range[i]}
        onChange={set}
        min={0}
        placeholder={word}
        ariaLabel={`${label} ${word}`}
        className={BOUND_FIELD}
      />
    );
  };
  return (
    <div className="flex items-center gap-2 text-xs text-ink-soft">
      <span className={`${labelClass} text-ink-faint`}>{label}</span>
      {end(0)}
      <span aria-hidden="true">–</span>
      {end(1)}
      <span className="min-w-8 shrink-0 text-ink-faint">
        {quantity ? u.sym(quantity) : ratio ? '' : t('units.second')}
      </span>
    </div>
  );
}

/**
 * The performance bounds behind one toggle: average and peak thrust, burn time,
 * total and propellant weight, length. thrustcurve.org's advanced search asks
 * the same questions.
 *
 * Folded away by default, because most lists are narrowed by class and bore
 * and six more pairs of boxes would push the list itself off a phone. The
 * toggle counts the bounds that are set, so a folded panel that is still
 * filtering says so.
 */
export function PerfFilters({
  perf,
  onChange,
  onClear,
  fields = PERF_FIELDS,
}: {
  perf: PerfRanges;
  onChange: (field: PerfField, range: PerfRange) => void;
  onClear: () => void;
  /** The fields to offer; the hook's `perfFields`. */
  fields?: readonly PerfDef[];
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const active = activePerfCount(perf, fields);
  return (
    <div className="@container text-xs">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-md px-2 py-1 font-medium text-ink-soft ring-1 ring-line/10 hover:bg-raised"
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>{' '}
          {active ? t('motorDlg.moreFiltersN', { count: active }) : t('motorDlg.moreFilters')}
        </button>
        {active > 0 && (
          <button onClick={onClear} className="text-accent-400 hover:underline">
            {t('motorDlg.clearFilters')}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-1.5">
          {/* Container queries: columns track the panel this sits in, not the
              window, since the picker's list is a 440px column inside a wide
              dialog. A pair is about 300px, so one column below 672px, two up
              to 1024px (the dashboard's list), three above (the motor guide),
              which puts thrust and burn time on the first row and the motor's
              own weights and length on the second. */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {fields.map((f) => (
              <BoundPair
                key={f.id}
                label={t(f.label)}
                quantity={f.quantity}
                range={perf[f.id] ?? [null, null]}
                onChange={(r) => onChange(f.id, r)}
                labelClass="w-24 shrink-0"
                ratio={f.ratio}
              />
            ))}
          </div>
          {/* Said where the bound is typed: a motor whose figure the catalog
              does not state cannot be checked, so a bound on it hides it. */}
          <p className="text-[11px] leading-snug text-ink-faint">{t('motorDlg.perfMissingNote')}</p>
        </div>
      )}
    </div>
  );
}

/** A checkbox filter: the look the fit and plugged boxes share. */
function FilterCheck({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return <Check checked={on} onChange={onChange} label={label} title={hint} className="text-xs text-ink-soft" />;
}

/**
 * Motors the manufacturer lists as available plugged, with no ejection charge.
 *
 * What the spec says, not what is possible: the delay control offers a plugged
 * choice on every motor, because any motor can be flown that way for staging or
 * for electronically triggered recovery. This finds the ones built without a
 * charge, which is most reloads and every hybrid.
 */
export function PluggedFilter({ plugged, onChange }: { plugged: boolean; onChange: (plugged: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <FilterCheck label={t('motorDlg.plugged')} hint={t('motorDlg.pluggedHint')} on={plugged} onChange={onChange} />
  );
}

/** Desktop's "Hide motors which are not in regular production". */
export function OopFilter({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation();
  return <FilterCheck label={t('motorDlg.hideOop')} hint={t('motorDlg.hideOopHint')} on={on} onChange={onChange} />;
}

/** Desktop's "Hide motors already used in the mount": in its other flight configurations. */
export function UsedFilter({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation();
  return <FilterCheck label={t('motorDlg.hideUsed')} hint={t('motorDlg.hideUsedHint')} on={on} onChange={onChange} />;
}

/**
 * "Fits the mount": the bore and the length the rocket actually has room for.
 *
 * It names the bore, because a filter that silently removes two thirds of the
 * catalog should say what it measured against - and because the number is the
 * one thing the user cannot see from inside this dialog.
 */
export function FitsMount({
  mount,
  fits,
  onChange,
}: {
  mount: MountFit;
  fits: boolean;
  onChange: (fits: boolean) => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  return (
    <FilterCheck
      label={t('motorDlg.fitsMount', {
        bore: `${u.fmtSym('motorDimensions', mount.bore / 1000)}`,
      })}
      hint={t('motorDlg.fitsMountHint')}
      on={fits}
      onChange={onChange}
    />
  );
}
