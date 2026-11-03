import { FieldLabel } from '../common/FieldMark';
import { CardGroup } from '../common/CardGroup';
import { G0 } from '../../services/motors/motorMath';
import type { LaunchConditions } from '../../services/design/orkTree';
import { QNum } from './QNum';
import type { LaunchSectionProps } from './launchSection';

/** The Earth the flight is computed over: its shape (geodetic model) and its gravity. */
export function EarthModelSection({ launch, onChange, onCommit, t, u, mixed }: Omit<LaunchSectionProps, 'req'>) {
  return (
    <CardGroup title={t('launch.earthModel')}>
      <label className="flex items-center justify-between gap-3">
        <FieldLabel text={t('launch.geodetic')} mixed={mixed('geodetic')} />
        <select
          value={launch.geodetic ?? 'spherical'}
          onChange={(e) => {
            onChange({ geodetic: e.target.value as LaunchConditions['geodetic'] });
            onCommit?.();
          }}
          className="w-32 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          <option value="flat">{t('launch.flat')}</option>
          <option value="spherical">{t('launch.spherical')}</option>
          <option value="wgs84">{t('launch.wgs84')}</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-3">
        <FieldLabel text={t('launch.gravity')} mixed={mixed('gravityModel')} />
        <select
          value={launch.gravityModel ?? 'wgs'}
          onChange={(e) => {
            onChange({ gravityModel: e.target.value as LaunchConditions['gravityModel'] });
            onCommit?.();
          }}
          className="w-32 rounded-md bg-raised px-2 py-1 text-sm text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
        >
          <option value="wgs">{t('launch.gravityWgs')}</option>
          <option value="constant">{t('launch.gravityConstant')}</option>
        </select>
      </label>
      {/* Only meaningful for the constant model, so only shown for it. */}
      {launch.gravityModel === 'constant' && (
        <QNum
          label={t('launch.gravityValue')}
          field="gravity"
          kind="accel"
          u={u}
          stepSi={0.01}
          minSi={0}
          mixed={mixed('constantGravity')}
          value={launch.constantGravity ?? G0}
          onChange={(v) => onChange({ constantGravity: v ?? G0 })}
        />
      )}
    </CardGroup>
  );
}
