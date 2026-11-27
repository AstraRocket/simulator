import type { LaunchConditions } from '../../services/design/orkTree';
import { fmtDegrees, type Units } from '../../prefs/useUnits';
import { CALM_MS, leanAgainstWind, rodLean } from '../../services/flight/bearing';
import { surfaceWind, usableWindLevels, windFrom } from '../../services/flight/windLevels';
import type { LaunchSectionProps } from './launchSection';

// Below this a lean reads as none.
const LEVEL_DEG = 0.05;

const RIM = 36;
// The rod stops short of where the wind arrow starts, so the two never overlap.
const ROD_TOP = 18;
const WIND_TIP = -22;
const ROD = 56;
const GROUND = 34;

// Shape as well as color tells them apart: the wind is an arrow, the rod a line with a ball on its tip.
const WIND_CLASS = 'fill-none stroke-accent-400';
const ROD_CLASS = 'fill-none stroke-warn-300';
const BALL_CLASS = 'fill-warn-300';

/**
 * From above: directions only, at fixed lengths. From the side: the wind always from the left, and the rod at the
 * typed angle, tipped toward the wind when it leans within 90° of upwind and away from it otherwise.
 */
export function CompassFigure({
  launch,
  t,
  u,
  declination,
}: {
  launch: LaunchConditions;
  t: LaunchSectionProps['t'];
  u: Units;
  /** Drawn as a magnetic north tick when the panel reads magnetic. */
  declination: number | null;
}) {
  const points = t('launch.compassPoints').split(' ');
  const lean = rodLean(launch);
  const wind = surfaceWind(launch);
  const calm = wind.speedMs < CALM_MS;
  const levels = usableWindLevels(launch.windLevels ?? []).map((l) => windFrom(l.speed, l.directionDeg));
  const split = calm ? null : leanAgainstWind(lean, wind.headingDeg);
  const vertical = lean.angleDeg < LEVEL_DEG;
  // With no wind there is nothing to lean toward or away from: the rod tips left.
  const away = !calm && Math.cos(((lean.headingDeg - wind.headingDeg) * Math.PI) / 180) < 0;
  const tipX = (away ? 1 : -1) * ROD * Math.sin((lean.angleDeg * Math.PI) / 180);
  const tipY = GROUND - ROD * Math.cos((lean.angleDeg * Math.PI) / 180);
  // A tenth only where it says something: 5° stays 5°, not 5.0°.
  const deg = (v: number) => fmtDegrees(u, Math.abs(v), Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1);

  const caption = (() => {
    if (!split) {
      const tilt =
        lean.angleDeg < LEVEL_DEG ? t('launch.figVertical') : t('launch.figLeans', { angle: deg(lean.angleDeg) });
      return `${t('launch.figNoWind')} ${tilt}`;
    }
    const along =
      Math.abs(split.intoDeg) < LEVEL_DEG
        ? t('launch.figUpright')
        : t(split.intoDeg > 0 ? 'launch.figInto' : 'launch.figWith', { angle: deg(split.intoDeg) });
    return Math.abs(split.acrossDeg) < LEVEL_DEG
      ? along
      : `${along} ${t('launch.figAcross', { angle: deg(split.acrossDeg) })}`;
  })();

  return (
    <figure className="space-y-1">
      <div className="flex justify-around">
        <svg viewBox="-50 -50 100 100" className="h-28 w-28" role="img" aria-label={t('launch.figTop')}>
          <circle r={RIM} className="fill-none stroke-line/40" strokeWidth={1} />
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d={`M0 ${-RIM}V${i % 3 ? -RIM + 3 : -RIM + 5}`}
              transform={`rotate(${i * 30})`}
              className={i === 0 ? 'stroke-danger-400' : 'stroke-ink-muted'}
              strokeWidth={i % 3 ? 0.8 : 1.4}
            />
          ))}
          {[0, 4, 8, 12].map((p) => {
            const a = (p * 22.5 * Math.PI) / 180;
            return (
              <text
                key={p}
                x={Math.sin(a) * (RIM + 8)}
                y={-Math.cos(a) * (RIM + 8) + 3}
                textAnchor="middle"
                fontSize={8}
                fontWeight={p === 0 ? 700 : 400}
                className="fill-ink-muted"
              >
                {points[p]}
              </text>
            );
          })}
          {declination !== null && (
            <g transform={`rotate(${declination})`} data-magnetic-north>
              <path
                d={`M0 ${-RIM + 1}V${-RIM + 9}`}
                className="stroke-danger-400"
                strokeWidth={1}
                strokeDasharray="2 1.5"
              />
              <text y={-RIM + 16} textAnchor="middle" fontSize={6} className="fill-danger-400">
                {t('launch.magneticNorthShort')}
              </text>
            </g>
          )}
          {levels.map((l, i) => (
            <path
              key={i}
              d={`M0 ${-RIM}V${-RIM + 10}`}
              transform={`rotate(${l.directionDeg})`}
              className="stroke-accent-400/40"
              strokeWidth={1}
            />
          ))}
          {!calm && (
            <g transform={`rotate(${wind.headingDeg})`} data-pad-wind>
              <Arrow d={`M0 ${-RIM - 2}V${WIND_TIP}M-4 ${WIND_TIP - 5}L0 ${WIND_TIP}L4 ${WIND_TIP - 5}`} />
            </g>
          )}
          {vertical ? (
            // Straight up, the rod is seen end on: only its ball shows.
            <circle r={3} className={BALL_CLASS} />
          ) : (
            <g transform={`rotate(${lean.headingDeg})`} data-rod-lean>
              <Rod x={0} y={-ROD_TOP} from={[0, 0]} />
            </g>
          )}
        </svg>

        <svg viewBox="-50 -50 100 100" className="h-28 w-28" role="img" aria-label={t('launch.figSide')}>
          <path d={`M-44 ${GROUND}H44`} className="stroke-ok-400" strokeWidth={2} />
          {!calm && <Arrow d="M-46 -6H-24M-29 -11L-24 -6L-29 -1" data-side-wind />}
          <Rod x={tipX} y={tipY} from={[0, GROUND]} data-side-rod />
          <path d={`M-6 ${GROUND}H6`} className="stroke-ink-muted" strokeWidth={3} />
        </svg>
      </div>
      <div className="flex justify-center gap-4 text-[11px] text-ink-soft" aria-hidden>
        <span className="flex items-center gap-1">
          <svg viewBox="-2 -6 20 12" className="h-3 w-5">
            <Arrow d="M0 0H14M10 -4L14 0L10 4" />
          </svg>
          {t('launch.figLegendWind')}
        </span>
        <span className="flex items-center gap-1">
          <svg viewBox="-2 -6 20 12" className="h-3 w-5">
            <Rod x={14} y={0} from={[0, 0]} />
          </svg>
          {t('launch.figLegendRod')}
        </span>
      </div>
      <figcaption className="text-center text-[11px] leading-snug text-ink-soft">{caption}</figcaption>
    </figure>
  );
}

function Arrow({ d, ...data }: { d: string; 'data-side-wind'?: boolean }) {
  return <path d={d} className={WIND_CLASS} strokeLinecap="round" strokeWidth={2.2} strokeLinejoin="round" {...data} />;
}

function Rod({ x, y, from, ...data }: { x: number; y: number; from: [number, number]; 'data-side-rod'?: boolean }) {
  return (
    <>
      <path
        d={`M${from[0]} ${from[1]}L${x} ${y}`}
        className={ROD_CLASS}
        strokeLinecap="round"
        strokeWidth={2.4}
        {...data}
      />
      <circle cx={x} cy={y} r={2.5} className={BALL_CLASS} />
    </>
  );
}
