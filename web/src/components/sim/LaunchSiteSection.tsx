import { useState } from 'react';
import { CardGroup } from '../common/CardGroup';
import { StatusLine } from '../common/StatusLine';
import { smallButton } from '../common/smallButton';
import { useLatest } from '../common/useLatest';
import { roundCoord } from '../../services/map/slippyMap';
import { LocationPicker } from './LocationPicker';
import { LatLonRows } from './LatLonRows';
import { SiteMapButton } from './SiteMapDialog';
import { SiteElevationField } from './SiteQNum';
import type { LaunchSectionProps } from './launchSection';

export function LaunchSiteSection({ launch, onChange, onCommit, t, mixed, req }: LaunchSectionProps) {
  const [locating, setLocating] = useState(false);
  const [locateErr, setLocateErr] = useState<string | null>(null);
  // The permission prompt outlives the panel, so only the current attempt may write.
  const locate = useLatest();

  return (
    <CardGroup title={t('launch.site')}>
      <LocationPicker launch={launch} onChange={onChange} onCommit={onCommit} />
      <SiteElevationField
        label={t('launch.altitude')}
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
      <SiteMapButton
        latitudeDeg={launch.latitudeDeg}
        longitudeDeg={launch.longitudeDeg}
        onPick={(la, lo) => {
          onChange({ latitudeDeg: la, longitudeDeg: lo, launchAltitudeM: null });
          onCommit?.();
        }}
        className={smallButton('row', 'soft', 'w-full')}
      />
      {/* Always mounted: a live region created with its text is not announced. */}
      <StatusLine tone="warn" size="fine" className="mt-1">
        {locateErr}
      </StatusLine>
    </CardGroup>
  );
}
