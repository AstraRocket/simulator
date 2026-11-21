import { fmtNum } from '../../i18n/format';
import type { ResonanceFigures } from '../../services/flight/flightEvents';

type T = (key: string, values?: Record<string, string>) => string;

const LISTED = 5;

/** The line under the roll ÷ pitch frequency chart; undefined when there is nothing to go on. */
export function resonanceNote(t: T, figures: ResonanceFigures | null): string | undefined {
  if (!figures) return undefined;
  const { crossings, inBand } = figures;
  const seconds = inBand > 0 && inBand < 0.005 ? t('flight.resonanceUnderHundredth') : fmtNum(inBand, 2);
  if (!crossings.length) {
    return inBand > 0 ? t('flight.resonanceNearOnly', { seconds }) : t('flight.resonanceNever');
  }
  const times = crossings
    .slice(0, LISTED)
    .map((c) => fmtNum(c, 2))
    .join(', ');
  const more = crossings.length - LISTED;
  return more > 0
    ? t('flight.resonanceCrossedMore', { times, more: String(more), seconds })
    : t('flight.resonanceCrossed', { times, seconds });
}
