import type { GroundPoint } from '../../../services/flight/groundTrack';
import { LINER } from './mapStyle';

/**
 * The marks both plan views draw (the landing estimate and the ground track),
 * so a drift, a landing and a spread look the same wherever they appear. Each
 * takes `mapOn` and lays a dark liner under itself over imagery, where a bare
 * colored line or dot is lost against fields and roads. Strokes do not scale
 * with the view's zoom.
 */

type Project = { X: (east: number) => number; Y: (north: number) => number };

/** A drift path: a colored line, lined over imagery. */
export function LinedTrack({ points, color, mapOn }: { points: string; color: string; mapOn: boolean }) {
  return (
    <>
      {mapOn && (
        <polyline points={points} fill="none" stroke={LINER} strokeWidth={3.75} vectorEffect="non-scaling-stroke" />
      )}
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
    </>
  );
}

/**
 * Where a flight lands: a ring, so it reads as a place rather than another
 * sample on the line. `r` differs by view on purpose: the ground track draws
 * one per stage, and smaller rings keep them apart.
 */
export function LandingRing({
  at,
  r,
  color,
  mapOn,
  X,
  Y,
}: Project & { at: GroundPoint; r: number; color: string; mapOn: boolean }) {
  const cx = X(at.east);
  const cy = Y(at.north);
  return (
    <>
      {mapOn && <circle cx={cx} cy={cy} r={r} fill="none" stroke={LINER} strokeWidth={4} />}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={2} />
    </>
  );
}

/**
 * Every dispersion or sweep landing. Small, because the point of them is the
 * density: where the dots crowd is where the rocket lands most often.
 */
export function SampleDots({
  samples,
  color,
  mapOn,
  X,
  Y,
}: Project & { samples: readonly GroundPoint[]; color: string; mapOn: boolean }) {
  return (
    <>
      {samples.map((p, i) => (
        <circle
          key={i}
          cx={X(p.east)}
          cy={Y(p.north)}
          r={1.6}
          fill={color}
          fillOpacity={0.8}
          stroke={mapOn ? LINER : 'none'}
          strokeWidth={mapOn ? 0.75 : 0}
        />
      ))}
    </>
  );
}

/** The two-sigma zone around the samples: dashed, with a faint fill so it reads as an area. */
export function ZoneEllipse({ points, color }: { points: string; color: string }) {
  return (
    <polygon
      points={points}
      fill={color}
      fillOpacity={0.12}
      stroke={color}
      strokeWidth={1.25}
      strokeDasharray="5 4"
      vectorEffect="non-scaling-stroke"
    />
  );
}
