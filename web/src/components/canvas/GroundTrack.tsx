import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtDegrees, fmtGroundDistance, groundDistanceNumber, useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import {
  groundTrackLine,
  trackExtent,
  type GroundPoint,
  type GroundTrackLine,
} from '../../services/flight/groundTrack';
import { ellipsePolygon, type DriftRegion, sweepRegions } from '../../services/flight/driftEllipse';
import { useWorkspaceStore, selectDriftSweepFor } from '../../state/store';
import type { LaunchConditions } from '../../services/design/orkTree';
import { DriftSweepPanel } from './DriftSweepPanel';
import { PlanView } from '../common/map/PlanView';
import { mapButtonClass } from '../common/map/mapButton';
import { useSiteGround } from '../common/map/useTileVerdict';
import type { ChartFlight } from './flightChartTraces';
import { useStageTraces } from './useChartSeries';
import { useElementResize } from '../common/useElementResize';
import { token } from '../common/colorTokens';
import { LandingRing, LinedTrack, SampleDots, ZoneEllipse } from '../common/map/PlanMarks';

export function GroundTrack({
  flight,
  latitudeDeg,
  longitudeDeg,
  launch,
}: {
  flight: ChartFlight;
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  launch: LaunchConditions;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const fitRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(420);
  const { site, ground } = useSiteGround(latitudeDeg, longitudeDeg);

  // The Downrange tile's unit scope, so the summary, this and the hourly landings agree.
  const dist = u.at(unitScope('sim', 'downrange'), 'distance');

  const traces = useStageTraces(flight);
  const lines = useMemo<GroundTrackLine[]>(
    () => traces.map((tr) => groundTrackLine(tr.key, tr.name, tr.color, tr.series)),
    [traces],
  );
  const drawn = lines.filter((l) => l.points.length >= 2);

  const mine = useWorkspaceStore((s) => selectDriftSweepFor(s, flight.id));
  const [sweepOpen, setSweepOpen] = useState(false);

  const regions = useMemo<DriftRegion[]>(() => (mine ? sweepRegions(mine.landings) : []), [mine]);

  const ellipses = useMemo(
    () => new Map(regions.flatMap((r) => (r.ellipse ? [[r.branch, ellipsePolygon(r.ellipse)] as const] : []))),
    [regions],
  );

  // Includes the ellipse: at two sigma it can reach past the furthest sample.
  const sweepReach = useMemo<GroundPoint[]>(
    () => regions.flatMap((r) => [...r.samples, ...(ellipses.get(r.branch) ?? [])]),
    [regions, ellipses],
  );

  const extent = useMemo(() => trackExtent(lines, sweepReach), [lines, sweepReach]);

  const regionColor = (branch: number) => lines[branch]?.color ?? lines[0]?.color ?? token('series-1');

  // Fit to the space the legend leaves, not the whole pane, or both ends clip.
  useElementResize(fitRef, (r) => setSize(Math.max(200, Math.min(r.width, r.height))));

  const distNum = (m: number) => groundDistanceNumber(dist, m);
  const fmtDist = (m: number) => fmtGroundDistance(dist, m);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden">
      <div ref={fitRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
        <PlanView
          size={size}
          extent={extent}
          site={site}
          ground={ground}
          fmtDist={fmtDist}
          ariaLabel={t('flight.groundTrackLabel')}
          under={({ X, Y, poly, mapOn }) => (
            <>
              {/* Hull and ellipse both on purpose: over a whole-compass sweep the ellipse sits inside the samples. */}
              {regions.map((r) => {
                const color = regionColor(r.branch);
                const ell = ellipses.get(r.branch);
                return (
                  <g key={`sweep-${r.branch}`}>
                    {r.hull.length >= 3 ? (
                      <polygon
                        points={poly(r.hull)}
                        fill={color}
                        fillOpacity={0.14}
                        stroke={color}
                        strokeOpacity={0.45}
                      />
                    ) : (
                      r.hull.length === 2 && (
                        <polyline
                          points={poly(r.hull)}
                          fill="none"
                          stroke={color}
                          strokeOpacity={0.45}
                          strokeWidth={2}
                        />
                      )
                    )}
                    {ell && <ZoneEllipse points={poly(ell)} color={color} />}
                    <SampleDots samples={r.samples} color={color} mapOn={mapOn} X={X} Y={Y} />
                    <g stroke={color} strokeWidth={1.5} strokeOpacity={0.9}>
                      <line
                        x1={X(r.centroid.east) - 5}
                        y1={Y(r.centroid.north)}
                        x2={X(r.centroid.east) + 5}
                        y2={Y(r.centroid.north)}
                      />
                      <line
                        x1={X(r.centroid.east)}
                        y1={Y(r.centroid.north) - 5}
                        x2={X(r.centroid.east)}
                        y2={Y(r.centroid.north) + 5}
                      />
                    </g>
                  </g>
                );
              })}
            </>
          )}
          overlay={
            <>
              <div className="absolute right-1 top-1 flex max-h-[calc(100%-0.5rem)] flex-col items-end gap-1">
                <button
                  onClick={() => setSweepOpen((v) => !v)}
                  aria-expanded={sweepOpen}
                  className={`rounded-md ring-1 ring-shade/40 ${mapButtonClass(sweepOpen || !!mine)}`}
                >
                  {t('sweep.button')}
                  {mine && (
                    <>
                      {' '}
                      <span aria-hidden>●</span>
                      <span className="sr-only">{`(${t('sweep.flown')})`}</span>
                    </>
                  )}
                </button>
                {sweepOpen && <DriftSweepPanel simId={flight.id} launch={launch} />}
              </div>
            </>
          }
        >
          {({ X, Y, poly, mapOn }) => (
            <>
              {drawn.map((l) => (
                <g key={l.key}>
                  <LinedTrack points={poly(l.points)} color={l.color} mapOn={mapOn} />
                </g>
              ))}
              {drawn.map((l) =>
                l.landing ? (
                  <g key={`${l.key}-end`}>
                    <LandingRing at={l.landing} r={4} color={l.color} mapOn={mapOn} X={X} Y={Y} />
                  </g>
                ) : null,
              )}
            </>
          )}
        </PlanView>
      </div>

      <div
        role="group"
        aria-label={t('flight.groundTrackReadout')}
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 pb-1"
      >
        {drawn.map((l) => {
          // Index into `lines`, not `drawn`: `drawn` skips short tracks.
          const region = regions.find((r) => r.branch === lines.indexOf(l));
          return (
            <span key={l.key} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
              <span>{l.name}</span>
              <span className="tabular-nums text-ink-muted">
                {fmtDist(l.distance)} · {fmtDegrees(u, l.bearing)}
              </span>
              {region && (
                <span className="tabular-nums text-ink-faint">
                  ({/* Unit once, on the far end: "566-707 m" reads as a band. */}
                  {t('sweep.spread', { from: distNum(region.minRangeM), to: fmtDist(region.maxRangeM) })})
                </span>
              )}
            </span>
          );
        })}
        {!drawn.length && <span className="text-[11px] text-ink-faint">{t('flight.groundTrackEmpty')}</span>}
      </div>
    </div>
  );
}
