import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { errorText } from '../../i18n/keyedError';
import {
  customExpressionsOf,
  importExpressions,
  withCustomExpressions,
  type CustomExpression,
} from '../../services/flight/customExpressions';
import { MasterDetail, MasterDetailDialog, MasterRow } from '../common/MasterDetail';
import { useGuardedSelection } from '../common/useGuardedSelection';
import { useFilePick } from '../common/useFilePick';
import { StatusLine } from '../common/StatusLine';
import { smallButton } from '../common/smallButton';
import { fireAction } from '../../state/fireAction';
import { ExpressionEditor } from './ExpressionEditor';
import { useListFaults } from './useExpressionFaults';

const NEW = 'new';

/** Desktop's Custom expressions: the design's own flight variables, calculated in the order listed. */
export function CustomExpressionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const applyTreeAction = useWorkspaceStore((s) => s.applyTreeAction);
  const list = useMemo(() => customExpressionsOf(tree), [tree]);
  const faults = useListFaults(list);
  const { selectedId, select, settle, close, onDirtyChange, err, setErr, removeWith } = useGuardedSelection(
    t('expressions.discardConfirm'),
  );
  const [status, setStatus] = useState<string | null>(null);

  const creating = selectedId === NEW;
  // The list position: an undo behind the dialog can leave it past the end.
  const at = creating ? list.length : selectedId === null ? -1 : Number(selectedId);
  const selected = list[at] ?? null;
  const showsDetail = creating || selected !== null;

  const before = useMemo(() => list.slice(0, Math.max(0, at)), [list, at]);
  const others = useMemo(() => list.filter((_, i) => i !== at), [list, at]);

  const apply = (next: CustomExpression[]) => applyTreeAction((tr) => withCustomExpressions(tr, next));

  const save = (draft: CustomExpression) => {
    apply(creating ? [...list, draft] : list.map((e, i) => (i === at ? draft : e)));
    settle(String(at));
  };

  const move = (by: -1 | 1) => {
    const next = [...list];
    [next[at], next[at + by]] = [next[at + by]!, next[at]!];
    apply(next);
    settle(String(at + by));
  };

  const remove = () =>
    removeWith(t('expressions.deleteConfirm', { name: selected?.name ?? '' }), () => {
      apply(list.filter((_, i) => i !== at));
      return Promise.resolve();
    });

  const importFrom = async (file: File) => {
    setErr(null);
    setStatus(null);
    try {
      const data = await file.arrayBuffer();
      const { importOrk } = await import('../../services/files/orkImport');
      const found = customExpressionsOf(importOrk(data).tree);
      const { list: next, added, skipped } = importExpressions(list, found);
      if (added) apply(next);
      setStatus(
        found.length
          ? `${t('expressions.imported', { n: added })}${skipped ? ` ${t('expressions.importSkipped', { n: skipped })}` : ''}`
          : t('expressions.importNone'),
      );
    } catch (e) {
      setErr(errorText(e, t));
    }
  };
  const file = useFilePick({
    accept: '.ork',
    label: t('expressions.importHint'),
    onFile: (f) => fireAction(importFrom(f)),
  });

  const actionClass = smallButton('xs', 'ink');

  return (
    <MasterDetailDialog
      id="customExpressions"
      title={t('expressions.title')}
      onClose={onClose}
      close={close}
      err={err}
      loading={false}
      actions={
        <div className="flex gap-2">
          <button onClick={() => void select(NEW)} className={actionClass}>
            {t('expressions.new')}
          </button>
          <button onClick={file.pick} title={t('expressions.importHint')} className={actionClass}>
            {t('expressions.import')}
          </button>
          {file.input}
        </div>
      }
    >
      <MasterDetail
        showsDetail={showsDetail}
        hint={t('expressions.pickHint')}
        list={
          <>
            <p className="px-4 py-2 text-xs leading-snug text-ink-faint">{t('expressions.intro')}</p>
            <StatusLine tone="muted" className="px-4">
              {status}
            </StatusLine>
            {list.length === 0 ? (
              <p className="p-6 text-center text-sm leading-snug text-ink-muted">{t('expressions.empty')}</p>
            ) : (
              <ol className="divide-y divide-line/5">
                {list.map((e, i) => {
                  const bad = faults?.[i] && (faults[i].symbol || faults[i].expression);
                  return (
                    <li key={i}>
                      <MasterRow selected={i === at} onClick={() => void select(String(i))}>
                        <span className="block truncate text-sm text-ink-strong">{e.name || e.symbol}</span>
                        <span className="block truncate font-mono text-xs text-ink-faint">
                          {`${e.symbol} = ${e.expression}`}
                        </span>
                        {bad && <span className="block text-xs text-danger-400">{t('expressions.notCalculated')}</span>}
                      </MasterRow>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        }
        detail={
          <ExpressionEditor
            key={selectedId ?? NEW}
            expression={selected}
            before={before}
            others={others}
            onSave={save}
            onDelete={selected ? () => void remove() : undefined}
            onMoveUp={selected && at > 0 ? () => move(-1) : undefined}
            onMoveDown={selected && at < list.length - 1 ? () => move(1) : undefined}
            onDirtyChange={onDirtyChange}
            onBack={() => void select(null)}
          />
        }
      />
    </MasterDetailDialog>
  );
}
