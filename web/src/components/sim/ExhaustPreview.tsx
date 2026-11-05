import { useId } from 'react';
import type { Exhaust } from '../../services/motors/exhaust';

/** x, y, radius, and the fraction of the look's smoke each keeps. */
const PUFFS: readonly [number, number, number, number][] = [
  [84, 24, 7, 0.9],
  [94, 23, 8, 0.85],
  [104, 25, 9, 0.8],
  [115, 23.5, 10, 0.72],
  [127, 25, 11, 0.64],
  [140, 23, 12, 0.56],
  [154, 25, 13, 0.48],
  [169, 23.5, 14, 0.4],
  [185, 24.5, 15, 0.32],
];

const SPARKS = 36;

export function ExhaustPreview({ look, className }: { look: Exhaust; className?: string }) {
  const id = useId().replace(/:/g, '');
  const [c0, c1, c2] = look.flame;
  return (
    <svg
      viewBox="0 0 200 48"
      aria-hidden
      className={`exhaust-preview block rounded-md bg-canvas ring-1 ring-line/10 ${className ?? ''}`}
    >
      <defs>
        <linearGradient id={`${id}-flame`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={c0} />
          <stop offset="0.45" stopColor={c1} />
          <stop offset="1" stopColor={c2} stopOpacity="0.15" />
        </linearGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" stopColor={c1} stopOpacity="0.55" />
          <stop offset="1" stopColor={c2} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-puff`}>
          <stop offset="0" stopColor={look.smokeColor} stopOpacity="1" />
          <stop offset="0.55" stopColor={look.smokeColor} stopOpacity="0.6" />
          <stop offset="1" stopColor={look.smokeColor} stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="exhaust-smoke">
        {PUFFS.map(([x, y, r, keep]) => (
          <circle key={x} cx={x} cy={y} r={r} fill={`url(#${id}-puff)`} opacity={look.smoke * keep} />
        ))}
      </g>
      <ellipse cx={58} cy={24} rx={30} ry={13} fill={`url(#${id}-glow)`} />
      <path className="exhaust-flame" d="M36 20 L36 28 Q60 34 86 24 Q60 14 36 20 Z" fill={`url(#${id}-flame)`} />
      {look.sparks && (
        <g>
          {Array.from({ length: SPARKS }, (_, i) => {
            const far = 0.4 + ((i * 0.7548777) % 1) * 0.6;
            const wide = ((i * 0.5698403) % 1) * 2 - 1;
            return (
              <circle
                key={i}
                className="exhaust-spark"
                cx={38}
                cy={24 + wide * 2}
                r={i % 3 === 0 ? 1.4 : 0.9}
                fill={i % 2 === 0 ? c0 : c1}
                style={{
                  animationDuration: `${0.6 + far * 0.7}s`,
                  animationDelay: `${-((i * 0.161) % 1.3)}s`,
                  ['--dx' as string]: `${Math.round(far * 150)}px`,
                  ['--dy' as string]: `${Math.round(wide * 16)}px`,
                }}
              />
            );
          })}
        </g>
      )}
      <rect x={0} y={16} width={30} height={16} rx={2} className="fill-ink-faint" />
      <path d="M30 18 L37 15 L37 33 L30 30 Z" className="fill-ink-muted" />
      <style>
        {`.exhaust-preview .exhaust-flame{transform-origin:36px 24px;animation:exhaust-flicker .18s ease-in-out infinite alternate}
.exhaust-preview .exhaust-smoke{animation:exhaust-drift 2.4s ease-in-out infinite alternate}
.exhaust-preview .exhaust-spark{animation:exhaust-spark 1s ease-out infinite}
@keyframes exhaust-flicker{from{transform:scaleX(.9) scaleY(1.05)}to{transform:scaleX(1.08) scaleY(.94)}}
@keyframes exhaust-drift{from{transform:translateX(0)}to{transform:translateX(4px)}}
@keyframes exhaust-spark{0%{transform:translate(0,0);opacity:1}60%{transform:translate(calc(var(--dx)*.75),var(--dy));opacity:.85}100%{transform:translate(var(--dx),calc(var(--dy) + 7px));opacity:0}}
@media (prefers-reduced-motion:reduce){.exhaust-preview *{animation:none!important}}`}
      </style>
    </svg>
  );
}
