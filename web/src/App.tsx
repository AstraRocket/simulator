import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectDesignName, selectShownSim } from './state/store';
import { useWorkspaceEffects } from './state/useWorkspaceEffects';
import { useBayBackup } from './state/useBayBackup';
import { AppHeader } from './components/layout/AppHeader';
import { CenterView } from './components/canvas/CenterView';
import { TreePanel } from './components/design/TreePanel';
import { PropertyPane } from './components/design/PropertyPane';
import { ComponentDialog } from './components/design/ComponentDialog';
import { SimulationsPane } from './components/sim/SimulationsPane';
import { ConfigsPane } from './components/config/ConfigsPane';
import { ConfigEditor } from './components/config/ConfigEditor';
import { SimEditor } from './components/sim/SimEditor';
import { FlightEventsTable } from './components/sim/FlightEventsTable';
import { SimSummary } from './components/sim/SimSummary';
import { FlightWarnings } from './components/sim/FlightWarnings';
import { RecoveryChargesCard } from './components/sim/RecoveryChargesCard';
import { TabBar } from './components/layout/TabBar';
import { ToolsPane } from './components/tools/ToolsPane';
import { SimpleRocketTool } from './components/tools/SimpleRocketTool';
import { WorkInProgressDialog } from './components/layout/WorkInProgressDialog';
import { ConfirmDialog } from './components/common/ConfirmDialog';
import { PromptDialog } from './components/common/PromptDialog';
import { UpdateToast } from './components/layout/UpdateToast';
import { CatalogNotice } from './components/layout/CatalogNotice';
import { EngineNotice } from './components/layout/EngineNotice';
import { useIsDesktop, useIsWide } from './components/common/useMediaQuery';
import { PaneSplitter } from './components/layout/PaneSplitter';
import { useSettings } from './state/SettingsProvider';
import {
  CENTER_PANE_MIN,
  SIDE_PANE_DEFAULT,
  SIDE_PANE_MAX,
  SIDE_PANE_MIN,
  TREE_PANE_DEFAULT,
  TREE_PANE_MAX,
  TREE_PANE_MIN,
} from './services/storage/settings';
import { Banner } from './components/common/Banner';

export default function App() {
  useWorkspaceEffects();
  useBayBackup();
  const { t } = useTranslation();
  const tab = useWorkspaceStore((s) => s.tab);
  const configsTab = useWorkspaceStore((s) => s.configsTab);
  const err = useWorkspaceStore((s) => s.err);
  const buildErr = useWorkspaceStore((s) => s.buildErr);
  const storageWarning = useWorkspaceStore((s) => s.storageWarning);
  const result = useWorkspaceStore((s) => selectShownSim(s).result ?? null);
  const shownSimName = useWorkspaceStore((s) => selectShownSim(s).name);
  const designName = useWorkspaceStore(selectDesignName);

  // The center pane stays mounted across Design/Results: remounting the canvases would re-run the engine.
  const onCenter = tab === 'design' || tab === 'results';
  // Picked by JS breakpoint, not CSS, so a hidden duplicate editor never sits in the document.
  const desktop = useIsDesktop();
  const wide = useIsWide();

  const { settings, update } = useSettings();
  const [dragTree, setDragTree] = useState<number | null>(null);
  const [dragSide, setDragSide] = useState<number | null>(null);
  const treeW = dragTree ?? settings.treePaneWidth;
  const sideW = dragSide ?? settings.sidePaneWidth;
  const treeRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  // The 5px dividers come out of the center's share, so it can end slightly under CENTER_PANE_MIN.
  const sideReserve = (tab === 'design' ? treeW : 0) + CENTER_PANE_MIN;

  const maxed = settings.maximizeCenter && onCenter;
  const sideStyle = { width: sideW, maxWidth: `calc(100vw - ${sideReserve}px)` };
  const propsW = wide ? sideW : 0;
  const side: SideSplit = {
    width: sideW,
    reserve: sideReserve,
    onDrag: setDragSide,
    onCommit: (w: number) => {
      setDragSide(null);
      update({ sidePaneWidth: w });
    },
  };

  // h-full, not h-screen: 100vh would put the mobile tab bar under the browser chrome.
  return (
    <div className="flex h-full flex-col bg-canvas text-ink-strong">
      <AppHeader />
      <UpdateToast />
      <CatalogNotice />

      {storageWarning && (
        <Banner tone="warn" role="status">
          {storageWarning}
        </Banner>
      )}
      {buildErr && (
        <Banner tone="danger" role="alert">
          {buildErr}
        </Banner>
      )}
      {err && err !== buildErr && (
        <Banner tone="danger" role="alert">
          {err}
        </Banner>
      )}
      <EngineNotice />

      {/* On a phone one pane is visible, so source order is the phone's order. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <section
          ref={treeRef}
          style={{ width: treeW, maxWidth: `calc(100vw - ${propsW + CENTER_PANE_MIN}px)` }}
          className={`hidden shrink-0 lg:h-full lg:overflow-y-auto ${tab === 'design' && !maxed ? 'lg:block' : ''}`}
        >
          <TreePanel />
        </section>
        {/* The divider is the rule between the panes, so the column has no border-r. */}
        {tab === 'design' && !maxed && (
          <PaneSplitter
            paneRef={treeRef}
            width={treeW}
            min={TREE_PANE_MIN}
            max={TREE_PANE_MAX}
            reserve={propsW + CENTER_PANE_MIN}
            fallback={TREE_PANE_DEFAULT}
            label={t('panes.resizeTree')}
            onDrag={setDragTree}
            onCommit={(w) => {
              setDragTree(null);
              update({ treePaneWidth: w });
            }}
          />
        )}

        <section className={`${onCenter ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:h-full lg:overflow-hidden`}>
          <CenterView />
        </section>

        {wide && tab === 'design' && !maxed && (
          <RightColumn split={side} style={sideStyle}>
            <PropertyPane />
          </RightColumn>
        )}

        <section
          className={`${tab === 'configs' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:h-full lg:overflow-hidden`}
        >
          <ConfigsPane />
        </section>

        {desktop && tab === 'configs' && configsTab !== 'bays' && (
          <RightColumn split={side} style={sideStyle}>
            <ConfigEditor />
          </RightColumn>
        )}

        <section
          className={`${tab === 'sim' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:h-full lg:overflow-hidden`}
        >
          <SimulationsPane />
        </section>

        {desktop && tab === 'sim' && (
          <RightColumn split={side} style={sideStyle}>
            <SimEditor />
          </RightColumn>
        )}

        {/* `relative`: without a positioned ancestor, sr-only labels stretch the document and the app scrolls. */}
        {tab === 'results' && !maxed && <SideSplitter paneRef={summaryRef} {...side} />}
        <section
          ref={summaryRef}
          style={sideStyle}
          className={`relative hidden shrink-0 p-3 lg:h-full lg:overflow-y-auto ${tab === 'results' && !maxed ? 'lg:block' : ''}`}
          aria-label={t('tabs.results')}
        >
          <div className="space-y-4">
            {/* Here or in CenterView's phone copy, never both: a hidden duplicate still answers to a search. */}
            {desktop && <FlightWarnings sim={result} />}
            <SimSummary sim={result} />
            <FlightEventsTable sim={result} simName={shownSimName} designName={designName} />
            {desktop && <RecoveryChargesCard />}
          </div>
        </section>
        {/* Mounted only while open: hidden, their site fields would be a second Latitude and Longitude. */}
        {tab === 'simple' && (
          <section
            className="relative flex min-h-0 flex-1 flex-col overflow-auto p-3 lg:h-full"
            aria-label={t('tabs.simple')}
          >
            <SimpleRocketTool />
          </section>
        )}
        {tab === 'tools' && (
          <section className="flex min-h-0 flex-1 flex-col lg:h-full lg:overflow-hidden" aria-label={t('tabs.tools')}>
            <ToolsPane />
          </section>
        )}
      </main>

      <TabBar />
      {!wide && tab === 'design' && <ComponentDialog />}
      <WorkInProgressDialog />
      <ConfirmDialog />
      <PromptDialog />
    </div>
  );
}

interface SideSplit {
  width: number;
  reserve: number;
  onDrag: (w: number | null) => void;
  onCommit: (w: number) => void;
}

function RightColumn({ split, style, children }: { split: SideSplit; style: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  return (
    <>
      <SideSplitter paneRef={ref} {...split} />
      {/* `relative`: see the Results summary column. */}
      <section ref={ref} style={style} className="relative shrink-0 overflow-y-auto lg:h-full">
        {children}
      </section>
    </>
  );
}

/** A component, not a render helper: the compiler lint flags a ref passed to a function during render. */
function SideSplitter({
  paneRef,
  width,
  reserve,
  onDrag,
  onCommit,
}: SideSplit & {
  paneRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  return (
    <PaneSplitter
      side="right"
      paneRef={paneRef}
      width={width}
      min={SIDE_PANE_MIN}
      max={SIDE_PANE_MAX}
      reserve={reserve}
      fallback={SIDE_PANE_DEFAULT}
      label={t('panes.resizeSide')}
      onDrag={onDrag}
      onCommit={onCommit}
    />
  );
}
