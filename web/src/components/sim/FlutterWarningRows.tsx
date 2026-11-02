import { useTranslation } from 'react-i18next';
import { fmtNum } from '../../i18n/format';
import { FLUTTER_MARGIN, type FlutterFinding } from '../../services/flight/finFlutter';
import { WARNING_ROW, WARNING_TONE } from './warningTone';

/** The sentence a flutter finding reads as, for a row or a tooltip. */
export function flutterWarningText(
  f: FlutterFinding,
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  return t(`finFlutter.warning_${f.verdict}`, {
    name: f.name || t('finFlutter.unnamedFins'),
    ratio: fmtNum(f.point.ratio, 2),
    margin: fmtNum(FLUTTER_MARGIN, 2),
    time: fmtNum(f.point.time, 2),
  });
}

/**
 * Flutter findings as rows of the flight warnings card, in its palette: past the
 * flutter speed is a HIGH warning and named so in words, too close is a note.
 */
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
