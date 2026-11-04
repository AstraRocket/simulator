import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectConfig, selectMotorDims } from '../../state/store';
import type { ResultFlight } from '../../services/flight/simulations';
import type { FlightResult } from '../../engine/openRocketEngine';
import { TreeSchematic } from './TreeSchematic';
import { AftView } from './AftView';
import { FlightChart } from './FlightChart';
import { GroundTrack } from './GroundTrack';
import { EnvironmentView } from './EnvironmentView';
import { FlightCard } from '../sim/FlightCard';
import { FlightPathExport } from './FlightPathExport';
import { InfoOverlay } from './InfoOverlay';
import { AeroAnalysis } from './AeroAnalysis';
import { LazyBoundary, lazyNamed } from '../common/ErrorBoundary';
import { useExportData } from './useExportData';
import { useViewPrefs } from './useViewPrefs';
import { useBurnExhausts } from './useBurnExhausts';
import { degToRad, radToDeg } from '../../prefs/units';
import { useUnits } from '../../prefs/useUnits';
import { useSettings } from '../../state/SettingsProvider';
import { withFigureDefaults } from '../../services/design/figureStyle';
import { RULER_H } from '../../tree/schematicGeometry';

const Rocket3D = lazyNamed(() => import('./Rocket3D'), 'Rocket3D');
const FlightPath3D = lazyNamed(() => import('./FlightPath3D'), 'FlightPath3D');

const ROLL_GUTTER = 30;

export function CenterCanvas({
  flight,
  pathResult,
  ctrlSlot,
  presetSlot,
  flow = false,
}: {
  flight: ResultFlight | null;
  pathResult: FlightResult | null;
  ctrlSlot: HTMLDivElement | null;
  presetSlot: HTMLDivElement | null;
  flow?: boolean;
}) {
  const { t } = useTranslation();
  const view = useWorkspaceStore((s) => s.view);
  const twoD = useWorkspaceStore((s) => s.twoD);
  const roll = useWorkspaceStore((s) => s.roll);
  const onRollBy = useWorkspaceStore((s) => s.rollBy);
  const resetKey = useWorkspaceStore((s) => s.resetKey);
  const design = useWorkspaceStore((s) => s.tree);
  const { settings } = useSettings();
  // The flight path draws `design`: figure styles do not reach it.
  const tree = useMemo(() => withFigureDefaults(design, settings.figureStyles), [design, settings.figureStyles]);
  const info = useWorkspaceStore((s) => s.info);
  const selectedId = useWorkspaceStore((s) => s.selectedId);
  const onSelect = useWorkspaceStore((s) => s.setSelectedId);
  const setErr = useWorkspaceStore((s) => s.setErr);
  const config = useWorkspaceStore(selectConfig);
  const motors = useMemo(() => selectMotorDims(design, config), [design, config]);
  const exhausts = useBurnExhausts(design, config, view === 'path');
  const exportData = useExportData(motors);
  const { showMarkers, showInfoCard, rulers } = useViewPrefs();
  const loading = <div className="grid h-full place-items-center text-sm text-ink-faint">{t('view.loading3d')}</div>;
  const prompt = <div className="grid h-full place-items-center text-sm text-ink-faint">{t('sim.prompt')}</div>;

  return (
    <div className="relative min-h-0 w-full flex-1 overflow-hidden px-3 pb-2 pt-2">
      {view === '2d' && <RollSlider />}
      {(view === '2d' || view === '3d') && showInfoCard && (
        <div
          className="absolute z-20"
          style={
            view === '2d'
              ? { left: (rulers.left ? 60 : 44) + ROLL_GUTTER, top: 12 + (rulers.top ? RULER_H : 0) }
              : { left: 12, top: 12 }
          }
        >
          <InfoOverlay info={info} />
        </div>
      )}
      {view === '2d' ? (
        <div className="h-full" style={{ paddingLeft: ROLL_GUTTER }}>
          {twoD === 'side' ? (
            <TreeSchematic
              key={`side-${resetKey}`}
              tree={tree}
              info={info}
              motors={motors}
              fillHeight
              roll={roll}
              onRoll={onRollBy}
              selectedId={selectedId}
              onSelect={onSelect}
              controlsSlot={ctrlSlot}
              showMarkers={showMarkers}
              rulers={rulers}
              exportData={exportData}
              onError={setErr}
            />
          ) : (
            <AftView key={`aft-${resetKey}`} tree={tree} roll={roll} motors={motors} onRoll={onRollBy} />
          )}
        </div>
      ) : view === '3d' ? (
        <LazyBoundary fallback={loading}>
          <Rocket3D
            tree={tree}
            info={info}
            motors={motors}
            selectedId={selectedId}
            onSelect={onSelect}
            showMarkers={showMarkers}
            exportData={exportData}
            onError={setErr}
            ctrlSlot={ctrlSlot}
            presetSlot={presetSlot}
          />
        </LazyBoundary>
      ) : view === 'flight' ? (
        // Keyed on the simulation, not reset in an effect: effect-based resets blank the first frame.
        <div className="h-full p-2">
          {flight ? <FlightChart key={flight.id} flight={flight} flow={flow} /> : prompt}
        </div>
      ) : view === 'path' ? (
        <div className="relative h-full p-2">
          {pathResult ? (
            <>
              <LazyBoundary fallback={loading}>
                <FlightPath3D
                  result={pathResult}
                  tree={design}
                  motors={motors}
                  exhausts={exhausts}
                  latitudeDeg={flight?.launch.latitudeDeg}
                  longitudeDeg={flight?.launch.longitudeDeg}
                />
              </LazyBoundary>
              <div className="pointer-events-none absolute inset-x-0 top-5 z-10 flex justify-center">
                <div className="pointer-events-auto">
                  <FlightPathExport variant="overlay" flight={flight} />
                </div>
              </div>
            </>
          ) : (
            prompt
          )}
        </div>
      ) : view === 'ground' ? (
        <div className="h-full p-2">
          {flight ? (
            // The flight's own launch site: the picker may show a row other than the active one.
            <GroundTrack
              flight={flight}
              latitudeDeg={flight.launch.latitudeDeg}
              longitudeDeg={flight.launch.longitudeDeg}
              launch={flight.launch}
            />
          ) : (
            prompt
          )}
        </div>
      ) : view === 'environment' ? (
        <div className="h-full">{flight ? <EnvironmentView flight={flight} /> : prompt}</div>
      ) : view === 'card' ? (
        <div className="h-full">{flight ? <FlightCard flight={flight} /> : prompt}</div>
      ) : (
        <div className="h-full p-2">{info ? <AeroAnalysis /> : prompt}</div>
      )}
    </div>
  );
}

function RollSlider() {
  const { t } = useTranslation();
  const roll = useWorkspaceStore((s) => s.roll);
  const onRollValue = useWorkspaceStore((s) => s.setRoll);
  const u = useUnits();
  // The slider runs in degrees whatever the user's angle unit.
  const deg = Math.round(radToDeg(roll));
  // A radian needs two decimals to move with a 5° step.
  const digits = u.sym('angle') === '°' ? 0 : 2;
  const shown = u.fmtSym('angle', degToRad(deg), digits);
  return (
    <div
      className="absolute inset-y-2 left-1 z-10 flex w-8 flex-col items-center text-[11px] font-semibold leading-none text-ink-soft"
      title={t('view.rollHint')}
    >
      <span className="pb-1">{u.fmtSym('angle', 0, digits)}</span>
      <input
        type="range"
        min={0}
        max={360}
        step={5}
        value={deg}
        onChange={(e) => onRollValue(degToRad(parseFloat(e.target.value)))}
        title={t('view.roll', { deg: shown })}
        aria-label={t('view.rollAria')}
        aria-valuetext={shown}
        className="accent-accent-500"
        style={{ writingMode: 'vertical-lr', width: '100%', flex: '1 1 0%', minHeight: 0 }}
      />
      <span className="pt-1">{u.fmtSym('angle', 2 * Math.PI, digits)}</span>
      <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-raised/95 px-0.5 py-0.5 text-[9px] text-accent-300 ring-1 ring-line/10">
        {shown}
      </span>
    </div>
  );
}
