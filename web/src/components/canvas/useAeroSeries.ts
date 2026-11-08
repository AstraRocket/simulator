import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChartSeries } from './aeroTables';
import type { useAeroSweep } from './useAeroSweep';
import { CATEGORICAL } from '../common/chartPalette';

const POWER_OFF = CATEGORICAL[0]!;
const POWER_ON = CATEGORICAL[7]!;

type Series = ChartSeries;

export function useAeroSeries(
  sweep: ReturnType<typeof useAeroSweep>['sweep'],
  cpDiv: number,
  lengthFactor: number,
): { cdSeries: Series[]; breakdown: Series[]; cpSeries: Series[] } {
  const { t } = useTranslation();
  // The cards memoize their paths on series identity, which a fresh array would defeat on every pointer move.
  return useMemo(() => {
    if (!sweep) return { cdSeries: [], breakdown: [], cpSeries: [] };
    const cd: Series[] = [{ name: t('aero.powerOff'), color: POWER_OFF, values: sweep.powerOff.total }];
    if (sweep.hasNozzle) cd.push({ name: t('aero.powerOn'), color: POWER_ON, values: sweep.powerOn.total });
    return {
      cdSeries: cd,
      breakdown: [
        { name: t('aero.friction'), color: CATEGORICAL[0]!, values: sweep.powerOff.friction },
        { name: t('aero.pressure'), color: CATEGORICAL[1]!, values: sweep.powerOff.pressure },
        { name: t('aero.base'), color: CATEGORICAL[2]!, values: sweep.powerOff.base },
      ],
      cpSeries: [
        {
          name: t('flight.cp'),
          color: POWER_OFF,
          values: cpDiv > 0 ? sweep.cp.map((v) => (v / cpDiv) * 100) : sweep.cp.map((v) => v * lengthFactor),
        },
      ],
    };
  }, [sweep, cpDiv, lengthFactor, t]);
}
