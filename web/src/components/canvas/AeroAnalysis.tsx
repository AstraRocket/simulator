import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { fmtNum } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import type { ComponentMass } from '../../engine/openRocketEngine';
import type { CpMode } from './aeroTables';
import { cpDivisor, cpModesFor, nearestSampleIndex } from './aeroTables';
import { useAeroSweep } from './useAeroSweep';
import { useAeroSeries } from './useAeroSeries';
import { AeroChartsPane, AeroConditions, AeroHeader } from './AeroAnalysisParts';
import { ComponentTable, RollTable, StabilityTable } from './AeroComponentTables';
import type { AeroPane } from '../../state/tabs';

export function AeroAnalysis() {
  const { t } = useTranslation();
  const u = useUnits();
  const rocket = useWorkspaceStore((s) => s.rocket);
  const info = useWorkspaceStore((s) => s.info);
  const [machMax, setMachMax] = useState(1);
  const [cpModeSel, setCpMode] = useState<CpMode>('len');
  const [hoverM, setHoverM] = useState<number | null>(null);
  const [pane, setPane] = useState<AeroPane>('charts');
  const [machPick, setMachPick] = useState(0.3);
  const [aoaDeg, setAoaDeg] = useState(0);
  const [thetaDeg, setThetaDeg] = useState(0);
  const [rollRate, setRollRate] = useState(0);
  const [altitudeM, setAltitudeM] = useState(0);

  const { sweep, pending } = useAeroSweep(rocket, { machMax, aoaDeg, thetaDeg, rollRate, altitudeM });

  // All hover writes go through here, so the ref is the true previous value; never hand out `setHoverM`.
  const lastHover = useRef<number | null>(null);
  const setHover = useCallback((m: number | null | ((prev: number | null) => number | null)) => {
    const next = typeof m === 'function' ? m(lastHover.current) : m;
    if (next == null && lastHover.current != null) setMachPick(lastHover.current);
    lastHover.current = next;
    setHoverM(next);
  }, []);

  const masses = useMemo<ComponentMass[]>(() => {
    if (!rocket) return [];
    try {
      return rocket.componentMasses();
    } catch (e) {
      console.error('componentMasses failed', e);
      return [];
    }
  }, [rocket]);

  const bodyLen = info?.length ?? 0;
  const aeroLen = info?.lengthAerodynamic ?? 0;
  const cpModes = useMemo(() => cpModesFor(bodyLen, aeroLen), [bodyLen, aeroLen]);
  const cpMode = cpModes.includes(cpModeSel) ? cpModeSel : 'len';
  const cpDiv = cpDivisor(cpMode, bodyLen, aeroLen);
  const { cdSeries, breakdown, cpSeries } = useAeroSeries(sweep, cpDiv, u.factor('length'));

  if (!sweep)
    return (
      <div className="grid h-full place-items-center text-sm text-ink-faint" aria-busy={pending}>
        {pending ? t('aero.computing') : t('aero.unavailable')}
      </div>
    );

  const machs = sweep.machs;
  const machMin = machs[0] ?? 0.05;
  // Snapped at read time: 0.3 falls between samples, and a shrunk sweep can leave the raw pick past the end.
  const pick = machs[nearestSampleIndex(machs, Math.min(machPick, machMax))] ?? machPick;
  const tableMach = hoverM ?? pick;

  return (
    <div className="flex h-full flex-col rounded-xl bg-surface ring-1 ring-line/10" aria-busy={pending}>
      <AeroHeader
        sweep={sweep}
        pending={pending}
        pane={pane}
        setPane={setPane}
        machMax={machMax}
        setMachMax={setMachMax}
      />
      <AeroConditions
        rocket={rocket}
        pick={pick}
        aoaDeg={aoaDeg}
        setAoaDeg={setAoaDeg}
        thetaDeg={thetaDeg}
        setThetaDeg={setThetaDeg}
        rollRate={rollRate}
        setRollRate={setRollRate}
        altitudeM={altitudeM}
        setAltitudeM={setAltitudeM}
      />

      <div className="flex items-center gap-2 px-3 pb-2">
        <span className="shrink-0 text-[10px] text-ink-faint">{t('aero.atMach', { mach: fmtNum(pick, 2) })}</span>
        <input
          type="range"
          min={machs[0] ?? 0}
          max={machs[machs.length - 1] ?? 1}
          step={(machs[1] ?? 0.05) - (machs[0] ?? 0)}
          value={pick}
          onChange={(e) => setMachPick(parseFloat(e.target.value))}
          aria-label={t('aero.machPicker')}
          className="w-full accent-accent-500"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {pane === 'charts' && (
          <AeroChartsPane
            machs={machs}
            machMin={machMin}
            machMax={machMax}
            cdSeries={cdSeries}
            breakdown={breakdown}
            cpSeries={cpSeries}
            cpMode={cpMode}
            cpModes={cpModes}
            setCpMode={setCpMode}
            hoverM={hoverM}
            setHover={setHover}
          />
        )}
        {pane === 'components' && (
          <>
            <ComponentTable sweep={sweep} machs={machs} mach={tableMach} />
            <StabilityTable
              sweep={sweep}
              machs={machs}
              masses={masses}
              mach={tableMach}
              lengthUnit={u.sym('length')}
              lengthFactor={u.factor('length')}
              massUnit={u.sym('mass')}
              massFactor={u.factor('mass')}
              bodyLen={bodyLen}
              aeroLen={aeroLen}
            />
            <RollTable sweep={sweep} machs={machs} mach={tableMach} />
          </>
        )}
      </div>
    </div>
  );
}
