import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtDegrees, useUnits } from '../../prefs/useUnits';
import type { Wind } from '../../services/flight/flightWind';
import { windFace } from './flightDialFace';
/** A compass that turns with the camera, and the wind the tracked part is in, blowing the way the arrow points. */
export function FlightDial({ roseRef, wind }: { roseRef: RefObject<SVGGElement | null>; wind: Wind | null }) {
  const { t } = useTranslation();
  const u = useUnits();
  const { blowing, from, speed } = windFace(wind, u);
  const label = wind
    ? `${t('env.q.windSpeed')} ${speed}${blowing ? `, ${t('env.q.windDirection')} ${fmtDegrees(u, from)}` : ''}`
    : undefined;
  return (
    <div
      className="flex flex-col items-center rounded-lg bg-surface/80 px-1.5 py-1 text-[10px] tabular-nums text-ink-soft ring-1 ring-line/10"
      role="img"
      aria-label={label ?? t('flight.north')}
      title={label}
    >
      <svg viewBox="-32 -32 64 64" className="h-14 w-14" aria-hidden>
        <circle r={22} className="fill-none stroke-line/40" strokeWidth={1.2} />
        <g ref={roseRef}>
          {[0, 90, 180, 270].map((a) => (
            <path
              key={a}
              d="M0 -22V-18"
              transform={`rotate(${a})`}
              className={a === 0 ? 'stroke-danger-400' : 'stroke-ink-muted'}
              strokeWidth={1.6}
            />
          ))}
          <text y={-24} textAnchor="middle" fontSize={9} fontWeight={700} className="fill-ink-strong">
            {t('flight.north')}
          </text>
          {blowing && (
            <g transform={`rotate(${from + 180})`} data-flight-wind>
              <path
                d="M0 15V-13M-4.5 -7L0 -14L4.5 -7"
                className="fill-none stroke-accent-400"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}
        </g>
      </svg>
      {speed}
    </div>
  );
}
