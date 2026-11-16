import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { DesignTypeOptions } from './DesignTypeOptions';
import { NOTE_FIELD as FIELD, NOTE_LABEL as LABEL } from './designNotesStyles';
import { RevisionLog } from './RevisionLog';
import { useCanBuildDesign } from './useCanBuildDesign';
import { Disclosure } from '../common/Disclosure';

// Commits on blur, one undo step per field. Keyed on the value so undo or another file reseeds it.
function NoteField({
  label,
  value,
  rows,
  onCommit,
}: {
  label: string;
  value: string | undefined;
  rows?: number;
  onCommit: (text: string | undefined) => void;
}) {
  const id = useId();
  const commit = (e: { target: { value: string } }) => onCommit(e.target.value.trim() || undefined);
  return (
    <div>
      <label className={LABEL} htmlFor={id}>
        {label}
      </label>
      {rows ? (
        <textarea
          key={value ?? ''}
          id={id}
          defaultValue={value ?? ''}
          rows={rows}
          onBlur={commit}
          className={`${FIELD} resize-y`}
        />
      ) : (
        <input key={value ?? ''} id={id} defaultValue={value ?? ''} onBlur={commit} className={FIELD} />
      )}
    </div>
  );
}

export function DesignNotesSection() {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const updateDesignMeta = useWorkspaceStore((s) => s.updateDesignMeta);
  const canEdit = useCanBuildDesign();
  const [open, setOpen] = useState(false);
  const typeId = useId();
  if (!canEdit) return null;
  const designType = tree.designType ?? 'original';
  return (
    <section className="rounded-xl bg-surface p-2 ring-1 ring-line/10">
      <Disclosure open={open} onToggle={() => setOpen((o) => !o)} label={t('config.notes')} />
      {open && (
        <div className="space-y-2 p-1 pt-2">
          <NoteField label={t('config.name')} value={tree.name} onCommit={(name) => updateDesignMeta({ name })} />
          <NoteField
            label={t('config.designer')}
            value={tree.designer}
            onCommit={(designer) => updateDesignMeta({ designer })}
          />
          <NoteField
            label={t('config.kitName')}
            value={tree.kitName}
            onCommit={(kitName) => updateDesignMeta({ kitName })}
          />
          <NoteField
            label={t('config.kitManufacturer')}
            value={tree.kitManufacturer}
            onCommit={(kitManufacturer) => updateDesignMeta({ kitManufacturer })}
          />
          <NoteField
            label={t('config.kitPartNumber')}
            value={tree.kitPartNumber}
            onCommit={(kitPartNumber) => updateDesignMeta({ kitPartNumber })}
          />
          <div>
            <label className={LABEL} htmlFor={typeId}>
              {t('config.designType')}
            </label>
            <select
              id={typeId}
              value={designType}
              onChange={(e) => updateDesignMeta({ designType: e.target.value })}
              className={FIELD}
            >
              <DesignTypeOptions current={designType} />
            </select>
          </div>
          <NoteField
            label={t('config.comments')}
            value={tree.comment}
            rows={4}
            onCommit={(comment) => updateDesignMeta({ comment })}
          />
          <NoteField
            label={t('config.revision')}
            value={tree.revision}
            rows={3}
            onCommit={(revision) => updateDesignMeta({ revision })}
          />
          <RevisionLog />
          <p className="text-[11px] text-ink-muted">{t('config.appOnlyNotes')}</p>
        </div>
      )}
    </section>
  );
}
