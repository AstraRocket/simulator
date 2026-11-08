import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { simStatusLabel, type simStatus } from '../../services/flight/simulations';
import { stabilityState, stabilityToneOf, stabilityVerdictKey } from '../../services/flight/simReport';
import { STABILITY_GLYPH } from '../../tree/schematicGeometry';
import { fmtNum } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import type { StaticInfo } from '../../engine/api';

export function stabilityReadout(cal: StaticInfo['stabilityCalibers'], t: TFunction): ReactNode {
  const pad = stabilityState(cal);
  return (
    <span className={pad ? stabilityToneOf(pad) : 'text-ink-muted'}>
      {pad && <span aria-hidden>{`${STABILITY_GLYPH[pad]} `}</span>}
      {fmtNum(cal, 2)} {t('stability.caliber')}
      {pad && <span className="sr-only">{` (${t(stabilityVerdictKey(cal))})`}</span>}
    </span>
  );
}

export function flightReadout({
  status,
  outdated,
  value,
  onOpen,
  t,
}: {
  status: ReturnType<typeof simStatus>;
  outdated: boolean;
  /** The apogee as shown, or null with no summary to read. */
  value: string | null;
  /** Null when there is no result to open. */
  onOpen: (() => void) | null;
  t: TFunction;
}): ReactNode {
  if (status === 'running' || status === 'queued') {
    return <span className="text-accent-400">{simStatusLabel(status, t)}</span>;
  }
  if (value === null) return NO_VALUE;
  const shown = outdated ? (
    <>
      <span className="text-ink-muted">{value}</span>{' '}
      <span className="text-[10px] font-medium text-warn-300">{simStatusLabel('outdated', t)}</span>
    </>
  ) : (
    value
  );
  if (!onOpen) return shown;
  return (
    <button
      onClick={onOpen}
      title={t('summary.openResults')}
      className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
    >
      {shown}
    </button>
  );
}
