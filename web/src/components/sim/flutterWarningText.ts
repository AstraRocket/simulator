import { fmtNum } from '../../i18n/format';
import { FLUTTER_MARGIN, type FlutterFinding } from '../../services/flight/finFlutter';

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
