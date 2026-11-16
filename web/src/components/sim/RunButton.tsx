import { useMemo } from 'react';
import { useLauncherT } from '../common/useLauncher';
import { Notice } from '../common/Notice';
import { RunToggleButton } from '../common/RunToggleButton';
import { useWorkspaceStore, selectActive, configOf } from '../../state/store';
import { primaryMotor } from '../../services/flight/flightConfigs';
import { useUnits } from '../../prefs/useUnits';
import { designBlocker, designBlockerText, unflyableSims, unflyableText } from '../../services/flight/runnability';
import { configPowerClass } from '../../services/flight/powerClass';

export function RunButton({ className = '' }: { className?: string }) {
  const t = useLauncherT();
  const units = useUnits();
  // Not `selectRunIds` directly: a fresh array per call re-renders forever under zustand.
  const selectedIds = useWorkspaceStore((s) => s.selectedSimIds);
  const activeId = useWorkspaceStore((s) => selectActive(s).id);
  const runIds = useMemo(() => (selectedIds.length ? selectedIds : [activeId]), [selectedIds, activeId]);
  const sims = useWorkspaceStore((s) => s.sims);
  const tree = useWorkspaceStore((s) => s.tree);
  const configs = useWorkspaceStore((s) => s.configs);
  const busy = useWorkspaceStore((s) => s.simBusy);
  const info = useWorkspaceStore((s) => s.info);
  const runSims = useWorkspaceStore((s) => s.runSims);
  const cancelRun = useWorkspaceStore((s) => s.cancelRun);

  const about = useMemo(
    () => runIds.map((id) => sims.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x),
    [runIds, sims],
  );
  const dryMass = info?.massEmpty;
  const refused = useMemo(
    () =>
      unflyableSims(
        about,
        (sim) => primaryMotor(tree, configOf(configs, sim)),
        (sim) => configPowerClass(tree, configOf(configs, sim), dryMass),
      ),
    [about, tree, configs, dryMass],
  );
  const flyable = about.length - refused.length;

  const design = useMemo(() => designBlocker(tree), [tree]);
  const blocked = !!design || flyable === 0;
  const notice = design
    ? designBlockerText(design, t)
    : refused.length
      ? refused.map((u) => unflyableText(u, t, units)).join(' ')
      : null;

  const label = busy ? t('sim.cancel') : flyable > 1 ? t('sim.runMany', { count: flyable }) : t('sim.run');

  return (
    <div className={`space-y-2 ${className}`}>
      <RunToggleButton
        busy={busy}
        label={label}
        onClick={() => (busy ? cancelRun() : runSims(runIds))}
        disabled={!busy && (!info || blocked)}
        className="w-full"
      />
      {notice && !busy && (
        <Notice tone="warn">
          <span aria-hidden="true">⚠</span>{' '}
          {!blocked && refused.length ? `${t('sim.skipping', { count: refused.length })} ` : ''}
          {notice}
        </Notice>
      )}
    </div>
  );
}
