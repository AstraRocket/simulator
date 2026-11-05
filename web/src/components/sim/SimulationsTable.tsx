import type { Simulation, SimPrefs, SimStatus, SimRun } from '../../services/flight/simulations';
import { isOutdated, simStatus, simStatusLabel } from '../../services/flight/simulations';
import type { RocketTree } from '../../engine/openRocketEngine';
import { useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { fmtNum } from '../../i18n/format';
import { NO_VALUE } from '../../i18n/noValue';
import { warningText } from '../../services/app/warningText';
import { configLabel, type FlightConfig } from '../../services/flight/flightConfigs';
import { configOf } from '../../state/store';
import { launcherKind } from '../../services/design/launcher';
import { useLauncherT } from '../common/useLauncher';
import { useFlutterFindings } from './useFlutterFindings';
import { flutterWarningText } from './FlutterWarningRows';

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
}) {
  const t = useLauncherT(launcherKind(tree));
  const u = useUnits();
  const apogee = u.at(unitScope('sim', 'apogee'), 'distance');
  const rodExit = u.at(unitScope('sim', 'rodExit'), 'velocity');
  const maxSpeed = u.at(unitScope('sim', 'maxSpeed'), 'velocity');
  const maxAccel = u.at(unitScope('sim', 'maxAccel'), 'acceleration');
  const landing = u.at(unitScope('sim', 'landing'), 'velocity');

  const allTicked = sims.length > 0 && selectedIds.length === sims.length;
  const someTicked = selectedIds.length > 0 && !allTicked;

  return (
    <table className="w-full border-collapse text-sm">
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
          <Th>{t('sims.status')}</Th>
          <Th>{t('sims.name')}</Th>
          <Th wide>{t('configs.name')}</Th>
          <Th num>
            {t('sim.apogee')} <Unit>{apogee.sym}</Unit>
          </Th>
          <Th num wide>
            {t('sim.maxSpeed')} <Unit>{maxSpeed.sym}</Unit>
          </Th>
          <Th num wide>
            {t('sim.maxAccel')} <Unit>{maxAccel.sym}</Unit>
          </Th>
          <Th num wide>
            {t('sim.rodExit')} <Unit>{rodExit.sym}</Unit>
          </Th>
          <Th num wide>
            {t('sim.toApogee')} <Unit>{t('units.second')}</Unit>
          </Th>
          <Th num wide>
            {t('sim.flightTime')} <Unit>{t('units.second')}</Unit>
          </Th>
          <Th num wide>
            {t('sim.landing')} <Unit>{landing.sym}</Unit>
          </Th>
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
              <Td>
                <span className="flex items-center gap-1.5">
                  <span className={`size-2 shrink-0 rounded-full ${TONE[status]}`} aria-hidden />
                  <span className="text-[11px] text-ink-muted">{simStatusLabel(status, t)}</span>
                  <WarningsButton sim={s} t={t} onOpen={() => onOpenResults(s.id)} />
                </span>
              </Td>
              <Td>
                <button
                  onClick={() => onSelect(s.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`rounded text-left font-medium focus:outline-none focus:ring-1 focus:ring-accent-500 ${
                    isActive ? 'text-accent-100' : 'text-ink-strong'
                  }`}
                >
                  {s.name}
                </button>
              </Td>
              <Td wide>
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
              </Td>
              <Num className={dim}>{r ? apogee.fmt(r.maxAltitude) : null}</Num>
              <Num wide className={dim}>
                {r ? maxSpeed.fmt(r.maxVelocity) : null}
              </Num>
              <Num wide className={dim}>
                {r ? maxAccel.fmt(r.maxAcceleration) : null}
              </Num>
              <Num wide className={dim}>
                {r ? rodExit.fmt(r.launchRodVelocity) : null}
              </Num>
              <Num wide className={dim}>
                {r ? fmtNum(r.timeToApogee, 1) : null}
              </Num>
              <Num wide className={dim}>
                {r ? fmtNum(r.flightTime, 1) : null}
              </Num>
              <Num wide className={dim}>
                {r ? landing.fmt(r.groundHitVelocity) : null}
              </Num>
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

function Th({ children, num, wide }: { children: React.ReactNode; num?: boolean; wide?: boolean }) {
  return (
    <th
      scope="col"
      className={`${wide ? 'hidden lg:table-cell' : ''} px-2 py-2 font-semibold ${num ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  );
}

function Td({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <td className={`${wide ? 'hidden lg:table-cell' : ''} px-2 py-2`}>{children}</td>;
}

function Num({ children, wide, className }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return (
    <td className={`${wide ? 'hidden lg:table-cell' : ''} px-2 py-2 text-right tabular-nums ${className ?? ''}`}>
      {children ?? <span className="text-ink-dim">{NO_VALUE}</span>}
    </td>
  );
}

function Unit({ children }: { children: React.ReactNode }) {
  return <span className="font-normal text-ink-faint">{children}</span>;
}
