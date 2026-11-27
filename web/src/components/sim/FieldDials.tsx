const DEG = Math.PI / 180;
const DIAL = 'h-10 w-10';

/**
 * The launcher's tilt from vertical, on a half dial: vertical at the top, the rod or rail a line with a ball, as the
 * compass card draws it. A negative angle leans it the other way.
 */
export function TiltDial({ deg }: { deg: number | null }) {
  const a = (deg ?? 0) * DEG;
  const r = 15;
  return (
    <svg viewBox="-20 -18 40 26" className={DIAL} data-dial="tilt">
      <path d={`M${-r} 6A${r} ${r} 0 0 1 ${r} 6Z`} className="fill-raised stroke-line/40" strokeWidth={1} />
      <path d={`M0 ${6 - r}V${6 - r + 3}`} className="stroke-ink-muted" strokeWidth={1.2} />
      <path
        d={`M0 6L${Math.sin(a) * (r - 3)} ${6 - Math.cos(a) * (r - 3)}`}
        className="stroke-warn-300"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <circle cx={Math.sin(a) * (r - 3)} cy={6 - Math.cos(a) * (r - 3)} r={2} className="fill-warn-300" />
      <circle cy={6} r={1.6} className="fill-ink-muted" />
    </svg>
  );
}

/**
 * A bearing on a small compass, N at the top. `rod`: the rod or rail leaning toward it, a line with a ball from the
 * middle. `wind`: an arrow from that side of the rim in toward the middle, as the compass card draws the wind.
 */
export function BearingDial({ deg, kind, points }: { deg: number | null; kind: 'rod' | 'wind'; points: string[] }) {
  const r = 14;
  return (
    <svg viewBox="-24 -24 48 48" className={DIAL} data-dial={kind}>
      <circle r={r} className="fill-raised stroke-line/40" strokeWidth={1} />
      {[0, 4, 8, 12].map((p) => {
        const a = p * 22.5 * DEG;
        return (
          <text
            key={p}
            x={Math.sin(a) * (r + 6)}
            y={-Math.cos(a) * (r + 6) + 2.6}
            textAnchor="middle"
            fontSize={7.5}
            fontWeight={p === 0 ? 700 : 500}
            className={p === 0 ? 'fill-danger-400' : 'fill-ink-muted'}
          >
            {points[p]}
          </text>
        );
      })}
      {deg !== null && (
        <g transform={`rotate(${deg})`}>
          {kind === 'rod' ? (
            <>
              <path d={`M0 0V${-r + 3}`} className="stroke-warn-300" strokeWidth={1.8} strokeLinecap="round" />
              <circle cy={-r + 3} r={2} className="fill-warn-300" />
            </>
          ) : (
            <path
              d={`M0 ${-r + 1}V-3M-3 -6L0 -3L3 -6`}
              className="fill-none stroke-accent-400"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
      )}
      <circle r={1.4} className="fill-ink-muted" />
    </svg>
  );
}
