import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectConfig, selectDesignName } from '../../state/store';
import { primaryMotor } from '../../services/flight/flightConfigs';
import { fmtNum } from '../../i18n/format';
import { useUnits } from '../../prefs/useUnits';
import { degToRad, radToDeg } from '../../prefs/units';
import { onSi } from '../../prefs/entryValue';
import { aeroTableCsv, CSV_MIME } from '../../services/exports/csvExport';
import { exportFilename } from '../../services/files/saveFile';
import { download } from '../../services/files/saveFile';
import type { ComponentMass } from '../../engine/openRocketEngine';
import type { ChartSeries, CpMode } from './aeroTables';
import { altitudeField, cpDivisor, cpModesFor, nearestSampleIndex } from './aeroTables';
import { useAeroSweep } from './useAeroSweep';
import { ChartCard } from './AeroCharts';
import { ComponentTable, RollTable, StabilityTable } from './AeroComponentTables';
import { Num, WorstButton } from './AeroInputs';
import { Segmented } from '../common/Segmented';
import { CATEGORICAL } from '../common/chartPalette';
import type { AeroPane } from '../../state/tabs';
import { roundTo } from '../../services/app/numbers';
import { smallButton } from '../common/smallButton';

const POWER_OFF = CATEGORICAL[0]!;
const POWER_ON = CATEGORICAL[7]!;

type Series = ChartSeries;

export function AeroAnalysis() {
  const { t } = useTranslation();
  const u = useUnits();
  const rocket = useWorkspaceStore((s) => s.rocket);
  const designName = useWorkspaceStore(selectDesignName);
  const info = useWorkspaceStore((s) => s.info);
  const motorName = useWorkspaceStore((s) => primaryMotor(s.tree, selectConfig(s))?.designation);
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

  const lengthFactor = u.factor('length');
  const bodyLen = info?.length ?? 0;
  const aeroLen = info?.lengthAerodynamic ?? 0;
  const cpModes = useMemo(() => cpModesFor(bodyLen, aeroLen), [bodyLen, aeroLen]);
  const cpMode = cpModes.includes(cpModeSel) ? cpModeSel : 'len';
  const cpDiv = cpDivisor(cpMode, bodyLen, aeroLen);
  // The cards memoize their paths on series identity, which a fresh array would defeat on every pointer move.
  const { cdSeries, breakdown, cpSeries } = useMemo((): {
    cdSeries: Series[];
    breakdown: Series[];
    cpSeries: Series[];
  } => {
    if (!sweep) return { cdSeries: [], breakdown: [], cpSeries: [] };
    const cd: Series[] = [{ name: t('aero.powerOff'), color: POWER_OFF, values: sweep.powerOff.total }];
    if (sweep.hasNozzle) cd.push({ name: t('aero.powerOn'), color: POWER_ON, values: sweep.powerOn.total });
    return {
      cdSeries: cd,
      breakdown: [
        { name: t('aero.friction'), color: CATEGORICAL[0]!, values: sweep.powerOff.friction },
        { name: t('aero.pressure'), color: CATEGORICAL[1]!, values: sweep.powerOff.pressure },
        { name: t('aero.base'), color: CATEGORICAL[2]!, values: sweep.powerOff.base },
      ],
      cpSeries: [
        {
          name: t('flight.cp'),
          color: POWER_OFF,
          values: cpDiv > 0 ? sweep.cp.map((v) => (v / cpDiv) * 100) : sweep.cp.map((v) => v * lengthFactor),
        },
      ],
    };
  }, [sweep, cpDiv, lengthFactor, t]);

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
  const altField = altitudeField(u.factor('distance'));
  const angle = u.plain('angle');
  const roll = u.plain('rollRate');

  return (
    <div className="flex h-full flex-col rounded-xl bg-surface ring-1 ring-line/10" aria-busy={pending}>
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-3">
        <h2 className="mr-auto text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t('aero.title')}
          {pending && <span className="ml-2 normal-case tracking-normal text-ink-faint">{t('aero.computing')}</span>}
        </h2>
        <Segmented
          options={['charts', 'components'] as const}
          value={pane}
          onChange={setPane}
          fmt={(v) => t(v === 'charts' ? 'aero.charts' : 'aero.perComponent')}
        />
        {sweep?.hasNozzle && motorName && (
          <span className="text-[10px] text-ink-faint" title={t('aero.powerOnMotorNote')}>
            {t('aero.powerOnMotor', { motor: motorName })}
          </span>
        )}
        <span className="text-[10px] text-ink-faint">{t('aero.maxMach')}</span>
        <Segmented options={[1, 2, 3, 5] as const} value={machMax} onChange={setMachMax} fmt={(v) => `M${v}`} />
        <button
          onClick={() =>
            download(exportFilename([designName, 'aero-table'], 'csv'), aeroTableCsv(sweep, u.all), CSV_MIME)
          }
          title={t('aero.exportCsv')}
          aria-label={t('aero.exportCsv')}
          className={smallButton('chip', 'ink')}
        >
          <span aria-hidden>⬇</span> CSV
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-2">
        {/* State stays in degrees and rad/s, what the sweep takes. */}
        <Num
          label={t('aero.aoa')}
          value={angle.toUi(degToRad(aoaDeg))}
          onChange={onSi(angle, (si) => si !== null && setAoaDeg(radToDeg(si)))}
          min={0}
          max={angle.toUi(degToRad(20))}
          step={angle.step(degToRad(0.5))}
          unit={angle.sym}
        />
        <div className="flex items-center gap-1.5">
          <Num
            label={t('aero.windDirection')}
            value={angle.toUi(degToRad(thetaDeg))}
            onChange={onSi(angle, (si) => si !== null && setThetaDeg(radToDeg(si)))}
            min={0}
            max={angle.toUi(2 * Math.PI)}
            step={angle.step(degToRad(5))}
            unit={angle.sym}
          />
          <WorstButton
            worst={rocket ? () => roundTo(rocket.worstThetaDeg(pick, aoaDeg), 1) : null}
            onWorst={setThetaDeg}
          />
        </div>
        <Num
          label={t('aero.rollRate')}
          value={roll.toUi(rollRate)}
          onChange={onSi(roll, (si) => si !== null && setRollRate(si))}
          min={0}
          max={roll.toUi(50)}
          step={roll.step(1)}
          unit={roll.sym}
        />
        <Num
          label={t('aero.altitude')}
          value={altField.toUi(altitudeM)}
          onChange={(v) => setAltitudeM(altField.toSi(v))}
          min={0}
          max={altField.max}
          step={altField.step}
          unit={u.sym('distance')}
        />
      </div>

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
          <>
            <ChartCard
              title={t('aero.cdVsMach')}
              machs={machs}
              machMin={machMin}
              machMax={machMax}
              series={cdSeries}
              unit="Cd"
              digits={3}
              hoverM={hoverM}
              setHoverM={setHover}
            />
            <ChartCard
              title={t('aero.breakdown')}
              machs={machs}
              machMin={machMin}
              machMax={machMax}
              series={breakdown}
              stacked
              unit="Cd"
              digits={3}
              hoverM={hoverM}
              setHoverM={setHover}
            />
            <ChartCard
              title={t('aero.cpVsMach')}
              machs={machs}
              machMin={machMin}
              machMax={machMax}
              series={cpSeries}
              unit={cpMode === 'len' ? u.sym('length') : '%'}
              digits={1}
              hoverM={hoverM}
              setHoverM={setHover}
              note={t('aero.supersonicNote')}
              right={
                <Segmented
                  options={cpModes}
                  value={cpMode}
                  onChange={setCpMode}
                  fmt={(v) => (v === 'len' ? u.sym('length') : v === 'body' ? t('aero.pctBody') : t('aero.pctLength'))}
                  disabled={cpModes.length < 2}
                />
              }
            />
          </>
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
