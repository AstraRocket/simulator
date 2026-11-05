import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectActive, selectOutdated } from '../../state/store';
import { confirm } from '../../state/confirmStore';
import { useSettings } from '../../state/SettingsProvider';
import { SimulationsTable } from './SimulationsTable';
import { SimEditor } from './SimEditor';
import { RunButton } from './RunButton';
import { useIsDesktop } from '../common/useMediaQuery';
import { ToolBtn } from '../common/ToolBtn';
import { isOutdated, simStatus, simStatusLabel } from '../../services/flight/simulations';
import { loadoutLabel } from '../../services/flight/flightConfigs';
import { configOf, selectDesignName } from '../../state/store';
import { useUnits } from '../../prefs/useUnits';
import { runTableCsv, CSV_MIME } from '../../services/exports/csvExport';
import { download, exportFilename } from '../../services/files/saveFile';
import { launcherKind } from '../../services/design/launcher';
import { MotorGuideDialog } from './MotorGuideDialog';

export function SimulationsPane() {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const desktop = useIsDesktop();
  const sims = useWorkspaceStore((s) => s.sims);
  const activeId = useWorkspaceStore((s) => selectActive(s).id);
  const tree = useWorkspaceStore((s) => s.tree);
  const configs = useWorkspaceStore((s) => s.configs);
  const simPrefs = useWorkspaceStore((s) => s.simPrefs);
  const setSimConfig = useWorkspaceStore((s) => s.setSimConfig);
  const simRuns = useWorkspaceStore((s) => s.simRuns);
  const selectedIds = useWorkspaceStore((s) => s.selectedSimIds);

  const onSelect = useWorkspaceStore((s) => s.setActiveId);
  const setTab = useWorkspaceStore((s) => s.setTab);
  const setResultSimId = useWorkspaceStore((s) => s.setResultSimId);
  const onToggle = useWorkspaceStore((s) => s.toggleSimSelected);
  const setSelected = useWorkspaceStore((s) => s.setSimsSelected);
  const onAdd = useWorkspaceStore((s) => s.addSim);
  const onDuplicate = useWorkspaceStore((s) => s.duplicateSim);
  const deleteSim = useWorkspaceStore((s) => s.deleteSim);
  const runOutdated = useWorkspaceStore((s) => s.runOutdated);
  const busy = useWorkspaceStore((s) => s.simBusy);
  const staleCount = useWorkspaceStore((s) => s.sims.filter((x) => !x.result || selectOutdated(s, x)).length);
  const designName = useWorkspaceStore(selectDesignName);
  const u = useUnits();
  const [guideOpen, setGuideOpen] = useState(false);

  const exportRunTable = () => {
    const rows = sims.map((s) => {
      const cfg = configOf(configs, s);
      const motors = loadoutLabel(tree, cfg);
      return {
        name: s.name,
        configuration: cfg.name || motors || t('configs.noMotors'),
        motors,
        status: simStatusLabel(simStatus(s, simRuns, tree, isOutdated(s, tree, cfg, simPrefs)), t),
        result: s.result,
        fileSummary: s.fileSummary?.summary,
      };
    });
    download(
      exportFilename([designName, 'run-table'], 'csv'),
      runTableCsv(rows, u.all, t, launcherKind(tree)),
      CSV_MIME,
    );
  };

  const onDelete = async () => {
    if (
      !settings.simulation.confirmDelete ||
      (await confirm({ message: t('sims.deleteConfirm'), confirmLabel: t('common.delete'), danger: true }))
    ) {
      deleteSim(activeId);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line/10 p-3">
        <ToolBtn onClick={onAdd}>{t('sims.new')}</ToolBtn>
        <ToolBtn onClick={() => onDuplicate(activeId)}>{t('sims.duplicate')}</ToolBtn>
        <ToolBtn
          onClick={onDelete}
          disabled={sims.length <= 1}
          title={sims.length <= 1 ? t('sims.deleteLast') : t('sims.delete')}
          danger
        >
          {t('sims.delete')}
        </ToolBtn>
        {/* Independent of the tick boxes on purpose. */}
        <ToolBtn
          onClick={() => runOutdated()}
          disabled={busy || staleCount === 0}
          title={staleCount === 0 ? t('sims.runOutdatedNone') : t('sims.runOutdated', { count: staleCount })}
        >
          {t('sims.runOutdated', { count: staleCount })}
        </ToolBtn>
        <ToolBtn
          onClick={exportRunTable}
          disabled={!sims.some((s) => s.result || s.fileSummary)}
          title={t('sims.exportRunTable')}
        >
          <span aria-hidden>⬇ CSV</span>
          <span className="sr-only">{t('sims.exportRunTable')}</span>
        </ToolBtn>
        <ToolBtn onClick={() => setGuideOpen(true)} title={t('guide.openHint')}>
          {t('guide.open')}
        </ToolBtn>
        {!desktop && <RunButton className="w-full" />}
      </div>

      {/* `relative` contains the rows' absolute `sr-only` text, which would otherwise scroll the app. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-2">
        <SimulationsTable
          sims={sims}
          activeId={activeId}
          selectedIds={selectedIds}
          runs={simRuns}
          tree={tree}
          configs={configs}
          simPrefs={simPrefs}
          onSetConfig={setSimConfig}
          onSelect={onSelect}
          onToggle={onToggle}
          onToggleAll={(all) => setSelected(all ? sims.map((x) => x.id) : [])}
          onOpenResults={(id) => {
            // Both: the results views follow their own picker, not the active sim.
            onSelect(id);
            setResultSimId(id);
            setTab('results');
          }}
        />

        {!desktop && <SimEditor />}
      </div>
      {guideOpen && <MotorGuideDialog simId={activeId} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
