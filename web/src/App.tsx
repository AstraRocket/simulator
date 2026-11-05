import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from './state/store';
import { useWorkspaceEffects } from './state/useWorkspaceEffects';
import { useBayBackup } from './state/useBayBackup';
import { AppHeader } from './components/layout/AppHeader';
import { CenterView } from './components/canvas/CenterView';
import { PropertyPane } from './components/design/PropertyPane';
import { ComponentDialog } from './components/design/ComponentDialog';
import { SimulationsPane } from './components/sim/SimulationsPane';
import { ConfigsPane } from './components/config/ConfigsPane';
import { ConfigEditor } from './components/config/ConfigEditor';
import { SimEditor } from './components/sim/SimEditor';
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
import { useSettings } from './state/useSettings';
import { CENTER_PANE_MIN } from './services/storage/settings';
import {
  AppBanners,
  ResultsColumn,
  RightColumn,
  TabSection,
  TreeColumn,
  type SideSplit,
} from './components/layout/AppPanes';
import { usePaneWidths } from './components/layout/usePaneWidths';

export default function App() {
  useWorkspaceEffects();
  useBayBackup();
  const { t } = useTranslation();
  const tab = useWorkspaceStore((s) => s.tab);
  const configsTab = useWorkspaceStore((s) => s.configsTab);

  // The center pane stays mounted across Design/Results: remounting the canvases would re-run the engine.
  const onCenter = tab === 'design' || tab === 'results';
  // Picked by JS breakpoint, not CSS, so a hidden duplicate editor never sits in the document.
  const desktop = useIsDesktop();
  const wide = useIsWide();

  const { settings } = useSettings();
  const { treeW, sideW, onDragTree, onCommitTree, onDragSide, onCommitSide } = usePaneWidths();

  // The 5px dividers come out of the center's share, so it can end slightly under CENTER_PANE_MIN.
  const sideReserve = (tab === 'design' ? treeW : 0) + CENTER_PANE_MIN;

  const maxed = settings.maximizeCenter && onCenter;
  const sideStyle = { width: sideW, maxWidth: `calc(100vw - ${sideReserve}px)` };
  const propsW = wide ? sideW : 0;
  const side: SideSplit = { width: sideW, reserve: sideReserve, onDrag: onDragSide, onCommit: onCommitSide };
  const designOpen = tab === 'design' && !maxed;

  // h-full, not h-screen: 100vh would put the mobile tab bar under the browser chrome.
  return (
    <div className="flex h-full flex-col bg-canvas text-ink-strong">
      <AppHeader />
      <UpdateToast />
      <CatalogNotice />

      <AppBanners />
      <EngineNotice />

      {/* On a phone one pane is visible, so source order is the phone's order. */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <TreeColumn
          open={designOpen}
          width={treeW}
          reserve={propsW + CENTER_PANE_MIN}
          onDrag={onDragTree}
          onCommit={onCommitTree}
        />

        <TabSection open={onCenter}>
          <CenterView />
        </TabSection>

        {wide && designOpen && (
          <RightColumn split={side} style={sideStyle}>
            <PropertyPane />
          </RightColumn>
        )}

        <TabSection open={tab === 'configs'}>
          <ConfigsPane />
        </TabSection>

        {desktop && tab === 'configs' && configsTab !== 'bays' && (
          <RightColumn split={side} style={sideStyle}>
            <ConfigEditor />
          </RightColumn>
        )}

        <TabSection open={tab === 'sim'}>
          <SimulationsPane />
        </TabSection>

        {desktop && tab === 'sim' && (
          <RightColumn split={side} style={sideStyle}>
            <SimEditor />
          </RightColumn>
        )}

        <ResultsColumn open={tab === 'results' && !maxed} desktop={desktop} split={side} style={sideStyle} />
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
