import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  WAYPOINT_KINDS,
  WAYPOINT_LABEL_KEY,
  type StageTrackStart,
  type WaypointKind,
} from '../../services/exports/flightPathExport';
import { EXPORT_PRESETS, matchingPreset } from '../../services/exports/pathExportPresets';
import { Check } from '../common/Check';
import { LanguageOptions } from '../common/LanguageOptions';
import { NumberInput } from '../common/NumberInput';
import { ToggleButton } from '../common/ToggleButton';
import { toggled } from '../../services/app/collections';
import { AltitudeRefSelect, Section, UnitRow } from './PathExportControls';
import { SelectRow } from '../common/SelectRow';
import type { useExportOptions } from './useExportOptions';

type ExportOptions = ReturnType<typeof useExportOptions>;
type SectionProps = Pick<ExportOptions, 'opts' | 'change'>;

export function ExportPresets({ opts, change }: SectionProps) {
  const { t } = useTranslation();
  const activePreset = useMemo(() => matchingPreset(opts), [opts]);
  return (
    <Section title={t('pathExport.presets')}>
      <div role="group" aria-label={t('pathExport.presets')} className="flex flex-wrap gap-1.5">
        {EXPORT_PRESETS.map((preset) => {
          const active = activePreset === preset.id;
          return (
            <ToggleButton
              key={preset.id}
              active={active}
              // Cloned, so the dialog never mutates the preset's module-level set.
              onClick={() => change({ ...preset.options, waypoints: new Set(preset.options.waypoints) })}
              title={t(`pathExport.preset.${preset.id}Note`)}
              className="rounded-md px-2 py-1 text-xs font-medium ring-1 ring-line/10"
            >
              {t(`pathExport.preset.${preset.id}`)}
            </ToggleButton>
          );
        })}
      </div>
      <p className="text-[11px] leading-snug text-ink-faint">{t('pathExport.presetsNote')}</p>
    </Section>
  );
}

export function ExportWaypoints({ opts, change }: SectionProps) {
  const { t } = useTranslation();
  const toggleWaypoint = (k: WaypointKind) => change({ waypoints: toggled(opts.waypoints, k) });
  return (
    <Section title={t('pathExport.waypoints')}>
      <div className="grid grid-cols-2 gap-1.5">
        {WAYPOINT_KINDS.map((k) => (
          <Check
            key={k}
            checked={opts.waypoints.has(k)}
            onChange={() => toggleWaypoint(k)}
            label={t(WAYPOINT_LABEL_KEY[k])}
          />
        ))}
      </div>
    </Section>
  );
}

export function ExportPath({
  opts,
  change,
  staged,
  setColorsOpen,
}: SectionProps & { staged: boolean; setColorsOpen: (open: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Section title={t('pathExport.path')}>
      <Check
        checked={opts.includeFlightPath}
        onChange={(v) => change({ includeFlightPath: v })}
        label={t('pathExport.includeFlightPath')}
      />
      <Check
        checked={opts.includeGroundTrack}
        onChange={(v) => change({ includeGroundTrack: v })}
        label={t('pathExport.includeGroundTrack')}
      />
      <label className="mt-1 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-muted">{t('pathExport.stride')}</span>
        <NumberInput
          min={1}
          step={1}
          value={opts.pathStride}
          ariaLabel={t('pathExport.stride')}
          onChange={(v) => v !== null && change({ pathStride: Math.max(1, Math.floor(v)) })}
          className="w-20 rounded-md bg-raised px-2 py-1 text-right text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        />
      </label>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        {staged ? (
          <SelectRow<StageTrackStart>
            label={t('pathExport.stageTrackStart')}
            value={opts.stageTrackStart}
            onChange={(v) => change({ stageTrackStart: v })}
          >
            <option value="separation">{t('pathExport.trackStart.separation')}</option>
            <option value="pad">{t('pathExport.trackStart.pad')}</option>
          </SelectRow>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setColorsOpen(true)}
          title={t('pathExport.stageColorsTitle')}
          className="rounded-md bg-raised px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-line/10 hover:bg-elevated"
        >
          {t('pathExport.stageColors')}
        </button>
      </div>
    </Section>
  );
}

export function ExportPlacement({ opts, change }: SectionProps) {
  const { t } = useTranslation();
  return (
    <Section title={t('pathExport.placement')}>
      <AltitudeRefSelect
        label={t('pathExport.trackAltitude')}
        value={opts.altitudeReference}
        onChange={(v) => change({ altitudeReference: v })}
      />
      <AltitudeRefSelect
        label={t('pathExport.waypointAltitude')}
        value={opts.waypointAltitudeReference}
        onChange={(v) => change({ waypointAltitudeReference: v })}
      />
      <p className="text-[11px] leading-snug text-ink-faint">{t('pathExport.altitudeReferenceNote')}</p>
      <Check
        checked={opts.drawShadow}
        disabled={opts.altitudeReference === 'clamped' && opts.waypointAltitudeReference === 'clamped'}
        onChange={(v) => change({ drawShadow: v })}
        label={t('pathExport.drawShadow')}
      />
      <p className="text-[11px] leading-snug text-ink-faint">{t('pathExport.shadowNote')}</p>
      <Check
        checked={opts.showWaypointLabels}
        onChange={(v) => change({ showWaypointLabels: v })}
        label={t('pathExport.showWaypointLabels')}
      />
      <Check
        checked={opts.colorWaypointPins}
        onChange={(v) => change({ colorWaypointPins: v })}
        label={t('pathExport.colorWaypointPins')}
      />
      <p className="text-[11px] leading-snug text-ink-faint">{t('pathExport.pinsNote')}</p>
    </Section>
  );
}

export function ExportBalloons({ opts, change }: SectionProps) {
  const { t } = useTranslation();
  return (
    <Section title={t('pathExport.balloons')}>
      <Check
        checked={opts.includeDescriptions}
        onChange={(v) => change({ includeDescriptions: v })}
        label={t('pathExport.includeDescriptions')}
      />
      <p className="text-[11px] leading-snug text-ink-faint">{t('pathExport.descriptionsNote')}</p>
    </Section>
  );
}

export function ExportUnits({ opts, change, setUnit }: SectionProps & Pick<ExportOptions, 'setUnit'>) {
  const { t } = useTranslation();
  return (
    <Section title={t('pathExport.units')}>
      <UnitRow label={t('pathExport.altitude')} value={opts.altitudeUnit} onChange={(u) => setUnit('altitude', u)} />
      <UnitRow label={t('pathExport.distance')} value={opts.distanceUnit} onChange={(u) => setUnit('distance', u)} />
      <SelectRow
        label={t('pathExport.language')}
        value={opts.language}
        onChange={(v) => change({ language: v })}
        width="w-40"
      >
        <option value="">{t('pathExport.languageSameAsApp')}</option>
        <LanguageOptions />
      </SelectRow>
      <p className="text-[11px] leading-snug text-ink-faint">{t('pathExport.languageNote')}</p>
    </Section>
  );
}

export function ExportMission({ opts, change, patchOpts }: SectionProps & Pick<ExportOptions, 'patchOpts'>) {
  const { t } = useTranslation();
  return (
    <Section title={t('pathExport.mission')}>
      <input
        type="text"
        value={opts.missionName}
        aria-label={t('pathExport.mission')}
        placeholder={t('pathExport.missionPlaceholder')}
        // Never persisted: typing must not write the settings (see `useExportOptions`).
        onChange={(e) => patchOpts({ missionName: e.target.value })}
        className="w-full rounded-md bg-raised px-2 py-1.5 text-sm text-ink-strong ring-1 ring-line/10 placeholder:text-ink-dim focus:outline-none focus:ring-accent-500"
      />
      <p className="text-[11px] leading-snug text-ink-faint">{t('pathExport.missionNote')}</p>
      <Check
        checked={opts.labelWaypointsWithMission}
        onChange={(v) => change({ labelWaypointsWithMission: v })}
        label={t('pathExport.labelWaypointsWithMission')}
      />
      <p className="text-[11px] leading-snug text-ink-faint">{t('pathExport.missionMarkersNote')}</p>
    </Section>
  );
}
