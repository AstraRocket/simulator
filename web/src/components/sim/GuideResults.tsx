import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnits, type Units } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import { hasLocalCurve, type CatalogMotor } from '../../services/motors/motorDb';
import { keyOf } from '../../services/motors/motorKey';
import { avgThrustOf } from '../../services/motors/motorMath';
import { motorName } from '../../services/motors/motorName';
import { fmtNum } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';

/**
 * The parts the design's motor guide and the simple rocket's share: the
 * candidates a Fly would fly, and the flights read back as one sortable table,
 * or one card per motor on a phone.
 */

/** A guide row: one motor and what it did. */
export interface GuideRowBase {
  key: string;
  motor: CatalogMotor;
}

/** One table column: a figure off the row, in SI, and the unit it is shown in. */
export interface GuideCol<R> {
  id: string;
  label: string;
  /** Unit group; absent for a figure with one unit, which the label then names. */
  quantity?: Quantity;
  value: (r: R) => number | null;
  /** Fixed decimals for a unitless figure. */
  digits?: number;
}

/**
 * The motor's own figures, which both guides open with, as the list before the
 * flight shows them, so how much motor it is sits beside what it did.
 */
export const motorCols = <R extends GuideRowBase>(): GuideCol<R>[] => [
  { id: 'impulse', label: 'motorDlg.totalImpulse', quantity: 'impulse', value: (r) => r.motor.impulse },
  { id: 'avgThrust', label: 'motorDlg.avgThrust', quantity: 'force', value: (r) => avgThrustOf(r.motor) },
];

const cellText = <R,>(c: GuideCol<R>, r: R, u: Units): string => {
  const v = c.value(r);
  if (v == null || !Number.isFinite(v)) return NO_VALUE;
  return c.quantity ? u.fmt(c.quantity, v) : fmtNum(v, c.digits ?? 1);
};

/** The column a guide is sorted by, 'motor' or a column id, and which way. */
export interface GuideSort {
  key: string;
  desc: boolean;
}

/** Sorted by `val`; unknown figures sort last whichever way the column runs. */
export function sortGuideRows<R>(rows: readonly R[], val: (r: R) => number | string, desc: boolean): R[] {
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const xn = typeof x === 'number' && !Number.isFinite(x);
    const yn = typeof y === 'number' && !Number.isFinite(y);
    if (xn || yn) return xn === yn ? 0 : xn ? 1 : -1;
    const c = typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number);
    return desc ? -c : c;
  });
}

/**
 * The filter matches split into the motors a guide can fly (a curve on hand)
 * and the rest, which are listed for their specs alone, with the ones the user
 * left out. Kept as exclusions rather than a ticked set, so a motor a filter
 * change brings in arrives ticked.
 */
export function useGuideCandidates(matches: CatalogMotor[]) {
  const candidates = useMemo(() => matches.filter(hasLocalCurve), [matches]);
  const noCurve = useMemo(() => matches.filter((m) => !hasLocalCurve(m)), [matches]);
  const [dropped, setDropped] = useState<ReadonlySet<string>>(() => new Set());
  const flying = useMemo(() => candidates.filter((m) => !dropped.has(keyOf(m))), [candidates, dropped]);
  return { candidates, noCurve, dropped, setDropped, flying };
}

/** A row's "Use": takes the motor and its figures back to whatever asked. */
export function GuideUseButton({
  name,
  size,
  disabled,
  title,
  onClick,
}: {
  /** The motor's name, for the label a screen reader reads. */
  name: string;
  size: string;
  disabled: boolean;
  title: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={t('guide.useNamed', { motor: name })}
      className={`rounded-md bg-raised font-medium text-ink ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40 ${size}`}
    >
      {t('guide.use')}
    </button>
  );
}

const toolButton =
  'rounded-lg bg-raised px-3 py-1.5 text-xs font-medium ring-1 ring-line/10 hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40';

/** Over the flights: how many flew, the CSV, Clear, and the stale notice. */
export function GuideToolbar({
  guide,
  onCsv,
  onClear,
  staleText,
}: {
  guide: { rows: readonly unknown[]; asked: number; partial: boolean };
  onCsv: () => void;
  onClear: () => void;
  /** Shown when the rocket has changed since the guide flew; null when it has not. */
  staleText: string | null;
}) {
  const { t } = useTranslation();
  const flown = guide.rows.length;
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
      <span className="text-ink-muted">
        {t(guide.partial ? 'guide.flownPartial' : 'guide.flown', { flown, asked: guide.asked })}
      </span>
      <button onClick={onCsv} disabled={!flown} className={`${toolButton} text-ink`}>
        <span aria-hidden>⬇ CSV</span>
        <span className="sr-only">{t('guide.exportCsv')}</span>
      </button>
      <button onClick={onClear} className={`${toolButton} text-ink-soft`}>
        {t('guide.clear')}
      </button>
      {/* The rows stay on screen and say so, as a stale drift sweep does: they
          are still the honest answer for the rocket that flew them. */}
      {staleText && <span className="text-warn-400">{staleText}</span>}
    </div>
  );
}

/**
 * The flights, sorted, as a table on a desktop or one card per motor on a
 * phone, and under them the motors that did not fly and why.
 */
export function GuideResults<R extends GuideRowBase>({
  rows,
  failed,
  cols,
  colLabel,
  sort,
  onSort,
  descFirst,
  delay,
  statusSorts,
  status,
  pick,
  cards,
}: {
  /** Already sorted by `sort`. */
  rows: readonly R[];
  failed: readonly { key: string; motor: CatalogMotor; reason: string }[];
  cols: readonly GuideCol<R>[];
  colLabel: (c: GuideCol<R>) => string;
  sort: GuideSort;
  onSort: (next: GuideSort | ((s: GuideSort) => GuideSort)) => void;
  /** Whether a column first sorts high to low: figures do, names do not. */
  descFirst: (key: string) => boolean;
  /** The delay each motor flew at, as a column after the motor; absent for none. */
  delay?: (r: R) => { text: string; title?: string };
  /** Whether the status column sorts too. */
  statusSorts: boolean;
  status: (r: R) => ReactNode;
  pick: (r: R, name: string, size: string) => ReactNode;
  /** One card per motor rather than a table a dozen and more columns wide (phones). */
  cards: boolean;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const select =
    'rounded-md bg-raised px-2 py-1 text-xs text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';

  const header = (key: string, label: string, align: 'left' | 'right' = 'right') => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        scope="col"
        aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}
        // Headers wrap, onto two lines at most for these labels: held to one
        // line, "Thrust/weight at exit" and its neighbors set the column
        // widths, and fourteen columns then scroll sideways in a dialog that
        // has room for every figure in them.
        className={`px-1.5 py-1.5 align-bottom font-medium leading-tight ${align === 'left' ? 'text-left' : 'text-right'}`}
      >
        <button
          onClick={() => onSort((s) => ({ key, desc: s.key === key ? !s.desc : descFirst(key) }))}
          className={`hover:text-ink-strong ${align === 'left' ? 'text-left' : 'text-right'} ${active ? 'text-ink-strong' : ''}`}
        >
          {label}
          {active && <span aria-hidden="true">{sort.desc ? ' ▾' : ' ▴'}</span>}
        </button>
      </th>
    );
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      {cards ? (
        <>
          {/* No headers to click, so the sort is a pick and a direction. */}
          <div className="flex items-center gap-2 pb-2 text-xs">
            <label className="flex items-center gap-2 text-ink-muted">
              {t('guide.sortBy')}
              <select
                value={sort.key}
                onChange={(e) => onSort({ key: e.target.value, desc: descFirst(e.target.value) })}
                className={select}
              >
                <option value="motor">{t('guide.colMotor')}</option>
                {delay && <option value="delay">{t('guide.colDelay')}</option>}
                {cols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {colLabel(c)}
                  </option>
                ))}
                {statusSorts && <option value="status">{t('guide.colStatus')}</option>}
              </select>
            </label>
            <button onClick={() => onSort((s) => ({ ...s, desc: !s.desc }))} className={select}>
              {sort.desc ? `▾ ${t('guide.sortDesc')}` : `▴ ${t('guide.sortAsc')}`}
            </button>
          </div>
          <ul className="space-y-2">
            {rows.map((r) => {
              const name = motorName(r.motor);
              const d = delay?.(r);
              return (
                <li key={r.key} className="rounded-lg bg-raised/40 p-3 text-xs ring-1 ring-line/10">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-sm font-medium text-ink-strong">{name}</span>
                      <span className="ml-1.5 text-ink-faint">{r.motor.manufacturer}</span>
                      {d && (
                        <span className="ml-1.5 text-ink-soft" title={d.title}>
                          {`${t('guide.colDelay')} ${d.text}`}
                        </span>
                      )}
                      <div className="mt-0.5">{status(r)}</div>
                    </div>
                    {pick(r, name, 'shrink-0 px-3 py-1.5 text-xs')}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                    {cols.map((c) => (
                      <div key={c.id} className="flex justify-between gap-2">
                        <dt className={sort.key === c.id ? 'text-ink-strong' : 'text-ink-muted'}>{colLabel(c)}</dt>
                        <dd className={sort.key === c.id ? 'font-medium text-ink-strong' : 'text-ink-soft'}>
                          {cellText(c, r, u)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead className="sticky top-0 bg-surface text-ink-muted">
            <tr>
              {header('motor', t('guide.colMotor'), 'left')}
              {delay && header('delay', t('guide.colDelay'))}
              {cols.map((c) => header(c.id, colLabel(c)))}
              {statusSorts ? (
                header('status', t('guide.colStatus'), 'left')
              ) : (
                <th scope="col" className="px-1.5 py-1.5 text-left align-bottom font-medium">
                  {t('guide.colStatus')}
                </th>
              )}
              <th scope="col" className="px-1.5 py-1.5 align-bottom">
                <span className="sr-only">{t('guide.colUse')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/5">
            {rows.map((r) => {
              const name = motorName(r.motor);
              const d = delay?.(r);
              return (
                <tr key={r.key} className="hover:bg-raised/50">
                  <th scope="row" className="whitespace-nowrap px-1.5 py-1.5 text-left font-medium text-ink-strong">
                    {name}
                    <span className="ml-1.5 font-normal text-ink-faint">{r.motor.manufacturer}</span>
                  </th>
                  {d && (
                    <td className="px-1.5 py-1.5 text-right" title={d.title}>
                      {d.text}
                    </td>
                  )}
                  {cols.map((c) => (
                    <td key={c.id} className="whitespace-nowrap px-1.5 py-1.5 text-right text-ink-soft">
                      {cellText(c, r, u)}
                    </td>
                  ))}
                  <td className="px-1.5 py-1.5">{status(r)}</td>
                  <td className="px-1.5 py-1.5 text-right">{pick(r, name, 'px-2 py-0.5 text-[11px]')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {failed.length > 0 && (
        <div className="mt-3 space-y-1 text-xs">
          <h3 className="font-medium text-ink-muted">{t('guide.notFlown', { count: failed.length })}</h3>
          <ul className="space-y-0.5 text-ink-faint">
            {failed.map((x) => (
              <li key={x.key}>
                <span className="font-medium text-ink-soft">{motorName(x.motor)}</span> {x.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
