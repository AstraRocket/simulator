import { useTranslation } from 'react-i18next';
import { LocationPicker } from '../sim/LocationPicker';
import { loadSettings } from '../../services/storage/settings';
import { defaultToolSite } from './remembered';
import { SiteMapButton } from '../sim/SiteMapDialog';
import { SiteElevationField } from '../sim/SiteQNum';
import { LatLonRows } from '../sim/LatLonRows';
import { smallButton } from '../common/smallButton';

export interface ToolSite {
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  launchAltitudeM: number | null;
}

/** With `elevation`, a blank height means the terrain model's. */
export function SiteFields({
  site,
  onChange,
  elevation = false,
}: {
  site: ToolSite;
  onChange: (update: (s: ToolSite) => ToolSite) => void;
  elevation?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <LocationPicker
        launch={site}
        defaultSite={() => defaultToolSite(loadSettings().launchDefaults)}
        onChange={(p) =>
          onChange((s) => ({
            latitudeDeg: p.latitudeDeg !== undefined ? p.latitudeDeg : s.latitudeDeg,
            longitudeDeg: p.longitudeDeg !== undefined ? p.longitudeDeg : s.longitudeDeg,
            launchAltitudeM: p.launchAltitudeM !== undefined ? p.launchAltitudeM : s.launchAltitudeM,
          }))
        }
      />
      <LatLonRows
        latitudeDeg={site.latitudeDeg}
        longitudeDeg={site.longitudeDeg}
        onChange={(patch) => onChange((s) => ({ ...s, ...patch }))}
      />
      {elevation && (
        <SiteElevationField
          placeholder={t('landing.terrain')}
          hint={t('landing.siteElevationHint')}
          value={site.launchAltitudeM}
          onChange={(v) => onChange((s) => ({ ...s, launchAltitudeM: v }))}
        />
      )}
      <SiteMapButton
        latitudeDeg={site.latitudeDeg}
        longitudeDeg={site.longitudeDeg}
        onPick={(la, lo) => onChange((s) => ({ ...s, latitudeDeg: la, longitudeDeg: lo, launchAltitudeM: null }))}
        className={smallButton('sm', 'soft', 'w-full')}
      />
    </>
  );
}
