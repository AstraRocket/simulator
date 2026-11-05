import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { withFixedUnit } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import {
  panelDigits,
  panelSeries,
  traceLabel,
  traceOffset,
  traceScale,
  traceUnit,
  type PanelLine,
  type Branch,
  type Meta,
} from './flightChartTraces';
import { hoverValue } from './flightChartHoverValue';
import { crosshairReadout } from './chartSummary';

// Only key steps change the live region, so mouse hover stays quiet.
export function useCrosshairAnnouncement(
  keyT: number | null,
  selectedBranches: Branch[],
  activeMetas: Meta[],
  shownMetas: Meta[],
  clipT: number,
): string {
  const { t } = useTranslation();
  const u = useUnits();
  const primary = selectedBranches[0];
  const announcing = keyT != null;
  const panelOf = useMemo(() => {
    const out = new Map<string, { digits: number; primary: PanelLine | undefined }>();
    if (!announcing) return out;
    for (const m of activeMetas) {
      if (m.xy) continue;
      const { list, lo, hi } = panelSeries(selectedBranches, m, traceScale(m, u), clipT, traceOffset(m, u));
      out.set(m.key, { digits: panelDigits(m, lo, hi), primary: list[0] });
    }
    return out;
  }, [announcing, activeMetas, selectedBranches, u, clipT]);
  return keyT == null || !primary
    ? ''
    : crosshairReadout(
        `${t('flight.time')} ${withFixedUnit(keyT, t('units.second'), 2)}`,
        shownMetas
          .filter((m) => !m.xy && !(m.aero && keyT > clipT))
          .map((m) => {
            const panel = panelOf.get(m.key);
            return {
              label: traceLabel(m, t),
              value: panel?.primary ? hoverValue(panel.primary, keyT) : null,
              digits: panel?.digits ?? m.digits,
              unit: traceUnit(m, u, t),
            };
          }),
      );
}
