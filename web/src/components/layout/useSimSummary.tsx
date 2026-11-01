import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectActive, configOf } from '../../state/store';
import { configLabel } from '../../services/flight/flightConfigs';
import { isOutdated, simStatus, simStatusLabel } from '../../services/flight/simulations';
import { designBlocker } from '../../services/flight/runnability';
import { stabilityState, stabilityToneOf, stabilityVerdictKey } from '../../services/flight/simReport';
import { STABILITY_GLYPH } from '../../tree/schematicGeometry';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtNum } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import type { StaticInfo } from '../../engine/api';

/**
 * The active simulation at a glance, as the pieces its two views lay out: the
 * header's strip on a wide screen (HeaderSummary) and the phone's Rocket card
 * (canvas/RocketOverview). One source, so the two never disagree about what
 * the rocket is or what its last flight did.
 */
export function useSimSummary(info: StaticInfo) {
  const { t } = useTranslation();
  const u = useUnits();
  const tree = useWorkspaceStore((s) => s.tree);
  const configs = useWorkspaceStore((s) => s.configs);
  const simPrefs = useWorkspaceStore((s) => s.simPrefs);
  const runs = useWorkspaceStore((s) => s.simRuns);
  const busy = useWorkspaceStore((s) => s.simBusy);
  const sim = useWorkspaceStore(selectActive);
  const runSims = useWorkspaceStore((s) => s.runSims);
  const cancelRun = useWorkspaceStore((s) => s.cancelRun);
  const setResultSimId = useWorkspaceStore((s) => s.setResultSimId);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const setSimConfig = useWorkspaceStore((s) => s.setSimConfig);

  const config = configOf(configs, sim);
  const outdated = isOutdated(sim, tree, config, simPrefs);
  const status = simStatus(sim, runs, tree, outdated);
  const blocked = useMemo(() => !!designBlocker(tree), [tree]);
  // The same units as the stat tile and the run table's column, so the summary
  // never disagrees with the number it summarizes.
  const massUnit = u.at(unitScope('stats', 'mass'), 'mass');
  const apogee = u.at(unitScope('sim', 'apogee'), 'distance');

  const cal = info.stabilityCalibers;
  const pad = stabilityState(cal);
  const flying = status === 'running' || status === 'queued';

  // The band is in the glyph and, for a screen reader, in words, as well as in
  // the color.
  const stability = (
    <span className={pad ? stabilityToneOf(pad) : 'text-ink-muted'}>
      {pad && <span aria-hidden>{`${STABILITY_GLYPH[pad]} `}</span>}
      {fmtNum(cal, 2)} {t('stability.caliber')}
      {pad && <span className="sr-only">{` (${t(stabilityVerdictKey(cal))})`}</span>}
    </span>
  );

  // A flight from this session, else the figures an imported file carried, as
  // the run table reads them.
  const summary = sim.result?.summary ?? sim.fileSummary?.summary;
  let flight: ReactNode = NO_VALUE;
  if (flying) flight = <span className="text-accent-400">{simStatusLabel(status, t)}</span>;
  else if (summary) {
    const value = `${apogee.fmt(summary.maxAltitude)} ${apogee.sym}`;
    flight = outdated ? (
      <>
        <span className="text-ink-muted">{value}</span>{' '}
        <span className="text-[10px] font-medium text-warn-300">{simStatusLabel('outdated', t)}</span>
      </>
    ) : (
      value
    );
    // Only a flight flown here has a Results page to open.
    if (sim.result)
      flight = (
        <button
          onClick={() => {
            setResultSimId(sim.id);
            setTab('results');
          }}
          title={t('summary.openResults')}
          className="rounded-sm hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {flight}
        </button>
      );
  }

  return {
    sim,
    busy,
    blocked,
    stability,
    mass: `${massUnit.fmt(info.mass)} ${massUnit.sym}`,
    config,
    configs,
    configName: (c: typeof config) => configLabel(tree, c) || t('configs.noMotors'),
    setConfig: (configId: string) => setSimConfig(sim.id, configId),
    flight,
    runLabel: busy ? t('summary.stop') : t('summary.run'),
    runTitle: busy ? t('sim.cancel') : t('summary.runTitle', { name: sim.name }),
    onRun: () => (busy ? cancelRun() : runSims([sim.id])),
  };
}
