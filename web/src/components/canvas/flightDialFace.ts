import type { useUnits } from '../../prefs/useUnits';
import { radToDeg } from '../../prefs/units';
import { finiteOr } from '../../services/app/numbers';
import { norm360 } from '../../services/flight/groundTrack';
import { CALM_MS, type Wind } from '../../services/flight/flightWind';
import type { DialFace } from '../../services/exports/flightVideo';

type Units = ReturnType<typeof useUnits>;

export const windFace = (wind: Wind | null, u: Units) => ({
  blowing: wind != null && wind.speed >= CALM_MS,
  from: wind ? norm360(radToDeg(wind.from)) : 0,
  speed: wind ? u.plain('windspeed').fmtSym(wind.speed) : '',
});

/** The dial as a recorded frame draws it: `rose` is the live SVG group the frame loop turns. */
export function dialFace(wind: Wind | null, rose: SVGGElement | null, u: Units, north: string): DialFace {
  const { blowing, from, speed } = windFace(wind, u);
  const turn = /rotate\(([^)\s]+)/.exec(rose?.getAttribute('transform') ?? '');
  return { roseDeg: finiteOr(turn ? Number(turn[1]) : NaN, 0), windToDeg: blowing ? from + 180 : null, speed, north };
}
