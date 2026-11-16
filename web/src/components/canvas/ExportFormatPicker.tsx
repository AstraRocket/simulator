import { useTranslation } from 'react-i18next';
import { EXPORT_FORMATS } from '../../services/exports/flightPathExport';
import type { UserTemplate } from '../../services/exports/templateStore';
import { USER_PREFIX } from './useExportTemplates';
import { useFilePick } from '../common/useFilePick';
import { smallButton } from '../common/smallButton';
import { SelectRow } from '../common/SelectRow';

export function ExportFormatPicker({
  selected,
  templates,
  canDelete,
  onSelect,
  onImport,
  onDownloadTemplate,
  onDelete,
}: {
  selected: string;
  templates: UserTemplate[];
  canDelete: boolean;
  onSelect: (value: string) => void;
  onImport: (file: File) => void;
  onDownloadTemplate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const templateFile = useFilePick({ accept: '.mustache', onFile: onImport, label: t('pathExport.import') });
  return (
    <div className="space-y-2">
      <SelectRow
        label={t('pathExport.format')}
        value={selected}
        onChange={onSelect}
        width="min-w-0 flex-1"
        labelClassName="text-xs font-medium uppercase tracking-wide text-ink-muted"
      >
        <optgroup label={t('pathExport.builtIns')}>
          {EXPORT_FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {t(`pathExport.fmt.${f.id}`)}
            </option>
          ))}
        </optgroup>
        {templates.length > 0 && (
          <optgroup label={t('pathExport.custom')}>
            {templates.map((tp) => (
              <option key={tp.id} value={`${USER_PREFIX}${tp.id}`}>
                {tp.name} (.{tp.ext})
              </option>
            ))}
          </optgroup>
        )}
      </SelectRow>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button onClick={templateFile.pick} className={smallButton('chip', 'ink')}>
            {t('pathExport.import')}
          </button>
          {templateFile.input}
          <button
            onClick={onDownloadTemplate}
            title={t('pathExport.downloadTemplateTitle')}
            className={smallButton('chip', 'ink')}
          >
            {t('pathExport.downloadTemplate')}
          </button>
        </div>
        {canDelete && (
          <button
            onClick={onDelete}
            className="rounded-md bg-danger-600/80 px-2 py-1 text-[11px] font-medium text-on-accent ring-1 ring-danger-400/30 hover:bg-danger-600"
          >
            {t('pathExport.delete')}
          </button>
        )}
      </div>
    </div>
  );
}
