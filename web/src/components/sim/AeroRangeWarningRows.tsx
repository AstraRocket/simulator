import { useTranslation } from 'react-i18next';
import type { AeroRangeFinding } from '../../services/flight/aeroTables';
import { fmtUpTo } from '../../i18n/format';
import { WARNING_ROW, WARNING_TONE } from './warningTone';

const TABLE: Record<AeroRangeFinding['kind'], string> = { drag: 'sims.dragTable', stability: 'sims.stabilityTable' };

export function AeroRangeWarningRows({ findings }: { findings: readonly AeroRangeFinding[] }) {
  const { t } = useTranslation();
  return findings.map((f) => (
    <li key={`aero-${f.kind}-${f.quantity}`} className={`${WARNING_ROW} ${WARNING_TONE.NORMAL}`}>
      <span aria-hidden>⚠</span>
      <span className="min-w-0">
        <span className="font-medium">
          {t(f.quantity === 'mach' ? 'sim.aeroRangeMach' : 'sim.aeroRangeAoa', {
            table: t(TABLE[f.kind]),
            max: fmtUpTo(f.max, f.quantity === 'mach' ? 2 : 1),
            flown: fmtUpTo(f.flown, f.quantity === 'mach' ? 2 : 1),
          })}
        </span>
        <span className="mt-1 block font-normal leading-snug">{t('sim.aeroRangeHelp')}</span>
      </span>
    </li>
  ));
}
