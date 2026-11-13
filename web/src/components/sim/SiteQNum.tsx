import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnits } from '../../prefs/useUnits';
import { LAUNCH_SITE_LIMITS } from '../../services/storage/launchLocationStore';
import { LAUNCH_SI, SITE_ALTITUDE_FIELD } from '../../prefs/launchUnits';
import { QNum } from './QNum';

type QNumProps = ComponentProps<typeof QNum>;

export function SiteElevationField({
  label,
  ...props
}: Omit<QNumProps, 'label' | 'field' | 'kind' | 'u' | 'stepSi' | 'minSi' | 'maxSi'> & { label?: string }) {
  const { t } = useTranslation();
  const u = useUnits();
  return (
    <QNum
      label={label ?? t('landing.siteElevation')}
      field={SITE_ALTITUDE_FIELD}
      kind="distance"
      u={u}
      stepSi={10}
      minSi={LAUNCH_SITE_LIMITS.launchAltitudeM.min}
      maxSi={LAUNCH_SITE_LIMITS.launchAltitudeM.max}
      {...props}
    />
  );
}

export function SiteTemperatureField(props: Omit<QNumProps, 'label' | 'kind' | 'u' | 'stepSi' | 'minSi' | 'maxSi'>) {
  const { t } = useTranslation();
  const u = useUnits();
  return (
    <QNum
      label={t('launch.temperature')}
      kind="degC"
      u={u}
      stepSi={1}
      // QNum bounds are SI (kelvin): raw -90 and 70 would cap entries at 70 K.
      minSi={LAUNCH_SI.degC.toSi(LAUNCH_SITE_LIMITS.temperatureC.min)}
      maxSi={LAUNCH_SI.degC.toSi(LAUNCH_SITE_LIMITS.temperatureC.max)}
      {...props}
    />
  );
}
