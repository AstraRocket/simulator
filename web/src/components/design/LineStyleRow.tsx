import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { LINE_STYLES, readLineStyle, type LineStyle } from '../../services/design/figureStyle';

/**
 * A line style: desktop's combo, "Default style" and the four `LineStyle`s.
 * Default leaves the part to its type's saved style, else the view's own.
 */
export function LineStyleRow({
  label,
  value,
  disabled,
  onCommit,
  labelClassName = 'text-xs text-ink-muted',
}: {
  label: string;
  value: LineStyle | undefined;
  disabled?: boolean;
  onCommit: (v: LineStyle | undefined) => void;
  /** The label's text style, to match the rows around it. */
  labelClassName?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onCommit(readLineStyle(e.target.value))}
        className="h-7 w-36 rounded-md bg-raised px-2 text-xs text-ink-strong ring-1 ring-line/10 focus:outline-none focus:ring-accent-500 disabled:bg-raised/50 disabled:text-ink-muted"
      >
        <option value="">{t('prop.lineStyleDefault')}</option>
        {LINE_STYLES.map((s) => (
          <option key={s} value={s}>
            {t(`prop.lineStyle_${s}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
