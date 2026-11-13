import { SelectRow } from '../common/SelectRow';
import { CardGroup } from '../common/CardGroup';
import { G0 } from '../../services/motors/motorMath';
import { MIN_CONSTANT_GRAVITY } from '../../services/flight/safetyLimits';
import type { LaunchConditions } from '../../services/design/orkTree';
import { QNum } from './QNum';
import type { LaunchSectionProps } from './launchSection';

export function EarthModelSection({ launch, onChange, onCommit, t, u, mixed }: Omit<LaunchSectionProps, 'req'>) {
  return (
    <CardGroup title={t('launch.earthModel')}>
      <SelectRow<NonNullable<LaunchConditions['geodetic']>>
        label={t('launch.geodetic')}
        mixed={mixed('geodetic')}
        value={launch.geodetic ?? 'spherical'}
        onChange={(geodetic) => {
          onChange({ geodetic });
          onCommit?.();
        }}
        width="w-32"
      >
        <option value="flat">{t('launch.flat')}</option>
        <option value="spherical">{t('launch.spherical')}</option>
        <option value="wgs84">{t('launch.wgs84')}</option>
      </SelectRow>
      <SelectRow<NonNullable<LaunchConditions['gravityModel']>>
        label={t('launch.gravity')}
        mixed={mixed('gravityModel')}
        value={launch.gravityModel ?? 'wgs'}
        onChange={(gravityModel) => {
          onChange({ gravityModel });
          onCommit?.();
        }}
        width="w-32"
      >
        <option value="wgs">{t('launch.gravityWgs')}</option>
        <option value="constant">{t('launch.gravityConstant')}</option>
      </SelectRow>
      {launch.gravityModel === 'constant' && (
        <QNum
          label={t('launch.gravityValue')}
          field="gravity"
          kind="accel"
          u={u}
          stepSi={0.01}
          minSi={MIN_CONSTANT_GRAVITY}
          mixed={mixed('constantGravity')}
          value={launch.constantGravity ?? G0}
          onChange={(v) => onChange({ constantGravity: v ?? G0 })}
        />
      )}
    </CardGroup>
  );
}
