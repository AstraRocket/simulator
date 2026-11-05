import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchConditions, LaunchPatch } from '../../services/design/orkTree';
import { Dialog } from '../common/Dialog';
import { useUnits } from '../../prefs/useUnits';
import { levelFromAverage } from '../../services/flight/windLevels';
import { Check } from '../common/Check';
import { useSettings } from '../../state/SettingsProvider';
import { DialogButton, DialogActions } from '../common/DialogButton';
import { smallButton } from '../common/smallButton';
import { RadioGroup } from '../common/RadioGroup';
import { ProfileChart } from './WindProfileChart';
import { WindLevelTable } from './WindLevelTable';
import { useWindLevels } from './useWindLevels';

const btn = smallButton('row', 'soft');

export function WindProfileDialog({
  launch,
  diff,
  onChange,
  onCommit,
  onClose,
}: {
  launch: LaunchConditions;
  diff?: ReadonlySet<keyof LaunchConditions>;
  onChange: (patch: LaunchPatch) => void;
  onCommit?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const { settings } = useSettings();
  const [showVectors, setShowVectors] = useState(true);
  const reference = launch.windAltitudeReference ?? 'msl';
  const wind = useWindLevels({ launch, onChange, onCommit });
  const { levels, dupeRows, replaceLevels, addLevel, setSpeedEditBase, error, setError, levelsFile } = wind;

  return (
    <Dialog
      id="windProfile"
      title={t('windProfile.title')}
      onClose={onClose}
      // The launch panel can itself sit inside the Settings dialog.
      layer="over"
      size="4xl"
      layout="pad"
    >
      {/* React's onBlur is focusout and bubbles, so every field inside commits. */}
      <div
        onBlur={() => {
          setSpeedEditBase(null);
          onCommit?.();
        }}
      >
        {(diff?.has('windLevels') || diff?.has('windAltitudeReference')) && (
          <p
            role="note"
            className="mb-3 rounded-md bg-warn-500/15 px-3 py-2 text-xs text-warn-200 ring-1 ring-warn-500/40"
          >
            {t('sims.mixedField')}
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <WindLevelTable wind={wind} reference={reference} onCommit={onCommit} />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className={btn}
                onClick={() => {
                  addLevel();
                  onCommit?.();
                }}
              >
                {t('windProfile.addLevel')}
              </button>
              <button
                className={btn}
                onClick={() => {
                  // As the kernel's `resetLevels` seeds from the preferences.
                  replaceLevels([levelFromAverage(settings.launchDefaults)]);
                  setError(null);
                  onCommit?.();
                }}
              >
                {t('windProfile.resetLevels')}
              </button>
              <button className={btn} onClick={levelsFile.pick}>
                {t('windProfile.importLevels')}
              </button>
              {levelsFile.input}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-ink-faint">{t('windProfile.csvFormat')}</p>
            {dupeRows.size > 0 && (
              <p role="alert" className="mt-1 text-[11px] leading-snug text-danger-300">
                {t('windProfile.duplicateAltitude')}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-1 text-[11px] leading-snug text-danger-300">
                {error}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t('windProfile.visualization')}
            </h3>
            <div className="rounded-lg bg-canvas/40 p-2 ring-1 ring-line/5">
              <ProfileChart levels={levels} u={u} showVectors={showVectors} />
            </div>
            <Check
              className="mt-2 text-xs text-ink-muted"
              checked={showVectors}
              onChange={setShowVectors}
              label={t('windProfile.showVectors')}
            />

            <RadioGroup
              className="mt-4"
              layout="stack"
              legend={t('windProfile.altitudeReference')}
              options={['msl', 'agl'] as const}
              value={reference}
              onChange={(r) => {
                onChange({ windAltitudeReference: r });
                onCommit?.();
              }}
              fmt={(r) => t(`windProfile.${r}`)}
            >
              <p className="mt-1 text-[11px] leading-snug text-ink-faint">{t('windProfile.referenceNote')}</p>
            </RadioGroup>
          </div>
        </div>

        <DialogActions>
          <DialogButton variant="primary" size="sm" onClick={onClose}>
            {t('common.close')}
          </DialogButton>
        </DialogActions>
      </div>
    </Dialog>
  );
}
