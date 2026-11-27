import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { selectActive, useWorkspaceStore } from '../../state/store';
import type { ResultFlight } from '../../services/flight/simulations';
import type { FlightResult, RocketTree } from '../../engine/openRocketEngine';
import type { Exhaust } from '../../services/motors/exhaust';
import type { MotorDims } from '../../tree/schematicGeometry';
import { padWindFromDeg } from '../../services/flight/bearing';
import { launcherKind } from '../../services/design/launcher';
import { LazyBoundary } from '../common/ErrorBoundary';
import { lazyNamed } from '../common/lazyNamed';
import { FlightPathExport } from './FlightPathExport';

const FlightPath3D = lazyNamed(() => import('./FlightPath3D'), 'FlightPath3D');
const PadPreview3D = lazyNamed(() => import('./PadPreview3D'), 'PadPreview3D');

/** The 3D flight path; before any run, the pad as the launch panel sets it. */
export function FlightPathPane({
  flight,
  pathResult,
  design,
  motors,
  exhausts,
  loading,
}: {
  flight: ResultFlight | null;
  pathResult: FlightResult | null;
  design: RocketTree;
  motors?: MotorDims;
  exhausts?: Readonly<Record<string, Exhaust>>;
  loading: ReactNode;
}) {
  const { t } = useTranslation();
  // The one being edited: the preview follows the launch panel.
  const activeLaunch = useWorkspaceStore((s) => selectActive(s).launch);
  // The simulation's choice, else what the design's lugs or buttons suggest.
  const designLauncher = launcherKind(design) ?? 'rod';
  if (!pathResult) {
    return (
      <>
        <LazyBoundary fallback={loading}>
          <PadPreview3D launch={activeLaunch} launcher={activeLaunch.launcher ?? designLauncher} />
        </LazyBoundary>
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
          <div className="rounded-lg bg-surface/80 px-3 py-1.5 text-sm text-ink-faint ring-1 ring-line/10">
            {t('sim.prompt')}
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <LazyBoundary fallback={loading}>
        <FlightPath3D
          result={pathResult}
          tree={design}
          motors={motors}
          exhausts={exhausts}
          rodLengthM={flight?.launch.launchRodLengthM}
          latitudeDeg={flight?.launch.latitudeDeg}
          longitudeDeg={flight?.launch.longitudeDeg}
          pad={{
            windFromDeg: flight ? padWindFromDeg(flight.launch) : null,
            launcher: flight?.launch.launcher ?? designLauncher,
          }}
        />
      </LazyBoundary>
      <div className="pointer-events-none absolute inset-x-0 top-5 z-10 flex justify-center">
        <div className="pointer-events-auto">
          <FlightPathExport variant="overlay" flight={flight} />
        </div>
      </div>
    </>
  );
}
