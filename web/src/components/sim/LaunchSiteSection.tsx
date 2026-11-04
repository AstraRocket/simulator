import { useState } from 'react';
import { CardGroup } from '../common/CardGroup';
import { StatusLine } from '../common/StatusLine';
import { smallButton } from '../common/smallButton';
import { useLatest } from '../common/useLatest';
import { SITE_ALTITUDE_FIELD } from '../../prefs/launchUnits';
import { LAUNCH_SITE_LIMITS } from '../../services/storage/launchLocationStore';
import { roundCoord } from '../../services/map/slippyMap';
import { LocationPicker } from './LocationPicker';
import { LatLonRows } from './LatLonRows';
import { SiteMapDialog } from './SiteMapDialog';
import { QNum } from './QNum';
import type { LaunchSectionProps } from './launchSection';

export function LaunchSiteSection({ launch, onChange, onCommit, t, u, mixed, req }: LaunchSectionProps) {
  const [locating, setLocating] = useState(false);
  const [locateErr, setLocateErr] = useState<string | null>(null);
  // The permission prompt outlives the panel, so only the current attempt may write.
  const locate = useLatest();
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <CardGroup title={t('launch.site')}>
      <LocationPicker launch={launch} onChange={onChange} onCommit={onCommit} />
      <QNum
        label={t('launch.altitude')}
        field={SITE_ALTITUDE_FIELD}
        kind="distance"
        u={u}
        stepSi={10}
        minSi={LAUNCH_SITE_LIMITS.launchAltitudeM.min}
        maxSi={LAUNCH_SITE_LIMITS.launchAltitudeM.max}
        mixed={mixed('launchAltitudeM')}
        {...req('launchAltitudeM')}
        value={launch.launchAltitudeM}
        onChange={(v) => onChange({ launchAltitudeM: v })}
      />
      <LatLonRows
        latitudeDeg={launch.latitudeDeg}
        longitudeDeg={launch.longitudeDeg}
        marks={(k) => ({ mixed: mixed(k), ...req(k) })}
        onChange={onChange}
      />
      {'geolocation' in navigator && (
        <button
          onClick={() => {
            setLocateErr(null);
            setLocating(true);
            const mine = locate.claim();
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (!mine()) return;
                setLocating(false);
                setLocateErr(null);
                // The browser's altitude is above the ellipsoid, not sea level.
                onChange({
                  latitudeDeg: roundCoord(pos.coords.latitude),
                  longitudeDeg: roundCoord(pos.coords.longitude),
                  launchAltitudeM: null,
                });
                onCommit?.();
              },
              () => {
                if (!mine()) return;
                setLocating(false);
                setLocateErr(t('launch.locationDenied'));
              },
              { timeout: 10000 },
            );
          }}
          disabled={locating}
          className={smallButton('row', 'soft', 'w-full')}
        >
          <span aria-hidden="true">📍</span> {locating ? t('launch.locating') : t('launch.useLocation')}
        </button>
      )}
      <button onClick={() => setMapOpen(true)} className={smallButton('row', 'soft', 'w-full')}>
        <span aria-hidden="true">🗺</span> {t('map.show')}
      </button>
      {/* Always mounted: a live region created with its text is not announced. */}
      <StatusLine tone="warn" size="fine" className="mt-1">
        {locateErr}
      </StatusLine>
      {mapOpen && (
        <SiteMapDialog
          latitudeDeg={launch.latitudeDeg}
          longitudeDeg={launch.longitudeDeg}
          onPick={(la, lo) => {
            onChange({ latitudeDeg: la, longitudeDeg: lo, launchAltitudeM: null });
            onCommit?.();
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </CardGroup>
  );
}
