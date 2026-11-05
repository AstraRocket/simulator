import type { GroundPoint } from '../../../services/flight/groundTrack';
import { LINER } from './mapStyle';

type Project = { X: (east: number) => number; Y: (north: number) => number };

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
