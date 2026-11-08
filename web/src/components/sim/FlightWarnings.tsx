import { useLauncherT } from '../common/useLauncher';
import { useUnits } from '../../prefs/useUnits';
import type { FlightResult } from '../../engine/api';
import { warningText, warningHelp } from '../../services/app/warningText';
import { WARNING_ROW, WARNING_TONE } from './warningTone';
import { CardGroup } from '../common/CardGroup';
import { useWorkspaceStore, selectShownSim } from '../../state/store';
import { useFlutterFindings } from './useFlutterFindings';
import { FlutterWarningRows } from './FlutterWarningRows';

export function FlightWarnings({ sim }: { sim: FlightResult | null }) {
  const t = useLauncherT();
  const u = useUnits();
  const warnings = sim?.warnings ?? [];
  const shown = useWorkspaceStore(selectShownSim);
  const flutter = useFlutterFindings(shown.result === sim ? shown : null);
  if (!sim || !(warnings.length + flutter.length)) return null;

  return (
    <CardGroup title={t('sim.warnings', { count: warnings.length + flutter.length })}>
      <ul className="space-y-1.5">
        <FlutterWarningRows findings={flutter} />
        {warnings.map((w, i) => {
          const help = warningHelp(w.message, t);
          return (
            <li
              key={`${w.key}-${i}`}
              className={`${WARNING_ROW} ${WARNING_TONE[w.priority ?? 'NORMAL'] ?? WARNING_TONE.NORMAL}`}
            >
              <span aria-hidden>⚠</span>
              <span className="min-w-0">
                {w.priority === 'HIGH' && <span className="font-semibold">{`${t('sim.warningHigh')} `}</span>}
                <span className="font-medium">{warningText(w.message, t, (q, si) => u.fmtSym(q, si))}</span>
                {help && <span className="mt-1 block font-normal leading-snug">{help}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </CardGroup>
  );
}
