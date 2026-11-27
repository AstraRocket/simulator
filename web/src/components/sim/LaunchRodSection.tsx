import { FieldLabel } from '../common/FieldMark';
import { Check } from '../common/Check';
import { CardGroup } from '../common/CardGroup';
import { RadioGroup } from '../common/RadioGroup';
import { LAUNCHERS } from '../../services/design/orkTree';
import type { LauncherKind } from '../../services/design/launcher';
import { degToRad } from '../../prefs/units';
import { LIMIT_FIELD } from '../../prefs/launchUnits';
import { MAX_ROD_ANGLE_RAD } from '../../services/flight/safetyLimits';
import type { PowerClass } from '../../services/flight/powerClass';
import { DEFAULT_HEADING_DEG } from '../../services/flight/windLevels';
import { QNum } from './QNum';
import { BearingDial, TiltDial } from './FieldDials';
import { bearingHint, capFor, type LaunchSectionProps } from './launchSection';

export function LaunchRodSection({
  launch,
  onChange,
  onCommit,
  t,
  u,
  mixed,
  req,
  powerClass,
  north,
  designLauncher = null,
}: LaunchSectionProps & {
  powerClass: PowerClass | null;
  /** What the design's lugs or buttons suggest, until the simulation says. */
  designLauncher?: LauncherKind | null;
}) {
  const points = t('launch.compassPoints').split(' ');
  const shown = north.show(launch.launchRodDirectionDeg ?? DEFAULT_HEADING_DEG);
  return (
    <CardGroup title={t('launch.launchRod')}>
      <RadioGroup
        className="pb-1"
        legend={t('launch.launcherIs')}
        label={<FieldLabel text={t('launch.launcherIs')} mixed={mixed('launcher')} />}
        options={LAUNCHERS}
        value={launch.launcher ?? designLauncher ?? 'rod'}
        onChange={(v) => {
          onChange({ launcher: v });
          onCommit?.();
        }}
        fmt={(v) => t(`launch.launcherOption.${v}`)}
      />
      <QNum
        label={t('launch.length')}
        chipLabel={t('launch.rodLengthName')}
        field="length"
        kind="length"
        u={u}
        stepSi={0.1}
        minSi={0}
        mixed={mixed('launchRodLengthM')}
        {...req('launchRodLengthM')}
        value={launch.launchRodLengthM}
        onChange={(v) => onChange({ launchRodLengthM: v })}
      />
      <QNum
        label={t('launch.angle')}
        field={LIMIT_FIELD.rodAngle}
        kind="deg"
        u={u}
        stepSi={degToRad(1)}
        // Into the wind, a negative angle launches with the wind, as desktop's
        // SimulationStatus rotates by the signed angle; with a fixed heading it floors at 0.
        minSi={launch.launchIntoWind ? -MAX_ROD_ANGLE_RAD[powerClass ?? 'model'] : 0}
        maxSi={MAX_ROD_ANGLE_RAD[powerClass ?? 'model']}
        hint={
          powerClass === null
            ? t('launch.angleLimitEither', {
                model: capFor(u, 'deg', LIMIT_FIELD.rodAngle, MAX_ROD_ANGLE_RAD.model),
                highPower: capFor(u, 'deg', LIMIT_FIELD.rodAngle, MAX_ROD_ANGLE_RAD.highPower),
              })
            : t(powerClass === 'model' ? 'launch.angleLimitModel' : 'launch.angleLimitHighPower', {
                limit: capFor(u, 'deg', LIMIT_FIELD.rodAngle, MAX_ROD_ANGLE_RAD[powerClass]),
              })
        }
        mixed={mixed('launchRodAngleDeg')}
        {...req('launchRodAngleDeg')}
        value={launch.launchRodAngleDeg}
        // No needle across simulations that differ.
        aside={<TiltDial deg={mixed('launchRodAngleDeg') ? null : launch.launchRodAngleDeg} />}
        onChange={(v) => onChange({ launchRodAngleDeg: v })}
      />
      <Check
        checked={launch.launchIntoWind ?? false}
        onChange={(v) => {
          onChange({ launchIntoWind: v });
          onCommit?.();
        }}
        className=""
        label={<FieldLabel text={t('launch.intoWind')} mixed={mixed('launchIntoWind')} />}
      />
      {!launch.launchIntoWind && (
        <QNum
          label={t('launch.rodDirection')}
          chipLabel={t('launch.rodDirectionName')}
          field="rodDirection"
          kind="deg"
          u={u}
          stepSi={degToRad(5)}
          hint={bearingHint(t, north, shown)}
          mixed={mixed('launchRodDirectionDeg')}
          value={shown}
          aside={<BearingDial kind="rod" deg={mixed('launchRodDirectionDeg') ? null : shown} points={points} />}
          // Cleared means unset: writing 0 would turn the default east into north.
          onChange={(v) =>
            onChange(
              v === null ? { launchRodDirectionDeg: undefined } : (l) => ({ launchRodDirectionDeg: north.store(v, l) }),
            )
          }
        />
      )}
    </CardGroup>
  );
}
