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

/** The launch site: a saved location, its elevation and coordinates, the browser's location, or a map pick. */
export function LaunchSiteSection({ launch, onChange, onCommit, t, u, mixed, req }: LaunchSectionProps) {
  // Geolocation is a 10 s round trip that can simply be refused. Without a
  // pending state and a reported error, both outcomes are invisible and the
  // button appears to do nothing.
  const [locating, setLocating] = useState(false);
  const [locateErr, setLocateErr] = useState<string | null>(null);
  // Which "use my location" attempt is current: the prompt outlives the panel.
  const locate = useLatest();
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <CardGroup title={t('launch.site')}>
      {/* Above the three fields it fills, because picking a saved location is the
          alternative to typing them rather than something you do after. */}
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
            // The browser's permission prompt can sit unanswered for minutes,
            // and `onChange` writes to whatever rows are the current edit
            // targets. Without this, allowing the prompt after switching
            // simulations would put the launch site on the wrong one.
            const mine = locate.claim();
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (!mine()) return;
                setLocating(false);
                setLocateErr(null);
                // The elevation is cleared, as LocationPicker clears it for a
                // place with none known: the browser's altitude is height
                // above the ellipsoid, not above sea level, and keeping the
                // previous site's would fly the wrong air unannounced.
                onChange({
                  latitudeDeg: roundCoord(pos.coords.latitude),
                  longitudeDeg: roundCoord(pos.coords.longitude),
                  launchAltitudeM: null,
                });
                onCommit?.();
              },
              () => {
                if (!mine()) return;
                // Denial is silent, and there is a 10 s timeout behind it,
                // so the pending state has to be cleared on both paths or the
                // button never settles.
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
      {/* Always mounted, empty until there is something to say: a live
          region created together with its text is not announced by most
          screen readers (see UpdateToast), so the refusal would be silent to
          the people who cannot see the amber line. */}
      <StatusLine tone="warn" size="fine" className="mt-1">
        {locateErr}
      </StatusLine>
      {mapOpen && (
        <SiteMapDialog
          latitudeDeg={launch.latitudeDeg}
          longitudeDeg={launch.longitudeDeg}
          onPick={(la, lo) => {
            // A point on the map has no elevation of its own; see above.
            onChange({ latitudeDeg: la, longitudeDeg: lo, launchAltitudeM: null });
            onCommit?.();
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </CardGroup>
  );
}
