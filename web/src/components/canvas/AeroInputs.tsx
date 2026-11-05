import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NumberInput } from '../common/NumberInput';
import { smallButton } from '../common/smallButton';

export function Num({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  // Committed on blur or Enter: each commit runs a synchronous `aeroSweep()` that stalls the panel.
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] text-ink-faint">{label}</span>
      <NumberInput
        commitOnBlur
        value={value}
        min={min}
        max={max}
        step={step}
        ariaLabel={label}
        onChange={(v) => v !== null && onChange(v)}
        className="w-16 rounded-md bg-raised px-1.5 py-0.5 text-right text-[11px] tabular-nums text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500"
      />
      <span className="text-[10px] text-ink-faint">{unit}</span>
    </label>
  );
}

export function WorstButton({
  worst,
  onWorst,
}: {
  /** Degrees. */
  worst: (() => number) | null;
  onWorst: (deg: number) => void;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          if (!worst) return;
          try {
            onWorst(worst());
            setFailed(false);
          } catch (e) {
            console.error('worstThetaDeg failed', e);
            setFailed(true);
          }
        }}
        title={t('aero.worstNote')}
        className={smallButton('tight', 'ink')}
      >
        {t('aero.worst')}
      </button>
      <span role="status" className="text-[10px] text-warn-400">
        {failed ? t('aero.worstFailed') : ''}
      </span>
    </>
  );
}
