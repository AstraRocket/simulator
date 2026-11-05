import { FieldLabel } from '../common/FieldMark';
import { Check } from '../common/Check';
import { CardGroup } from '../common/CardGroup';
import { degToRad } from '../../prefs/units';
import { LIMIT_FIELD } from '../../prefs/launchUnits';
import { MAX_ROD_ANGLE_RAD } from '../../services/flight/safetyLimits';
import type { PowerClass } from '../../services/flight/powerClass';
import { DEFAULT_HEADING_DEG } from '../../services/flight/windLevels';
import { QNum } from './QNum';
import { capFor, type LaunchSectionProps } from './launchSection';

export function LaunchRodSection({
  launch,
  onChange,
  onCommit,
  t,
  u,
  mixed,
  req,
  powerClass,
}: LaunchSectionProps & {
  powerClass: PowerClass | null;
}) {
  return (
    <CardGroup title={t('launch.launchRod')}>
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
          mixed={mixed('launchRodDirectionDeg')}
          value={launch.launchRodDirectionDeg ?? DEFAULT_HEADING_DEG}
          // Cleared means unset: writing 0 would turn the default east into north.
          onChange={(v) => onChange({ launchRodDirectionDeg: v ?? undefined })}
        />
      )}
    </CardGroup>
  );
}
