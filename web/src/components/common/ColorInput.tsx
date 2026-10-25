import { useId, useLayoutEffect, useRef } from 'react';
import { useNativeChange } from './useNativeChange';

/**
 * A color input that commits once, when the picker closes, rather than on every
 * drag tick. React's `onChange` on a color input maps to the native `input`
 * event, which fires continuously while the OS picker is dragged; bound to a
 * saved setting, every tick would write the whole settings object to storage,
 * dozens of writes per gesture. This listens to the NATIVE `change` (once, on close)
 * and to blur, since closing the picker with its own OK does not always move
 * focus. The swatch still previews while dragging: it shows its own value.
 */
export function ColorInput({
  value,
  onCommit,
  id,
  disabled,
  ariaLabel,
  title,
  className,
  style,
}: {
  value: string;
  onCommit: (color: string) => void;
  id?: string;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Uncontrolled, re-seeded when the stored value changes from elsewhere. The
  // same element is kept, not remounted, so the native listener below stays
  // attached for every later pick.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.value !== value) el.value = value;
  }, [value]);
  useNativeChange(ref, (el) => {
    if (el.value !== value) onCommit(el.value);
  });
  return (
    <input
      ref={ref}
      id={id}
      type="color"
      defaultValue={value}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      onBlur={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
      className={className}
      style={style}
    />
  );
}

/**
 * A labeled color row: the label, then the swatch picker, then `children` (a
 * hex box, a reset button). A row rather than one big <label>, since the
 * children are controls of their own and a label binds to one. Only the
 * controls dim when disabled: a faded label would fall below the text contrast
 * floor, and the inputs' own state already says so.
 */
export function ColorField({
  label,
  value,
  disabled,
  onCommit,
  labelClassName,
  children,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (color: string) => void;
  labelClassName: string;
  children?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <span className="flex items-center gap-2">
        <ColorInput
          id={id}
          value={value}
          disabled={disabled}
          onCommit={onCommit}
          className="h-7 w-10 cursor-pointer rounded-md border border-line/10 bg-raised p-0.5 disabled:cursor-default disabled:opacity-40"
        />
        {children}
      </span>
    </div>
  );
}
