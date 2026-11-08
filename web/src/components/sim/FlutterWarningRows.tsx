import { useTranslation } from 'react-i18next';
import type { FlutterFinding } from '../../services/flight/finFlutter';
import { WARNING_ROW, WARNING_TONE } from './warningTone';
import { flutterWarningText } from './flutterWarningText';

export function FlutterWarningRows({ findings }: { findings: readonly FlutterFinding[] }) {
  const { t } = useTranslation();
  return findings.map((f) => (
    <li
      key={`flutter-${f.nodeId}`}
      className={`${WARNING_ROW} ${WARNING_TONE[f.verdict === 'over' ? 'HIGH' : 'NORMAL']}`}
    >
      <span aria-hidden>⚠</span>
      <span className="min-w-0">
        {f.verdict === 'over' && <span className="font-semibold">{`${t('sim.warningHigh')} `}</span>}
        <span className="font-medium">{flutterWarningText(f, t)}</span>
        <span className="mt-1 block font-normal leading-snug">{t('finFlutter.warningHelp')}</span>
      </span>
    </li>
  ));
}
