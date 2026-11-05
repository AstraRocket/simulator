import { useTranslation } from 'react-i18next';

// Each native range input is transparent with only its thumb clickable, so the two overlap.
const THUMB =
  'pointer-events-none absolute inset-x-0 top-0 m-0 h-5 w-full cursor-pointer appearance-none bg-transparent focus:outline-none' +
  ' [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-400 [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-surface' +
  ' [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent-400';

export function RangeSlider({
  count,
  low,
  high,
  onChange,
  label,
  stops,
}: {
  count: number;
  low: number;
  high: number;
  onChange: (lo: number, hi: number) => void;
  label: string;
  stops?: string[];
}) {
  const { t } = useTranslation();
  const pct = (i: number) => (i / (count - 1)) * 100;
  return (
    <div className="relative h-5 min-w-[120px] flex-1">
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-elevated" />
      <div
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent-500"
        style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
      />
      {stops?.map((stop, i) => (
        <span
          key={i}
          aria-hidden
          title={stop}
          className={`absolute bottom-0 h-1.5 w-px -translate-x-1/2 ${
            i >= low && i <= high ? 'bg-accent-400/80' : 'bg-prominent'
          }`}
          style={{ left: `${pct(i)}%` }}
        />
      ))}
      <input
        type="range"
        min={0}
        max={count - 1}
        step={1}
        value={low}
        aria-valuetext={stops?.[low]}
        aria-label={t('motorDlg.rangeMin', { label })}
        onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
        className={THUMB}
        // Where the thumbs meet, the one that can still move is on top: low, except at the first stop.
        style={{ zIndex: low >= high && low > 0 ? 5 : 3 }}
      />
      <input
        type="range"
        min={0}
        max={count - 1}
        step={1}
        value={high}
        aria-valuetext={stops?.[high]}
        aria-label={t('motorDlg.rangeMax', { label })}
        onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
        className={THUMB}
        style={{ zIndex: 4 }}
      />
    </div>
  );
}
