import { useLauncherT } from '../common/useLauncher';
import { useUnits } from '../../prefs/useUnits';
import type { FlightResult } from '../../engine/api';
import { warningText, warningHelp } from '../../services/app/warningText';
import { WARNING_ROW, WARNING_TONE } from './warningTone';
import { CardGroup } from '../common/CardGroup';
import { useWorkspaceStore, selectShownSim } from '../../state/store';
import { useFlutterFindings } from './useFlutterFindings';
import { FlutterWarningRows } from './FlutterWarningRows';

/**
 * What the kernel flagged about this flight: a recovery device out too fast, a
 * large angle of attack, no recovery device at all.
 *
 * This is the other half of the deployment-speed threshold settings: without
 * it a user would never see what those thresholds produce.
 *
 * Fin flutter, which the kernel does not check, is the app's own and leads the
 * list (`useFlutterFindings`). It is read for the simulation the Results tab
 * shows, which is the one `sim` came from.
 */
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
          // What it means, not just what tripped. A deployment-speed warning
          // that does not say what a fast deployment does to the airframe is a
          // number the reader has to already understand in order to act on.
          const help = warningHelp(w.message, t);
          return (
            <li
              key={`${w.key}-${i}`}
              className={`${WARNING_ROW} ${WARNING_TONE[w.priority ?? 'NORMAL'] ?? WARNING_TONE.NORMAL}`}
            >
              <span aria-hidden>⚠</span>
              <span className="min-w-0">
                {/* HIGH is said in words too: the danger color is not the only
                    thing setting it apart from a note. */}
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
