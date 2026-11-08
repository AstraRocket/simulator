import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchConditions } from '../../services/design/orkTree';
import { sourceStatus } from '../../services/weather/weatherSource';
import { formatCoord } from '../../services/map/slippyMap';
import { fmtSiteTime } from '../../i18n/format';
import { OpenMeteoCredit } from '../common/OpenMeteoCredit';
import { smallButton } from '../common/smallButton';

const TICK_MS = 60_000;

export function WeatherSourceLine({
  launch,
  onRefresh,
  summary = true,
}: {
  launch: LaunchConditions;
  summary?: boolean;
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const source = launch.weatherSource;
  useEffect(() => {
    if (!source) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [source]);
  const status = sourceStatus(launch, now);
  if (!source || !status) return null;

  const notes = [
    status.edited && t('weather.source.edited'),
    status.otherSite && t('weather.source.otherSite'),
    status.old && t('weather.source.old'),
  ].filter(Boolean);

  return (
    <div className="space-y-1 rounded-md bg-raised/60 p-2 ring-1 ring-line/10">
      {summary && (
        <p className="text-xs text-ink-soft">
          {t(source.endpoint === 'archive' ? 'weather.source.record' : 'weather.source.forecast', {
            when: fmtSiteTime(source.validAt, source.timezone),
            where: formatCoord(source.latitudeDeg, source.longitudeDeg, 3),
            fetched: fmtSiteTime(source.fetchedAt, undefined),
          })}
        </p>
      )}
      {notes.map((n) => (
        <p key={n as string} className="text-xs text-warn-400">
          {n}
        </p>
      ))}
      {onRefresh && (
        <button onClick={onRefresh} className={smallButton('xs', 'accent')}>
          {t('weather.source.refresh')}
        </button>
      )}
      {/* CC BY 4.0 requires the credit wherever the data is shown. */}
      <OpenMeteoCredit />
    </div>
  );
}
