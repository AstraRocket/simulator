import { useMemo } from 'react';
import { useLauncherT } from '../common/useLauncher';
import { fmtNum, stageLabel } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import type { FlightResult } from '../../engine/api';
import { CSV_MIME, flightEventsCsv } from '../../services/exports/csvExport';
import { EVENT_EXTRAS, EVENT_NAME, eventRows, type EventRow, type ExtraKey } from '../../services/flight/flightEvents';
import { download, exportFilename } from '../../services/files/saveFile';
import { unitScope } from '../../prefs/units';
import { useUnits } from '../../prefs/useUnits';
import { UnitChip } from '../common/UnitChip';
import { componentName } from '../../services/app/warningText';
import { CardGroup } from '../common/CardGroup';
import { smallButton } from '../common/smallButton';

const NUM = 'py-1 pl-2 text-right tabular-nums';

function Extras({ row }: { row: EventRow }) {
  const t = useLauncherT();
  const u = useUnits();
  const q = u.at(unitScope('sim', 'maxQ'), 'pressure');
  const parts = (EVENT_EXTRAS[row.type] ?? []).flatMap((k: ExtraKey) => {
    const v = row[k];
    if (v == null || !Number.isFinite(v)) return [];
    switch (k) {
      case 'stability':
        return [`${fmtNum(v, 2)} ${t('stability.caliber')}`];
      case 'twr':
        return [`${t('flight.twr')} ${fmtNum(v, 1)}`];
      case 'aoa':
        return [`${t('flight.aoa')} ${u.fmtSym('angle', v, 1)}`];
      case 'mach':
        return [`${t('flight.mach')} ${fmtNum(v, 2)}`];
      case 'q':
        return [`${q.fmtSym(v)}`];
    }
  });
  if (!parts.length) return null;
  return <div className="pb-1 pl-2 text-[10px] leading-snug text-ink-faint">{parts.join(' · ')}</div>;
}

export function FlightEventsTable({
  sim,
  simName,
  designName,
}: {
  sim: FlightResult | null;
  simName?: string;
  designName?: string;
}) {
  const t = useLauncherT();
  const u = useUnits();
  const alt = u.at(unitScope('events', 'altitude'), 'distance');
  const spd = u.at(unitScope('events', 'velocity'), 'velocity');
  const rows = useMemo(() => eventRows(sim), [sim]);
  const staged = (sim?.branches?.length ?? 0) > 1;
  const stageName = (r: EventRow) => (staged ? stageLabel(t, r.branch, r.branchName) : '');
  if (!sim || !rows.length) return null;

  return (
    <CardGroup
      title={t('flight.events')}
      region
      aside={
        <button
          onClick={() =>
            download(
              exportFilename([designName, simName, 'flight-events'], 'csv'),
              flightEventsCsv(rows, u.all, t, (r) => t(EVENT_NAME[r.type]!), stageName, simName),
              CSV_MIME,
            )
          }
          title={t('flight.eventsCsv')}
          className={smallButton('chip', 'ink', 'shrink-0')}
        >
          <span aria-hidden>⬇</span> <span aria-hidden>CSV</span>
          <span className="sr-only">{t('flight.eventsCsv')}</span>
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line/10 text-[10px] uppercase tracking-wide text-ink-muted">
              <th scope="col" className="py-1 text-left font-normal">
                {t('flight.event')}
              </th>
              <th scope="col" className="py-1 pl-2 text-right font-normal">
                {t('flight.time')}
              </th>
              <th scope="col" className="py-1 pl-2 text-right font-normal">
                <span className="block">{t('flight.altitude')}</span>
                <UnitChip
                  label={t('flight.altitude')}
                  quantity="distance"
                  scope={unitScope('events', 'altitude')}
                  className="text-[10px]"
                />
              </th>
              <th scope="col" className="py-1 pl-2 text-right font-normal">
                <span className="block">{t('flight.velocity')}</span>
                <UnitChip
                  label={t('flight.velocity')}
                  quantity="velocity"
                  scope={unitScope('events', 'velocity')}
                  className="text-[10px]"
                />
              </th>
            </tr>
          </thead>
          {rows.map((r) => (
            <tbody key={r.key} className="border-b border-line/5 last:border-0">
              <tr>
                <th scope="row" className="py-1 text-left font-medium text-ink">
                  {t(EVENT_NAME[r.type]!)} {/* The {' '} keeps copied text from running the names together. */}
                  {r.source && (
                    <span className="ml-1 font-normal text-ink-faint">{componentName(r.source, t)}</span>
                  )}{' '}
                  {staged && (
                    <span className="ml-1 whitespace-nowrap rounded bg-raised px-1 text-[10px] font-normal text-ink-muted">
                      {stageName(r)}
                    </span>
                  )}
                </th>
                <td className={NUM}>{fmtNum(r.time, 2)}</td>
                <td className={NUM}>{r.altitude != null ? alt.fmt(r.altitude) : NO_VALUE}</td>
                <td className={NUM}>{r.velocity != null ? spd.fmt(r.velocity, 1) : NO_VALUE}</td>
              </tr>
              <tr>
                <td colSpan={4} className="p-0">
                  <Extras row={r} />
                </td>
              </tr>
            </tbody>
          ))}
        </table>
      </div>
    </CardGroup>
  );
}
