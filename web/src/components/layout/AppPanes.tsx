import { useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectDesignName, selectShownSim } from '../../state/store';
import { TreePanel } from '../design/TreePanel';
import { FlightEventsTable } from '../sim/FlightEventsTable';
import { SimSummary } from '../sim/SimSummary';
import { FlightWarnings } from '../sim/FlightWarnings';
import { RecoveryChargesCard } from '../sim/RecoveryChargesCard';
import { PaneSplitter } from './PaneSplitter';
import {
  SIDE_PANE_DEFAULT,
  SIDE_PANE_MAX,
  SIDE_PANE_MIN,
  TREE_PANE_DEFAULT,
  TREE_PANE_MAX,
  TREE_PANE_MIN,
} from '../../services/storage/settings';
import { Banner } from '../common/Banner';

export function AppBanners() {
  const err = useWorkspaceStore((s) => s.err);
  const buildErr = useWorkspaceStore((s) => s.buildErr);
  const storageWarning = useWorkspaceStore((s) => s.storageWarning);
  return (
    <>
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
    </>
  );
}

export function TabSection({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <section className={`${open ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col lg:h-full lg:overflow-hidden`}>
      {children}
    </section>
  );
}

export function TreeColumn({
  open,
  width: treeW,
  reserve,
  onDrag,
  onCommit,
}: {
  open: boolean;
  width: number;
  reserve: number;
  onDrag: (w: number | null) => void;
  onCommit: (w: number) => void;
}) {
  const { t } = useTranslation();
  const treeRef = useRef<HTMLElement>(null);
  return (
    <>
      <section
        ref={treeRef}
        style={{ width: treeW, maxWidth: `calc(100vw - ${reserve}px)` }}
        className={`hidden shrink-0 lg:h-full lg:overflow-y-auto ${open ? 'lg:block' : ''}`}
      >
        <TreePanel />
      </section>
      {/* The divider is the rule between the panes, so the column has no border-r. */}
      {open && (
        <PaneSplitter
          paneRef={treeRef}
          width={treeW}
          min={TREE_PANE_MIN}
          max={TREE_PANE_MAX}
          reserve={reserve}
          fallback={TREE_PANE_DEFAULT}
          label={t('panes.resizeTree')}
          onDrag={onDrag}
          onCommit={onCommit}
        />
      )}
    </>
  );
}

export function ResultsColumn({
  open,
  desktop,
  split,
  style,
}: {
  open: boolean;
  desktop: boolean;
  split: SideSplit;
  style: CSSProperties;
}) {
  const { t } = useTranslation();
  const result = useWorkspaceStore((s) => selectShownSim(s).result ?? null);
  const shownSimName = useWorkspaceStore((s) => selectShownSim(s).name);
  const designName = useWorkspaceStore(selectDesignName);
  const summaryRef = useRef<HTMLElement>(null);
  return (
    <>
      {/* `relative`: without a positioned ancestor, sr-only labels stretch the document and the app scrolls. */}
      {open && <SideSplitter paneRef={summaryRef} {...split} />}
      <section
        ref={summaryRef}
        style={style}
        className={`relative hidden shrink-0 p-3 lg:h-full lg:overflow-y-auto ${open ? 'lg:block' : ''}`}
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
    </>
  );
}

export interface SideSplit {
  width: number;
  reserve: number;
  onDrag: (w: number | null) => void;
  onCommit: (w: number) => void;
}

export function RightColumn({
  split,
  style,
  children,
}: {
  split: SideSplit;
  style: CSSProperties;
  children: ReactNode;
}) {
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
