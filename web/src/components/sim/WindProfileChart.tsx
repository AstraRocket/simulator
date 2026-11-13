import type { WindLevel } from '../../services/design/orkTree';
import type { Units } from '../../prefs/useUnits';
import { fmtNum, shortDigits } from '../../i18n/format';
import { polylinePath } from '../common/svgPath';
import { LAxes } from '../common/chartAxes';

export function ProfileChart({ levels, u, showVectors }: { levels: WindLevel[]; u: Units; showVectors: boolean }) {
  const W = 260;
  const H = 240;
  const padL = 44;
  const padR = 16;
  const padT = 12;
  const padB = 36;

  const speeds = levels.map((l) => u.toUi('windspeed', l.speed));
  const alts = levels.map((l) => u.toUi('distance', l.altitudeM));
  // Pad a flat profile's zero span, which would divide by zero.
  const sMax = Math.max(...speeds, 0);
  const aMin = Math.min(...alts, 0);
  const aMax = Math.max(...alts, 0);
  const sHi = sMax > 0 ? sMax * 1.2 : 1;
  const aSpan = aMax - aMin;
  const aHi = aSpan > 0 ? aMax + aSpan * 0.1 : aMin + 1;

  const X = (s: number) => padL + (s / sHi) * (W - padL - padR);
  const Y = (a: number) => H - padB - ((a - aMin) / (aHi - aMin)) * (H - padT - padB);

  const pts = levels
    .map((l, i) => ({ x: X(speeds[i]!), y: Y(alts[i]!), dir: l.directionDeg }))
    .sort((a, b) => b.y - a.y);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden="true">
      <LAxes
        frame={{ width: W, height: H, padL, padR, padT, padB }}
        xLo="0"
        xHi={fmtNum(sHi, shortDigits(sHi))}
        xSym={u.sym('windspeed')}
        yLo={fmtNum(aMin, shortDigits(aMin))}
        yHi={fmtNum(aHi, shortDigits(aHi))}
        ySym={u.sym('distance')}
      />
      {pts.length > 1 && (
        <path
          d={polylinePath(pts.map((p) => [p.x, p.y]))}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-accent-500"
        />
      )}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} className="fill-accent-400" />
          {showVectors && (
            // Screen-space: 0 degrees points up the page.
            <g transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.dir})`}>
              <line x1={0} y1={0} x2={0} y2={-14} stroke="currentColor" strokeWidth={1} className="text-accent-300" />
              <path d="M -2.5 -10 L 0 -15 L 2.5 -10 Z" className="fill-accent-300" />
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}
