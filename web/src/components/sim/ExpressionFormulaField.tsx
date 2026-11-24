import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CustomExpression } from '../../services/flight/customExpressions';
import { appliesLate, EXPRESSION_FUNCTIONS, EXPRESSION_VARIABLES } from '../../services/flight/expressionVocabulary';
import { colWithUnit } from '../../i18n/format';
import { STACKED_INPUT, STACKED_LABEL } from '../common/StackedField';
import { StatusLine } from '../common/StatusLine';

const pickClass = `mt-1 ${STACKED_INPUT}`;

/** The formula box, with lists that insert a variable or a function at the cursor. */
export function ExpressionFormulaField({
  value,
  onChange,
  before,
  status,
}: {
  value: string;
  onChange: (value: string) => void;
  before: readonly CustomExpression[];
  status: ReactNode;
}) {
  const { t } = useTranslation();
  const box = useRef<HTMLTextAreaElement>(null);

  /** The cursor ends where the snippet has its `|`. */
  const insert = (snippet: string) => {
    const el = box.current;
    if (!el || !snippet) return;
    const added = snippet.replace('|', '');
    const at = el.selectionStart;
    onChange(value.slice(0, at) + added + value.slice(el.selectionEnd));
    const to = at + (snippet.includes('|') ? snippet.indexOf('|') : added.length);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(to, to);
    });
  };

  return (
    <>
      <label htmlFor="expr-formula" className={STACKED_LABEL}>
        {t('expressions.formula')}
      </label>
      <textarea
        id="expr-formula"
        ref={box}
        rows={3}
        value={value}
        // One line, as in the file.
        onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={`mt-1 font-mono ${STACKED_INPUT}`}
      />
      {status}
      <StatusLine tone="warn" className="mt-1">
        {appliesLate(value) ? t('expressions.appliesLate') : null}
      </StatusLine>

      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <select
          value=""
          onChange={(e) => insert(e.target.value)}
          aria-label={t('expressions.insertVariable')}
          className={pickClass}
        >
          <option value="">{t('expressions.insertVariable')}</option>
          {before.length > 0 && (
            <optgroup label={t('expressions.title')}>
              {before.map((e, i) => (
                <option key={i} value={e.symbol}>{`${e.symbol} · ${e.name}`}</option>
              ))}
            </optgroup>
          )}
          <optgroup label={t('expressions.builtIn')}>
            {EXPRESSION_VARIABLES.map((v) => {
              const unit = v.unitKey ? t(v.unitKey) : v.unit;
              const label = t(v.labelKey);
              return (
                <option key={v.symbol} value={v.symbol}>
                  {`${v.symbol} · ${unit ? colWithUnit(label, unit) : label}`}
                </option>
              );
            })}
          </optgroup>
        </select>
        <select
          value=""
          onChange={(e) => insert(e.target.value)}
          aria-label={t('expressions.insertFunction')}
          className={pickClass}
        >
          <option value="">{t('expressions.insertFunction')}</option>
          {EXPRESSION_FUNCTIONS.map((f) => (
            <option key={f.name} value={f.insert}>
              {f.labelKey ? `${f.name} · ${t(f.labelKey)}` : f.name}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-xs leading-snug text-ink-faint">{t('expressions.formulaHint')}</p>
    </>
  );
}
