import { useState, type DragEvent } from 'react';
import type { Simulation, SimPrefs, SimStatus, SimRun } from '../../services/flight/simulations';
import { isOutdated, simStatus, simStatusLabel } from '../../services/flight/simulations';
import type { RocketTree } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import { DEFAULT_SIM_COLS, resultCell, simColumnLabel } from './simColumns';
import { NO_VALUE } from '../../i18n/noValue';
import { warningText } from '../../services/app/warningText';
import { configLabel, type FlightConfig } from '../../services/flight/flightConfigs';
import { configOf } from '../../state/store';
import { sharedLauncher } from '../../services/design/launcher';
import { useLauncherT } from '../common/useLauncher';
import { useFlutterFindings } from './useFlutterFindings';
import { flutterWarningText } from './flutterWarningText';
import { useTranslation } from 'react-i18next';
import { aeroTablesOf, calcMethodKey, hasAeroTables } from '../../services/flight/aeroTables';

const TONE: Record<SimStatus, string> = {
  upToDate: 'bg-ok-400',
  outdated: 'bg-warn-400',
  queued: 'bg-accent-400/50',
  running: 'bg-accent-400 animate-pulse',
  failed: 'bg-danger-500',
  notRun: 'bg-prominent',
  fromFile: 'bg-ink-soft',
};

function WarningsButton({
  sim,
  t,
  onOpen,
}: {
  sim: Simulation;
  t: ReturnType<typeof useLauncherT>;
  onOpen: () => void;
}) {
  const u = useUnits();
  const flutter = useFlutterFindings(sim);
  const lines = [
    ...flutter.map((f) => flutterWarningText(f, t)),
    ...(sim.result?.warnings ?? []).map((w) => warningText(w.message, t, (q, si) => u.fmtSym(q, si))),
  ];
  if (!lines.length) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={lines.join('\n')}
      aria-label={t('sim.warnings', { count: lines.length })}
      aria-describedby={`sim-warnings-${sim.id}`}
      className="shrink-0 rounded text-[11px] text-warn-400 focus:outline-none focus:ring-1 focus:ring-accent-500"
    >
      <span aria-hidden>&#9888; {lines.length}</span>
      <span id={`sim-warnings-${sim.id}`} className="sr-only">
        {lines.join('\n')}
      </span>
    </button>
  );
}

/** A simulation flying desktop's custom aerodynamic data says so, and what the data replaces. */
function AeroTablesTag({ sim }: { sim: Simulation }) {
  const { t } = useTranslation();
  const tables = aeroTablesOf(sim.xmlExtra);
  if (!hasAeroTables(tables)) return null;
  const detail = `${t(calcMethodKey(tables))}. ${t('sims.aeroTablesHint')}`;
  return (
    <span
      title={detail}
      // Opaque: a tint over the active row's own tint loses contrast in the light theme.
      className="ml-2 whitespace-nowrap rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium text-accent-200 ring-1 ring-accent-500/40"
    >
      {t('sims.aeroTablesTag')}
      <span className="sr-only">: {detail}</span>
    </span>
  );
}

type Translate = ReturnType<typeof useLauncherT>;

/** A dragged heading's id travels under this type, so a drop of anything else is ignored. */
const DRAG_TYPE = 'application/x-sim-column';

export function SimulationsTable({
  sims,
  activeId,
  selectedIds,
  runs,
  tree,
  configs,
  simPrefs,
  onSetConfig,
  onSelect,
  onToggle,
  onToggleAll,
  onOpenResults,
  order = DEFAULT_SIM_COLS,
  onMoveColumn,
}: {
  sims: Simulation[];
  activeId: string;
  /** Empty means "just the active one" (see selectRunIds). */
  selectedIds: string[];
  runs: Record<string, SimRun>;
  tree: RocketTree;
  configs: FlightConfig[];
  simPrefs: SimPrefs;
  onSetConfig: (simId: string, configId: string) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: (all: boolean) => void;
  onOpenResults: (id: string) => void;
  /** Shown column ids in order, from `useSimColumns`. */
  order?: readonly string[];
  /** Given, the headings drag: `id` dropped on `target`'s heading moves there. */
  onMoveColumn?: (id: string, target: string) => void;
}) {
  // Their headings cover every row: worded for the launcher they share, else neutral.
  const t = useLauncherT(
    sharedLauncher(
      sims.map((x) => x.launch),
      tree,
    ),
  );
  const u = useUnits();
  const cells = new Map(order.map((id) => [id, resultCell(id, u, t)]));

  const allTicked = sims.length > 0 && selectedIds.length === sims.length;
  const someTicked = selectedIds.length > 0 && !allTicked;

  return (
    // `min-w-full`, not `w-full`: with many columns the table grows and its container scrolls sideways.
    <table className="min-w-full border-collapse whitespace-nowrap text-sm">
      <thead>
        <tr className="border-b border-line/10 text-[11px] uppercase tracking-wide text-ink-muted">
          <th scope="col" className="w-8 px-2 py-2">
            <input
              type="checkbox"
              checked={allTicked}
              ref={(el) => {
                if (el) el.indeterminate = someTicked;
              }}
              onChange={(e) => onToggleAll(e.target.checked)}
              aria-label={t('sims.selectAll')}
              className="accent-accent-500"
            />
          </th>
          {order.map((id) => {
            const cell = cells.get(id) ?? null;
            return (
              <Th key={id} id={id} num={!!cell} onMove={onMoveColumn} hint={t('sims.dragColumn')}>
                {cell ? (
                  <>
                    {t(cell.col.label, cell.col.labelValues?.(u))} {cell.sym && <Unit>{cell.sym}</Unit>}
                  </>
                ) : (
                  simColumnLabel(id, t, u)
                )}
              </Th>
            );
          })}
          <th scope="col" className="w-10 px-2 py-2" />
        </tr>
      </thead>
      <tbody>
        {sims.map((s) => {
          const status = simStatus(s, runs, tree, isOutdated(s, tree, configOf(configs, s), simPrefs));
          const isActive = s.id === activeId;
          const r = s.result?.summary ?? s.fileSummary?.summary;
          const dim = status === 'outdated' || status === 'fromFile' ? 'text-ink-muted' : 'text-ink';
          return (
            // `aria-current`, not `aria-selected`, which needs a grid role.
            <tr
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`cursor-pointer border-b border-line/5 ${
                isActive ? 'bg-accent-600/20 ring-1 ring-inset ring-accent-500/40' : 'hover:bg-raised/60'
              }`}
            >
              <td className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle(s.id)}
                  aria-label={t('sims.selectOne', { name: s.name })}
                  className="accent-accent-500"
                />
              </td>
              {order.map((id) => {
                const cell = cells.get(id);
                if (cell) {
                  const v = r ? cell.col.value(r, s.result) : null;
                  return (
                    <Num key={id} className={dim}>
                      {v != null && Number.isFinite(v) ? cell.fmt(v) : null}
                    </Num>
                  );
                }
                return (
                  <Td key={id}>
                    <InfoCell
                      id={id}
                      sim={s}
                      status={status}
                      isActive={isActive}
                      t={t}
                      tree={tree}
                      configs={configs}
                      onSelect={onSelect}
                      onSetConfig={onSetConfig}
                      onOpenResults={onOpenResults}
                    />
                  </Td>
                );
              })}
              <td className="w-10 px-2 py-2 text-right">
                {!!s.result && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenResults(s.id);
                    }}
                    title={t('sims.viewResults')}
                    aria-label={t('sims.viewResultsFor', { name: s.name })}
                    className="rounded-md px-1.5 py-0.5 text-sm text-accent-300 hover:bg-elevated focus:outline-none focus:ring-1 focus:ring-accent-500"
                  >
                    📊
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Status, name or configuration: the columns that are not figures. */
function InfoCell({
  id,
  sim: s,
  status,
  isActive,
  t,
  tree,
  configs,
  onSelect,
  onSetConfig,
  onOpenResults,
}: {
  id: string;
  sim: Simulation;
  status: SimStatus;
  isActive: boolean;
  t: Translate;
  tree: RocketTree;
  configs: FlightConfig[];
  onSelect: (id: string) => void;
  onSetConfig: (simId: string, configId: string) => void;
  onOpenResults: (id: string) => void;
}) {
  if (id === 'status') {
    return (
      <span className="flex items-center gap-1.5">
        <span className={`size-2 shrink-0 rounded-full ${TONE[status]}`} aria-hidden />
        <span className="text-[11px] text-ink-muted">{simStatusLabel(status, t)}</span>
        <WarningsButton sim={s} t={t} onOpen={() => onOpenResults(s.id)} />
      </span>
    );
  }
  if (id === 'config') {
    return (
      <select
        value={configOf(configs, s).id}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onSetConfig(s.id, e.target.value);
        }}
        aria-label={t('configs.pickFor', { name: s.name })}
        className="w-full max-w-56 rounded-md bg-raised px-1.5 py-1 text-xs text-ink ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
      >
        {configs.map((c) => (
          <option key={c.id} value={c.id}>
            {configLabel(tree, c) || t('configs.noMotors')}
          </option>
        ))}
      </select>
    );
  }
  return (
    <>
      <button
        onClick={() => onSelect(s.id)}
        aria-current={isActive ? 'true' : undefined}
        className={`rounded text-left font-medium focus:outline-none focus:ring-1 focus:ring-accent-500 ${
          isActive ? 'text-accent-100' : 'text-ink-strong'
        }`}
      >
        {s.name}
      </button>
      <AeroTablesTag sim={s} />
    </>
  );
}

function Th({
  children,
  id,
  num,
  onMove,
  hint,
}: {
  children: React.ReactNode;
  id: string;
  num?: boolean;
  onMove?: (id: string, target: string) => void;
  hint: string;
}) {
  const [over, setOver] = useState(false);
  const drag = onMove
    ? {
        draggable: true,
        title: hint,
        onDragStart: (e: DragEvent<HTMLTableCellElement>) => {
          e.dataTransfer.setData(DRAG_TYPE, id);
          e.dataTransfer.effectAllowed = 'move';
        },
        onDragOver: (e: DragEvent<HTMLTableCellElement>) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent<HTMLTableCellElement>) => {
          setOver(false);
          const dragged = e.dataTransfer.getData(DRAG_TYPE);
          if (!dragged) return;
          e.preventDefault();
          onMove(dragged, id);
        },
      }
    : {};
  return (
    <th
      scope="col"
      {...drag}
      className={`px-2 py-2 font-semibold ${num ? 'text-right' : 'text-left'} ${onMove ? 'cursor-grab' : ''} ${
        over ? 'bg-accent-500/20' : ''
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-2">{children}</td>;
}

function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-2 py-2 text-right tabular-nums ${className ?? ''}`}>
      {children ?? <span className="text-ink-dim">{NO_VALUE}</span>}
    </td>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="font-normal text-ink-faint">{children}</span>;
}
