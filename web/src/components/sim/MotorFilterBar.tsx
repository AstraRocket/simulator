import { useState } from 'react';
import { fromCatalog } from '../../services/motors/catalogUnits';
import { useTranslation } from 'react-i18next';
import { withUnit } from '../../i18n/format';
import { SPARKY_CHOICES, type SparkyChoice } from '../../services/motors/motorDb';
import { STD_DIAMS, MAX_IDX, type MountFit } from '../../services/motors/motorPicker';
import { useUnits } from '../../prefs/useUnits';
import { RangeSlider } from './RangeSlider';
import { ToggleButton } from '../common/ToggleButton';
import { UnitBound } from '../common/UnitBound';
import { CheckMenu } from '../common/CheckMenu';
import { toggled } from '../../services/app/collections';
import type { RememberedSlot } from '../tools/remembered';
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

export interface MotorFilterInit {
  mfrs?: Set<string>;
  /** [low, high] slider indices. */
  dia?: [number, number];
  mount?: MountFit | null;
  perfFields?: readonly PerfDef[];
  /** Keeps the filters past an unmount. */
  slot?: RememberedSlot<MotorFilterHeld>;
}

export interface MotorFilterHeld {
  text: string;
  cls: string | null;
  mfrs: Set<string>;
  imp: ImpulseRange;
  perf: PerfRanges;
  plugged: boolean;
  sparky: SparkyChoice;
  freeLow: number;
  freeHigh: number;
  dia: [number, number];
}

/** In N·s. */
export type ImpulseRange = [min: number | null, max: number | null];

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <ToggleButton active={active} onClick={onClick} className="rounded-full px-2.5 py-1 text-xs font-medium">
      {label}
    </ToggleButton>
  );
}

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

export function DiameterRange({ dia, onChange }: { dia: [number, number]; onChange: (dia: [number, number]) => void }) {
  const { t } = useTranslation();
  const u = useUnits();
  const [lowIdx, highIdx] = dia;
  // Stops are held in mm like the catalog; only the readout uses the user's unit.
  const stop = (i: number) => u.fmt('motorDimensions', fromCatalog(STD_DIAMS[i]!));
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

export function ImpulseRange({ imp, onChange }: { imp: ImpulseRange; onChange: (imp: ImpulseRange) => void }) {
  const { t } = useTranslation();
  return <BoundPair label={t('motorDlg.totalImpulse')} quantity="impulse" range={imp} onChange={onChange} />;
}

const BOUND_FIELD =
  'w-16 rounded-md bg-canvas px-2 py-1 text-right text-xs tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';

/** Held in SI, typed in the user's unit; without `quantity`, in seconds as held. */
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

export function PerfFilters({
  perf,
  onChange,
  onClear,
  fields = PERF_FIELDS,
}: {
  perf: PerfRanges;
  onChange: (field: PerfField, range: PerfRange) => void;
  onClear: () => void;
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
          {/* Container queries: the picker's list is a 440px column inside a wide dialog. */}
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
          <p className="text-[11px] leading-snug text-ink-faint">{t('motorDlg.perfMissingNote')}</p>
        </div>
      )}
    </div>
  );
}

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

export function PluggedFilter({ plugged, onChange }: { plugged: boolean; onChange: (plugged: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <FilterCheck label={t('motorDlg.plugged')} hint={t('motorDlg.pluggedHint')} on={plugged} onChange={onChange} />
  );
}

export function SparkyFilter({ value, onChange }: { value: SparkyChoice; onChange: (v: SparkyChoice) => void }) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-1.5 text-xs text-ink-soft" title={t('motorDlg.sparkyFilterHint')}>
      {t('motorDlg.sparkyFilter')}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SparkyChoice)}
        className="rounded-md bg-raised px-1.5 py-0.5 text-xs text-ink ring-1 ring-line/10"
      >
        {SPARKY_CHOICES.map((c) => (
          <option key={c} value={c}>
            {t(`motorDlg.sparky_${c}`)}
          </option>
        ))}
      </select>
    </label>
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
        bore: `${u.fmtSym('motorDimensions', fromCatalog(mount.bore))}`,
      })}
      hint={t('motorDlg.fitsMountHint')}
      on={fits}
      onChange={onChange}
    />
  );
}
