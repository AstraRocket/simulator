import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sameExpression, SI_UNITS, type CustomExpression } from '../../services/flight/customExpressions';
import { EditorFooter, EditorHeading } from '../common/MasterDetail';
import { useReportDirty } from '../common/useGuardedSelection';
import { StackedField } from '../common/StackedField';
import { StatusLine } from '../common/StatusLine';
import { smallButton } from '../common/smallButton';
import { ExpressionFormulaField } from './ExpressionFormulaField';
import { useExpressionFaults } from './useExpressionFaults';

const BLANK: CustomExpression = { name: '', symbol: '', unit: '', expression: '' };

const CODE_INPUT = { autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false } as const;

function FaultLine({ messageKey }: { messageKey: string | null }) {
  const { t } = useTranslation();
  return (
    <StatusLine tone="danger" className="mt-1">
      {messageKey ? t(messageKey) : null}
    </StatusLine>
  );
}

function MoveButton({
  label,
  onMove,
  children,
}: {
  label: string;
  onMove: (() => void) | undefined;
  children: string;
}) {
  return (
    <button onClick={onMove} disabled={!onMove} aria-label={label} title={label} className={smallButton('sm', 'ink')}>
      {children}
    </button>
  );
}

// Keyed on the selection by the parent, so remounting re-seeds the state.
export function ExpressionEditor({
  expression,
  before,
  others,
  onSave,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDirtyChange,
  onBack,
}: {
  expression: CustomExpression | null;
  /** The expressions above this one, which its formula can use. */
  before: readonly CustomExpression[];
  others: readonly CustomExpression[];
  onSave: (draft: CustomExpression) => void;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const start = expression ?? BLANK;
  const [draft, setDraft] = useState(start);
  const set = (patch: Partial<CustomExpression>) => setDraft((d) => ({ ...d, ...patch }));

  const clean: CustomExpression = {
    name: draft.name.trim(),
    symbol: draft.symbol.trim(),
    unit: draft.unit.trim(),
    expression: draft.expression.trim(),
  };
  const dirty = !sameExpression(clean, start);
  useReportDirty(dirty, onDirtyChange);
  const fault = useExpressionFaults(clean, before, others);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pt-0">
        <EditorHeading
          onBack={onBack}
          backLabel={t('expressions.back')}
          title={expression ? expression.name || expression.symbol : t('expressions.new')}
        />

        <StackedField
          id="expr-name"
          label={t('expressions.name')}
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <FaultLine messageKey={fault.nameKey} />

        <div className="grid gap-x-3 sm:grid-cols-2">
          <div>
            <StackedField
              id="expr-symbol"
              label={t('expressions.symbol')}
              value={draft.symbol}
              onChange={(e) => set({ symbol: e.target.value })}
              {...CODE_INPUT}
            />
            <FaultLine messageKey={fault.symbolKey} />
          </div>
          <div>
            <StackedField
              id="expr-unit"
              label={t('expressions.unit')}
              value={draft.unit}
              onChange={(e) => set({ unit: e.target.value })}
              list="expr-units"
              {...CODE_INPUT}
            />
            <datalist id="expr-units">
              {SI_UNITS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>
        </div>
        <p className="mt-1 text-xs leading-snug text-ink-faint">{t('expressions.unitHint')}</p>

        <ExpressionFormulaField
          value={draft.expression}
          onChange={(v) => set({ expression: v })}
          before={before}
          status={<FaultLine messageKey={fault.formulaKey} />}
        />
      </div>

      <EditorFooter
        onDelete={onDelete}
        dirty={dirty}
        onRevert={() => setDraft(start)}
        onSave={() => onSave(clean)}
        saveDisabled={!fault.usable}
      >
        {expression && (
          <>
            <MoveButton label={t('expressions.moveUp')} onMove={dirty ? undefined : onMoveUp}>
              ↑
            </MoveButton>
            <MoveButton label={t('expressions.moveDown')} onMove={dirty ? undefined : onMoveDown}>
              ↓
            </MoveButton>
          </>
        )}
      </EditorFooter>
    </>
  );
}
