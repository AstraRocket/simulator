import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectConfig, selectDesignName, type WorkspaceState } from '../../state/store';
import { primaryMotor } from '../../services/flight/flightConfigs';
import { useUnits } from '../../prefs/useUnits';
import { degToRad, radToDeg } from '../../prefs/units';
import { onSi } from '../../prefs/entryValue';
import { aeroTableCsv, CSV_MIME } from '../../services/exports/csvExport';
import { download, exportFilename } from '../../services/files/saveFile';
import type { ChartSeries, CpMode } from './aeroTables';
import { altitudeField } from './aeroTables';
import type { useAeroSweep } from './useAeroSweep';
import { ChartCard } from './AeroCharts';
import { Num, WorstButton } from './AeroInputs';
import { Segmented } from '../common/Segmented';
import type { AeroPane } from '../../state/tabs';
import { roundTo } from '../../services/app/numbers';
import { smallButton } from '../common/smallButton';

type Sweep = NonNullable<ReturnType<typeof useAeroSweep>['sweep']>;
type Setter<T> = (value: T) => void;

export function AeroHeader({
  sweep,
  pending,
  pane,
  setPane,
  machMax,
  setMachMax,
}: {
  sweep: Sweep;
  pending: boolean;
  pane: AeroPane;
  setPane: Setter<AeroPane>;
  machMax: number;
  setMachMax: Setter<number>;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const designName = useWorkspaceStore(selectDesignName);
  const motorName = useWorkspaceStore((s) => primaryMotor(s.tree, selectConfig(s))?.designation);
  return (
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
      {sweep.hasNozzle && motorName && (
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
  );
}

export function AeroConditions({
  rocket,
  pick,
  aoaDeg,
  setAoaDeg,
  thetaDeg,
  setThetaDeg,
  rollRate,
  setRollRate,
  altitudeM,
  setAltitudeM,
}: {
  rocket: WorkspaceState['rocket'];
  pick: number;
  aoaDeg: number;
  setAoaDeg: Setter<number>;
  thetaDeg: number;
  setThetaDeg: Setter<number>;
  rollRate: number;
  setRollRate: Setter<number>;
  altitudeM: number;
  setAltitudeM: Setter<number>;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const altField = altitudeField(u.factor('distance'));
  const angle = u.plain('angle');
  const roll = u.plain('rollRate');
  return (
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
  );
}

export function AeroChartsPane({
  machs,
  machMin,
  machMax,
  cdSeries,
  breakdown,
  cpSeries,
  cpMode,
  cpModes,
  setCpMode,
  hoverM,
  setHover,
}: {
  machs: number[];
  machMin: number;
  machMax: number;
  cdSeries: ChartSeries[];
  breakdown: ChartSeries[];
  cpSeries: ChartSeries[];
  cpMode: CpMode;
  cpModes: CpMode[];
  setCpMode: Setter<CpMode>;
  hoverM: number | null;
  setHover: (m: number | null | ((prev: number | null) => number | null)) => void;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  return (
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
  );
}
