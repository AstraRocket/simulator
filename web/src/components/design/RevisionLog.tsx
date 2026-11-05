import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localToday } from '../../services/app/localDate';
import { uuid } from '../../services/app/uuid';
import { confirm } from '../../state/confirmStore';
import { useWorkspaceStore } from '../../state/store';
import { smallButton } from '../common/smallButton';
import { NOTE_FIELD, NOTE_LABEL } from './designNotesStyles';

export function RevisionLog() {
  const { t } = useTranslation();
  const log = useWorkspaceStore((s) => s.tree.revisionLog);
  const updateDesignMeta = useWorkspaceStore((s) => s.updateDesignMeta);
  const [date, setDate] = useState(localToday);
  const [note, setNote] = useState('');
  const dateId = useId();
  const noteId = useId();
  const entries = log ?? [];
  const newestFirst = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const canAdd = !!date && note.trim() !== '';

  const add = () => {
    if (!canAdd) return;
    updateDesignMeta({ revisionLog: [...entries, { id: uuid(), date, note: note.trim() }] });
    setNote('');
  };
  const remove = async (id: string) => {
    if (!(await confirm({ message: t('config.removeRevisionConfirm'), danger: true }))) return;
    const rest = entries.filter((e) => e.id !== id);
    updateDesignMeta({ revisionLog: rest.length ? rest : undefined });
  };

  return (
    <div className="space-y-2 border-t border-line/5 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('config.revisionLog')}</h3>
      {newestFirst.length ? (
        <ul className="space-y-1">
          {newestFirst.map((e) => (
            <li key={e.id} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 tabular-nums text-ink-muted">{e.date}</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">{e.note}</span>
              <button
                type="button"
                onClick={() => void remove(e.id)}
                aria-label={t('config.removeRevision', { date: e.date })}
                className={smallButton('sm', 'soft', 'shrink-0')}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-ink-faint">{t('config.noRevisions')}</p>
      )}
      <div>
        <label className={NOTE_LABEL} htmlFor={dateId}>
          {t('config.revisionDate')}
        </label>
        <input id={dateId} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={NOTE_FIELD} />
      </div>
      <div>
        <label className={NOTE_LABEL} htmlFor={noteId}>
          {t('config.revisionNote')}
        </label>
        <textarea
          id={noteId}
          value={note}
          rows={2}
          onChange={(e) => setNote(e.target.value)}
          className={`${NOTE_FIELD} resize-y`}
        />
      </div>
      <button type="button" onClick={add} disabled={!canAdd} className={smallButton('sm', 'soft')}>
        {t('config.addRevision')}
      </button>
    </div>
  );
}
