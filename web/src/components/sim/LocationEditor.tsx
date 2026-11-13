import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { latLonUnit } from '../../services/map/slippyMap';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { UnitChip } from '../common/UnitChip';
import { useUnits } from '../../prefs/useUnits';
import { onSi } from '../../prefs/entryValue';
import { unitScope } from '../../prefs/units';
import { LAUNCH_SI, SITE_ALTITUDE_FIELD } from '../../prefs/launchUnits';
import { uuid } from '../../services/app/uuid';
import { SiteMap } from './SiteMap';
import { LAUNCH_SITE_LIMITS as LIMITS, type LaunchLocation } from '../../services/storage/launchLocationStore';
import { EditorFooter, EditorBack } from '../common/MasterDetail';
import { useReportDirty } from '../common/useGuardedSelection';

import { nameTaken } from '../../services/app/names';
import { StackedField } from '../common/StackedField';
/** The parent keys this on the location, so selecting another re-seeds by remount. */
export function LocationEditor({
  location,
  takenNames = [],
  onDirtyChange,
  onSave,
  onDelete,
  onApply,
  onBack,
}: {
  location: LaunchLocation | null;
  takenNames?: string[];
  onDirtyChange: (dirty: boolean) => void;
  onSave: (location: LaunchLocation) => void;
  onDelete?: () => void;
  onApply?: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const nameRef = useRef<HTMLInputElement>(null);
  const nameId = useId();

  const [name, setName] = useState(location?.name ?? '');
  const [lat, setLat] = useState<number | null>(location?.latitudeDeg ?? null);
  const [lon, setLon] = useState<number | null>(location?.longitudeDeg ?? null);
  const [alt, setAlt] = useState<number | null>(location?.launchAltitudeM ?? null);

  const altUnit = u.at(unitScope('launch', SITE_ALTITUDE_FIELD), LAUNCH_SI.distance.q);

  // Layout effect, not deferred: a frame without focus lets keystrokes land in the wrong field.
  useLayoutEffect(() => {
    if (!location) nameRef.current?.select();
  }, [location]);

  const trimmed = name.trim();
  const duplicate = nameTaken(trimmed, takenNames);
  // A blank elevation is unknown, never sea level.
  const valid = trimmed !== '' && lat !== null && lon !== null;

  const dirty =
    name !== (location?.name ?? '') ||
    lat !== (location?.latitudeDeg ?? null) ||
    lon !== (location?.longitudeDeg ?? null) ||
    alt !== (location?.launchAltitudeM ?? null);

  useReportDirty(dirty, onDirtyChange);

  // Remounts the number fields: `NumberInput` keeps its focused draft until blur.
  const [revision, setRevision] = useState(0);

  const revert = () => {
    setName(location?.name ?? '');
    setLat(location?.latitudeDeg ?? null);
    setLon(location?.longitudeDeg ?? null);
    setAlt(location?.launchAltitudeM ?? null);
    setRevision((r) => r + 1);
  };

  const submit = () => {
    if (!valid) return;
    onSave({
      id: location?.id ?? uuid(),
      name: trimmed,
      latitudeDeg: lat,
      longitudeDeg: lon,
      launchAltitudeM: alt,
    });
  };

  return (
    <>
      <div // eslint-disable-line jsx-a11y-x/no-static-element-interactions -- catches Enter bubbling up from any field in the form; the div itself takes no input
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
        // Only from a field: Enter on the map is a pick that would save stale coordinates.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.defaultPrevented && e.target instanceof HTMLInputElement) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <EditorBack onBack={onBack} label={t('location.back')} className="-mb-1 self-start" />

        <div>
          <StackedField
            id={nameId}
            label={t('location.name')}
            labelClassName="block text-xs font-medium text-ink-muted"
            ref={nameRef}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {duplicate && <p className="text-[11px] leading-snug text-warn-400">{t('location.duplicateName')}</p>}

        <div key={revision} className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          <Row label={t('launch.latitude')} unit={latLonUnit('latitudeDeg', lat)}>
            <NumberInput
              ariaLabel={t('launch.latitude')}
              value={lat}
              step={0.0001}
              min={LIMITS.latitudeDeg.min}
              max={LIMITS.latitudeDeg.max}
              onChange={setLat}
              className={numberClass}
            />
          </Row>
          <Row label={t('launch.longitude')} unit={latLonUnit('longitudeDeg', lon)}>
            <NumberInput
              ariaLabel={t('launch.longitude')}
              value={lon}
              step={0.0001}
              min={LIMITS.longitudeDeg.min}
              max={LIMITS.longitudeDeg.max}
              onChange={setLon}
              className={numberClass}
            />
          </Row>
          <Row
            label={t('launch.altitude')}
            unit={
              <UnitChip
                label={t('launch.altitude')}
                quantity={LAUNCH_SI.distance.q}
                scope={unitScope('launch', SITE_ALTITUDE_FIELD)}
              />
            }
          >
            <NumberInput
              ariaLabel={t('launch.altitude')}
              value={alt === null ? null : altUnit.toUi(alt)}
              step={altUnit.step(10)}
              min={altUnit.toUi(LIMITS.launchAltitudeM.min)}
              max={altUnit.toUi(LIMITS.launchAltitudeM.max)}
              onChange={onSi(altUnit, setAlt)}
              className={numberClass}
            />
          </Row>
        </div>

        <SiteMap
          latitudeDeg={lat}
          longitudeDeg={lon}
          onPick={(la, lo) => {
            setLat(la);
            setLon(lo);
            // The old elevation belongs to the old spot, as the launch panel's own pick treats it.
            setAlt(null);
          }}
          className="min-h-[14rem] flex-1"
        />
      </div>

      <EditorFooter
        onDelete={onDelete}
        dirty={dirty}
        onRevert={revert}
        onSave={submit}
        saveDisabled={!valid}
        saveTitle={valid ? undefined : t('location.needsSite')}
      >
        {onApply && (
          <button
            onClick={onApply}
            disabled={dirty}
            title={dirty ? t('location.applyNeedsSave') : t('location.apply')}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-accent-300 hover:bg-accent-500/10 disabled:text-ink-faint disabled:hover:bg-transparent"
          >
            {t('location.use')}
          </button>
        )}
      </EditorFooter>
    </>
  );
}

const numberClass =
  'w-28 rounded-md bg-raised px-2 py-1.5 text-right text-sm tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500';

function Row({ label, unit, children }: { label: string; unit: ReactNode; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-ink-soft">
      <span className="min-w-24">{label}</span>
      <span className="flex items-center gap-1">
        {children}
        <span className="min-w-8 text-ink-faint">{unit}</span>
      </span>
    </label>
  );
}
