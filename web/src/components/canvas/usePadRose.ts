import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { shownDeclination } from '../../services/flight/bearing';
import { useSettings } from '../../state/useSettings';
import type { LauncherKind } from '../../services/design/launcher';
import type { PadRoseLabels } from './PadRose';

/** What the ground rose around the pad marks: true degrees, null for none, and its words. */
export interface PadRoseInput {
  windFromDeg: number | null;
  declinationDeg: number | null;
  labels: PadRoseLabels;
}

/** Memoized: the declination reads the clock, so each render would give a slightly different value. */
export function usePadRose(
  windFromDeg: number | null,
  latitudeDeg?: number | null,
  longitudeDeg?: number | null,
): PadRoseInput {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const pref = settings.northReference;
  const points = t('launch.compassPoints');
  const wind = t('launch.figLegendWind');
  const labels = useMemo(() => {
    const all = points.split(' ');
    return { cardinals: [0, 4, 8, 12].map((i) => all[i] ?? ''), wind };
  }, [points, wind]);
  return useMemo(
    () => ({ windFromDeg, declinationDeg: shownDeclination(pref, latitudeDeg, longitudeDeg), labels }),
    [windFromDeg, pref, latitudeDeg, longitudeDeg, labels],
  );
}

/** The pad as a flight's launch conditions set it: what rides it and what the rose around it marks. */
export interface PadSetup {
  launcher: LauncherKind;
  rose: PadRoseInput;
}
