import type { ReactNode } from 'react';
import { SortHeader } from '../common/SortHeader';
import { useTranslation } from 'react-i18next';
import { useUnits, type Units } from '../../prefs/useUnits';
import type { Quantity } from '../../prefs/units';
import type { CatalogMotor } from '../../services/motors/motorDb';
import { motorName } from '../../services/motors/motorName';
import { fmtNum } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import {
  ClassChips,
  FitsMount,
  ImpulseRange,
  ManufacturerMenu,
  OopFilter,
  PerfFilters,
  PluggedFilter,
  SparkyFilter,
} from './MotorFilterBar';
import { MotorSearch } from './MotorPanelParts';
import type { useMotorFilter } from './useMotorFilter';

export interface GuideRowBase {
  key: string;
  motor: CatalogMotor;
}

/** `value` is in SI. */
export interface GuideCol<R> {
  id: string;
  label: string;
  quantity?: Quantity;
  value: (r: R) => number | null;
  digits?: number;
}

const cellText = <R,>(c: GuideCol<R>, r: R, u: Units): string => {
  const v = c.value(r);
  if (v == null || !Number.isFinite(v)) return NO_VALUE;
  return c.quantity ? u.fmt(c.quantity, v) : fmtNum(v, c.digits ?? 1);
};

export interface GuideSort {
  key: string;
  desc: boolean;
}

export function GuideUseButton({
  name,
  size,
  disabled,
  title,
  onClick,
}: {
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

export function GuideToolbar({
  guide,
  onCsv,
  onClear,
  staleText,
}: {
  guide: { rows: readonly unknown[]; asked: number; partial: boolean };
  onCsv: () => void;
  onClear: () => void;
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
      {staleText && <span className="text-warn-400">{staleText}</span>}
    </div>
  );
}

const runButton =
  'rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-line/10 disabled:cursor-not-allowed disabled:opacity-40';

/** The filters and the fly row above both guides' candidate lists; `lead` opens the first row. */
export function GuideFilterPanel({
  filter: f,
  lead,
  hidden,
  run,
  onFly,
  onCancel,
  flying,
  max,
  costText,
  leftOut,
  loading,
  failed,
}: {
  filter: ReturnType<typeof useMotorFilter>;
  lead?: ReactNode;
  hidden: boolean;
  run: { done: number; total: number } | null;
  onFly: () => void;
  onCancel: () => void;
  flying: number;
  max: number;
  costText: string;
  leftOut: number;
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useTranslation();
  const tooMany = flying > max;
  return (
    <div className={`space-y-2 border-b border-line/10 p-3 ${hidden ? 'hidden' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {lead}
        <MotorSearch value={f.text} onChange={f.setText} className="min-w-[140px] py-1.5" />
        <ManufacturerMenu manufacturers={f.manufacturers} mfrs={f.mfrs} onChange={f.setMfrs} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ClassChips classes={f.classes} cls={f.cls} onChange={f.setCls} />
        <ImpulseRange imp={f.imp} onChange={f.setImp} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {f.mount && <FitsMount mount={f.mount} fits={f.fits} onChange={f.setFits} />}
        <PluggedFilter plugged={f.plugged} onChange={f.setPlugged} />
        <SparkyFilter value={f.sparky} onChange={f.setSparky} />
        <OopFilter on={f.hideOop} onChange={f.setHideOop} />
      </div>
      <PerfFilters perf={f.perf} onChange={f.setPerf} onClear={f.clearPerf} fields={f.perfFields} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {run ? (
          <>
            <button onClick={onCancel} className={`${runButton} bg-raised text-ink hover:bg-elevated`}>
              {t('common.cancel')}
            </button>
            <span className="text-xs tabular-nums text-ink-muted" role="status">
              {t('guide.progress', { done: run.done, total: run.total })}
            </span>
          </>
        ) : (
          <button
            onClick={onFly}
            disabled={loading || failed || flying === 0 || tooMany}
            className={`${runButton} bg-accent-600 text-on-accent hover:bg-accent-700`}
          >
            {tooMany || flying === 0 ? t('guide.flyIdle') : t('guide.fly', { count: flying })}
          </button>
        )}
        {!run && !loading && (
          <span className="text-xs">
            <span className={tooMany ? 'text-warn-400' : 'text-ink-faint'}>
              {tooMany ? t('guide.tooMany', { count: flying, max }) : costText}
            </span>
            {leftOut > 0 && (
              <span className="text-ink-faint">{` ${t('guide.noCurveLeftOut', { count: leftOut })}`}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

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
  rows: readonly R[];
  failed: readonly { key: string; motor: CatalogMotor; reason: string }[];
  cols: readonly GuideCol<R>[];
  colLabel: (c: GuideCol<R>) => string;
  sort: GuideSort;
  onSort: (next: GuideSort | ((s: GuideSort) => GuideSort)) => void;
  descFirst: (key: string) => boolean;
  delay?: (r: R) => { text: string; title?: string };
  statusSorts: boolean;
  status: (r: R) => ReactNode;
  pick: (r: R, name: string, size: string) => ReactNode;
  cards: boolean;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const select =
    'rounded-md bg-raised px-2 py-1 text-xs text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';

  const header = (key: string, label: string, align: 'left' | 'right' = 'right') => (
    <SortHeader
      key={key}
      active={sort.key === key}
      dir={sort.desc ? -1 : 1}
      onSort={() => onSort((s) => ({ key, desc: s.key === key ? !s.desc : descFirst(key) }))}
      className={`px-1.5 py-1.5 align-bottom font-medium leading-tight ${align === 'left' ? 'text-left' : 'text-right'}`}
    >
      {label}
    </SortHeader>
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
      {cards ? (
        <>
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
                      <span className="font-data text-sm font-medium text-ink-strong">{name}</span>
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
                    <span className="font-data">{name}</span>
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
                <span className="font-data font-medium text-ink-soft">{motorName(x.motor)}</span> {x.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
