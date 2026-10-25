import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtDegrees, fmtGroundDistance, groundDistanceNumber, useUnits } from '../../prefs/useUnits';
import { unitScope } from '../../prefs/units';
import { stageLabel } from '../../i18n/format';
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
import { useGroundLayer } from '../common/map/useTileVerdict';
import { buildTraces, type ChartFlight } from './FlightChart';
import { useElementResize } from '../common/useElementResize';
import { token } from '../common/colorTokens';
import { LandingRing, LinedTrack, SampleDots, ZoneEllipse } from '../common/map/PlanMarks';

/**
 * The flight from directly above: the path over the ground, the pad at the
 * center, where it came down - and the ground itself underneath.
 *
 * North is up and the scale is the same on both axes, because this is read as a
 * map of the field you are standing on - stretching one axis would bend a
 * straight drift into a curve and turn a circle of equal distance into an
 * ellipse. Range rings carry the measurement; without them a drift is a
 * squiggle rather than "180 m that way". They stay when imagery is on: the
 * imagery is the context and the rings are the number.
 *
 * It draws the same traces the flight charts do, so a staged flight shows each
 * stage's own descent - which is the case where this earns its place, since a
 * spent booster usually lands somewhere quite different from the sustainer.
 *
 * The imagery is the same tile machinery the launch-site map uses
 * (services/map/slippyMap.ts), at the coordinates the flight was actually flown
 * from: latitude and longitude are required simulation inputs that go to the
 * kernel (services/flight/requiredLaunch.ts, services/flight/simulations.ts), so there is
 * nothing to infer. Tiles are cached by the service worker, so a site looked at
 * at home still draws at the field; somewhere never viewed draws without them,
 * which is still a correct picture.
 */

export function GroundTrack({
  flight,
  latitudeDeg,
  longitudeDeg,
  launch,
}: {
  flight: ChartFlight;
  /** The site this flight was flown from. Null only if it was never filled in. */
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  /** The conditions it was flown under: what a wind sweep is built around. */
  launch: LaunchConditions;
}) {
  const { t } = useTranslation();
  const u = useUnits();
  const fitRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(420);
  const site = latitudeDeg != null && longitudeDeg != null ? { lat: latitudeDeg, lon: longitudeDeg } : null;
  const ground = useGroundLayer(site !== null);

  // The Downrange tile's unit scope, so the landing distance reads in the same
  // unit on the summary, here and in the hourly landings.
  const dist = u.at(unitScope('sim', 'downrange'), 'distance');

  const lines = useMemo<GroundTrackLine[]>(
    () =>
      buildTraces(flight, (i, name) => stageLabel(t, i, name)).map((tr) =>
        groundTrackLine(tr.key, tr.name, tr.color, tr.series),
      ),
    [flight, t],
  );
  const drawn = lines.filter((l) => l.points.length >= 2);

  // --- the drift sweep, when one has been flown for this flight ---------------
  const mine = useWorkspaceStore((s) => selectDriftSweepFor(s, flight.id));
  const [sweepOpen, setSweepOpen] = useState(false);

  const regions = useMemo<DriftRegion[]>(() => (mine ? sweepRegions(mine.landings) : []), [mine]);

  /**
   * The ellipse as a polygon, once per region, so the frame math and the drawing
   * share one set of points rather than each generating its own.
   */
  const ellipses = useMemo(
    () => new Map(regions.flatMap((r) => (r.ellipse ? [[r.branch, ellipsePolygon(r.ellipse)] as const] : []))),
    [regions],
  );

  /**
   * Everything the sweep drawing reaches, so the square is sized to hold it.
   *
   * The ellipse is in here as well as the landings: at two standard deviations
   * it can reach past the furthest sample, and a frame sized to the samples
   * alone would clip the region at exactly the edge a reader is looking at.
   */
  const sweepReach = useMemo<GroundPoint[]>(
    () => regions.flatMap((r) => [...r.samples, ...(ellipses.get(r.branch) ?? [])]),
    [regions, ellipses],
  );

  const extent = useMemo(() => trackExtent(lines, sweepReach), [lines, sweepReach]);

  /** The color of the stage a region belongs to, so region and track agree. */
  const regionColor = (branch: number) => lines[branch]?.color ?? lines[0]?.color ?? token('series-1');

  /**
   * Fit the square to the space left over by the legend, not to the whole pane.
   *
   * Sized to the outer host, the square plus the legend beneath it would be
   * taller than the pane that holds them, and the centered overflow would clip
   * at both ends: the N marker off the top, the distance and bearing cut in
   * half at the bottom. The inner box is what is actually available, so a
   * square that fits it cannot push anything out.
   */
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
              {/* The swept drift region, under everything else: it is the ground a
                landing could fall on, so the rings that measure it and the track
                that produced it both have to read over it rather than through
                it.

                Two shapes on purpose (see services/flight/driftEllipse.ts). The filled
                hull is the exact envelope of the conditions actually flown:
                nothing landed outside it. The dashed ellipse is the same
                landings as a center and two axes, which is the number you write
                on a flight card, and over a whole-compass sweep it correctly
                sits inside the ring of samples rather than around it. */}
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
                      // A one-heading sweep lands along a straight line out from
                      // the pad, so its hull is a segment. Drawn as one rather
                      // than as a polygon with no area to fill.
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
                    {/* The mean landing, as a cross rather than another dot, so
                      it cannot be misread as one more sample. */}
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
              {/* The sweep controls, opposite the layer buttons. Collapsed by
              default: a drift sweep is a few dozen flights, so it is something
              you go and ask for rather than something the view offers up. */}
              <div className="absolute right-1 top-1 flex max-h-[calc(100%-0.5rem)] flex-col items-end gap-1">
                <button
                  onClick={() => setSweepOpen((v) => !v)}
                  aria-expanded={sweepOpen}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium ring-1 ring-shade/40 ${
                    sweepOpen || mine ? 'bg-accent-600 text-on-accent' : 'bg-surface/80 text-ink-soft hover:bg-raised'
                  }`}
                >
                  {t('sweep.button')}
                  {/* A flown sweep fills the button even while it is closed, so
                      it carries a mark and words as well as the color. */}
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
              {/* Landing marker per track, drawn after every line so no track
                  crosses a ring. */}
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

      {/* Distance and bearing per track: the two numbers you actually act on.
          Named as a group of its own, because a stage's name and its drift are
          also the names in the simulations table behind this - a reader (or a
          spec) asking for "Stage 1" has to be able to say which one. */}
      <div
        role="group"
        aria-label={t('flight.groundTrackReadout')}
        className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 pb-1"
      >
        {drawn.map((l) => {
          // The stage's own region, when a sweep has been flown. The branch
          // index is the trace's position in `lines`, which is how
          // `buildTraces` keys them; `drawn` skips any track too short to draw,
          // so its own index can name another stage.
          const region = regions.find((r) => r.branch === lines.indexOf(l));
          return (
            <span key={l.key} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
              {/* The name in an element of its own rather than a bare text node,
                so it can be read (and matched) apart from the figures beside it. */}
              <span>{l.name}</span>
              <span className="tabular-nums text-ink-muted">
                {fmtDist(l.distance)} · {fmtDegrees(u, l.bearing)}
              </span>
              {/* The swept spread, when there is one: the walk to plan for is
                  the FURTHEST landing over the conditions asked about, not the
                  one that was typed. */}
              {region && (
                <span className="tabular-nums text-ink-faint">
                  (
                  {/* The unit is carried once, on the far end: "566-707 m" reads as a
                      band where "566 m-707 m" reads as two separate figures. */}
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
