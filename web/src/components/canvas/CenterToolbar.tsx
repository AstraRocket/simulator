import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectOutdated, selectShownSim, type WorkspaceState } from '../../state/store';
import { simStatus, simStatusLabel, type SimStatus } from '../../services/flight/simulations';
import { ResultPicker } from '../sim/ResultPicker';
import { ViewToggle } from './ViewToggle';
import { JOINED, ToolDivider, ToolGroup, ViewBtn } from './ViewBtn';
import { Segmented } from '../common/Segmented';
import { ToggleButton } from '../common/ToggleButton';
import { useViewPrefs } from './useViewPrefs';

const TWO_D_VIEWS = ['side', 'aft'] as const;

// A string, so subscribers re-render only when the status changes.
const selectShownStatus = (s: WorkspaceState): SimStatus => {
  const sim = selectShownSim(s);
  return simStatus(sim, s.simRuns, s.tree, selectOutdated(s, sim));
};

const STATUS_CHIP: Partial<Record<SimStatus, string>> = {
  queued: 'bg-accent-500/15 text-accent-300 ring-accent-400/30',
  running: 'bg-accent-500/15 text-accent-300 ring-accent-400/30',
  failed: 'bg-danger-500/15 text-danger-200 ring-danger-400/30',
  outdated: 'bg-warn-500/15 text-warn-200 ring-warn-400/30',
};

export function CenterToolbar({
  resultName,
  onCtrlSlot,
  onPresetSlot,
  maxed,
  onToggleMaxed,
}: {
  resultName: string;
  onCtrlSlot: (el: HTMLDivElement | null) => void;
  onPresetSlot: (el: HTMLDivElement | null) => void;
  maxed: boolean;
  onToggleMaxed: () => void;
}) {
  const { t } = useTranslation();
  const tab = useWorkspaceStore((s) => s.tab);
  const view = useWorkspaceStore((s) => s.view);
  const onView = useWorkspaceStore((s) => s.setView);
  const twoD = useWorkspaceStore((s) => s.twoD);
  const onTwoD = useWorkspaceStore((s) => s.setTwoD);
  const onResetView = useWorkspaceStore((s) => s.resetView);
  const status = useWorkspaceStore(selectShownStatus);
  const chip = STATUS_CHIP[status];
  const { showMarkers, showInfoCard, rulers, toggleMarkers, toggleInfoCard, toggleRulerSide } = useViewPrefs();

  // `@container/bar`: ToolDivider responds to this row's width.
  return (
    <div className="@container/bar flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 pt-3">
      <div className="flex flex-wrap items-center gap-1">
        {tab === 'results' && (
          <div className="flex items-center gap-2">
            <ResultPicker fallbackName={resultName} />
            {chip && (
              <span
                role={status === 'outdated' ? undefined : 'status'}
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${chip}`}
              >
                {status === 'running' && (
                  <span aria-hidden className="size-1.5 rounded-full bg-accent-400 motion-safe:animate-pulse" />
                )}
                {simStatusLabel(status, t)}
              </span>
            )}
          </div>
        )}
        {view === '2d' && (
          <>
            <ViewBtn onClick={onResetView}>{t('view.reset')}</ViewBtn>
            <Segmented
              size="bar"
              options={TWO_D_VIEWS}
              value={twoD}
              onChange={onTwoD}
              fmt={(v) => t(`view.${v}`)}
              title={(v) => t(`view.${v}Title`)}
            />
            <ToolDivider />
          </>
        )}
        {view === '3d' && <div ref={onPresetSlot} className="flex items-center gap-1" />}
        {(view === '2d' || view === '3d') && (
          <>
            <ViewBtn active={showMarkers} onClick={toggleMarkers} title={t('view.markersTitle')}>
              {t('view.markers')}
            </ViewBtn>
            <ViewBtn active={showInfoCard} onClick={toggleInfoCard} title={t('view.infoCardTitle')}>
              {t('view.infoCard')}
            </ViewBtn>
            {view === '2d' && (
              <>
                <ToolDivider />
                <span className="text-xs font-medium text-ink-muted">{t('view.rulers')}</span>
                <ToolGroup label={t('view.rulers')}>
                  {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                    <ToggleButton
                      key={side}
                      active={rulers[side]}
                      onClick={() => toggleRulerSide(side)}
                      title={t(`view.ruler_${side}`)}
                      label={t(`view.ruler_${side}`)}
                      className={`${JOINED} w-6`}
                    >
                      {t(`view.ruler_${side}_abbr`)}
                    </ToggleButton>
                  ))}
                </ToolGroup>
              </>
            )}
          </>
        )}
      </div>
      <div ref={onCtrlSlot} className="flex items-center gap-1" />
      {/* ml-auto keeps it right when wrapped alone, where justify-between does nothing. */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <ViewToggle view={view} onChange={onView} family={tab === 'results' ? 'result' : 'design'} />
        <span className="hidden lg:block">
          {/* One accessible name plus aria-pressed; the tooltip says what the next press does. */}
          <ViewBtn
            active={maxed}
            onClick={onToggleMaxed}
            title={maxed ? t('panes.restore') : t('panes.maximize')}
            label={t('panes.maximize')}
          >
            <span aria-hidden>{maxed ? '⤡' : '⤢'}</span>
          </ViewBtn>
        </span>
      </div>
    </div>
  );
}
