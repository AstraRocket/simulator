import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { trimFloatNoise } from '../../services/app/numbers';
import { parseFieldValue } from './parseFieldValue';

const fmt = (v: number) => String(trimFloatNoise(v));

const reportDraft = (
  draft: string,
  min: number | undefined,
  max: number | undefined,
  onChange: (v: number | null) => void,
) => {
  if (draft.trim() === '') onChange(null);
  else {
    const v = parseFieldValue(draft, min, max);
    if (v !== null) onChange(v);
  }
};

/** Keeps the raw text while focused, so "2." or a cleared box survives re-renders. */
export function NumberInput({
  value,
  onChange,
  onCommit,
  step,
  min,
  max,
  disabled,
  placeholder,
  className,
  ariaLabel,
  invalid,
  commitOnBlur = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  onCommit?: () => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  /** Without it a wrapping <label> holding the UnitChip names the field "Length mm". */
  ariaLabel?: string;
  /** Unmounting mid-edit still reports, since React fires no blur for a removed node. */
  commitOnBlur?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const edited = useRef(false);
  const blank = value === null || value === undefined || Number.isNaN(value);
  // Clearing the box after malformed text fires no change event (the browser reports '' both times).
  const sawBadInput = useRef(false);
  const props = { commitOnBlur, draft, min, max, blank, onChange, onCommit };
  // A layout effect so the unmount cleanup sees the last render's values.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const report = (el: HTMLInputElement, p: typeof props) => {
    const clearedAfterBad = sawBadInput.current && !el.validity.badInput && el.value.trim() === '';
    sawBadInput.current = false;
    if (clearedAfterBad && !p.blank) p.onChange(null);
    // A malformed entry reads as ''; reporting it would clear the field.
    else if (p.commitOnBlur && edited.current && p.draft !== null && !el.validity.badInput)
      reportDraft(p.draft, p.min, p.max, p.onChange);
    edited.current = false;
  };
  const commit = (el: HTMLInputElement) => {
    report(el, props);
    setDraft(null);
    onCommit?.();
  };
  const input = useRef<HTMLInputElement>(null);
  const flushOnUnmount = useEffectEvent((el: HTMLInputElement) => {
    report(el, latest.current);
    latest.current.onCommit?.();
  });
  useEffect(() => {
    // Taken now: React has detached the ref by the time the cleanup runs.
    const el = input.current;
    return () => {
      if (!el || !(edited.current || sawBadInput.current)) return;
      flushOnUnmount(el);
    };
  }, []);
  return (
    <input
      ref={input}
      type="number"
      step={step}
      min={min}
      max={max}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      value={draft ?? (blank ? '' : fmt(value))}
      // `fmt`, not `String`: the draft must start from the text shown, without float noise.
      onFocus={() => setDraft(blank ? '' : fmt(value))}
      onChange={(e) => {
        // Unparseable text ("-", "1e") arrives as '' with `badInput`; it is not a cleared field.
        if (e.target.validity.badInput) {
          sawBadInput.current = true;
          setDraft('');
          return;
        }
        const raw = e.target.value;
        setDraft(raw);
        if (commitOnBlur) {
          edited.current = true;
          return;
        }
        if (raw.trim() === '') {
          onChange(null);
          return;
        }
        const v = parseFieldValue(raw, min, max);
        if (v === null) return;
        onChange(v);
      }}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={commitOnBlur ? (e) => e.key === 'Enter' && commit(e.currentTarget) : undefined}
    />
  );
}
