import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchConditions } from '../../services/design/orkTree';
import {
  getLaunchLocationStore,
  locationFrom,
  type LaunchLocation,
  siteOf,
} from '../../services/storage/launchLocationStore';
import { loadSettings } from '../../services/storage/settings';
import { useLocationList } from './useLocationList';
import { confirm } from '../../state/confirmStore';
import { DesignPropertiesDialog } from '../layout/DesignPropertiesDialog';
import { LocationsDialog } from './LocationsDialog';
import { PlaceSearchDialog } from './PlaceSearchDialog';
import { StatusLine } from '../common/StatusLine';
import { smallButton } from '../common/smallButton';

import { sameName } from '../../services/app/names';
type LocationSite = Pick<LaunchConditions, 'latitudeDeg' | 'longitudeDeg' | 'launchAltitudeM'>;

const launchDefaultSite = (): LocationSite => {
  return siteOf(loadSettings().launchDefaults);
};

export function LocationPicker({
  launch,
  onChange,
  onCommit,
  defaultSite = launchDefaultSite,
}: {
  launch: LocationSite;
  onChange: (patch: Partial<LaunchConditions>) => void;
  onCommit?: () => void;
  defaultSite?: () => LocationSite;
}) {
  const { t } = useTranslation();
  const [naming, setNaming] = useState(false);
  const [managing, setManaging] = useState(false);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { locations: loaded, error: listError, refresh, write } = useLocationList();
  const locations = loaded ?? [];

  const apply = (location: LaunchLocation) => {
    onChange(siteOf(location));
    onCommit?.();
  };

  // The select's value derives from the fields, so this must change them or React snaps it back.
  const toDefaultSite = () => {
    onChange(defaultSite());
    onCommit?.();
  };

  const store = (fn: () => Promise<void>) => write(fn, setErr);

  // Matched on the numbers, not a remembered id, since the fields change by other routes.
  const near = (a: number | null | undefined, b: number, eps: number) => a != null && Math.abs(a - b) < eps;
  const sameAlt = (a: number | null | undefined, b: number | null) => (b === null ? a == null : near(a, b, 0.5));
  const current = locations.find(
    (p) =>
      near(launch.latitudeDeg, p.latitudeDeg, 1e-4) &&
      near(launch.longitudeDeg, p.longitudeDeg, 1e-4) &&
      sameAlt(launch.launchAltitudeM, p.launchAltitudeM),
  );

  const saveUnder = async (name: string) => {
    const existing = locations.find((p) => sameName(p.name, name));
    if (
      existing &&
      existing.id !== current?.id &&
      !(await confirm({
        message: t('location.replaceConfirm', { name: existing.name }),
        confirmLabel: t('location.replace'),
        danger: true,
      }))
    )
      return;
    await store(async () => {
      const location = locationFrom(name, launch);
      await getLaunchLocationStore().save(existing ? { ...location, id: existing.id } : location);
    });
  };

  const savable = launch.latitudeDeg != null && launch.longitudeDeg != null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <select
          aria-label={t('location.label')}
          value={current?.id ?? ''}
          onChange={(e) => {
            const location = locations.find((p) => p.id === e.target.value);
            if (location) apply(location);
            else toDefaultSite();
          }}
          className="min-w-0 flex-1 rounded-md bg-raised px-2 py-1.5 text-xs text-ink ring-1 ring-line/10"
        >
          <option value="">{t('location.custom')}</option>
          {locations.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSearching(true)}
          title={t('placeSearch.open')}
          aria-label={t('placeSearch.open')}
          className={smallButton('row', 'soft')}
        >
          🔍
        </button>
        <button
          onClick={() => setNaming(true)}
          disabled={!savable}
          title={savable ? t('location.save') : t('location.needsSite')}
          aria-label={t('location.save')}
          className={smallButton('row', 'soft')}
        >
          💾
        </button>
        <button
          onClick={() => setManaging(true)}
          disabled={locations.length === 0}
          title={t('location.manage')}
          aria-label={t('location.manage')}
          className={smallButton('row', 'soft')}
        >
          ⚙
        </button>
      </div>
      {/* Always mounted: a live region created with its text is not announced. */}
      <StatusLine tone="danger" size="fine">
        {err ?? listError}
      </StatusLine>

      {naming && (
        <DesignPropertiesDialog
          title={t('location.save')}
          confirmLabel={t('common.save')}
          initialName={current?.name ?? ''}
          takenNames={locations.filter((p) => p.id !== current?.id).map((p) => p.name)}
          duplicateText={t('location.duplicateName')}
          onCancel={() => setNaming(false)}
          onConfirm={(name) => {
            setNaming(false);
            void saveUnder(name);
          }}
        />
      )}

      {searching && (
        <PlaceSearchDialog
          onClose={() => setSearching(false)}
          onPick={(pick) => {
            setSearching(false);
            onChange(pick);
            onCommit?.();
          }}
        />
      )}

      {managing && (
        <LocationsDialog
          onApply={apply}
          onClose={() => {
            setManaging(false);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
