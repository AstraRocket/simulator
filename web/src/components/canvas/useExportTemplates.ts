import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { download as saveDownload, safeFilename } from '../../services/files/saveFile';
import { EXPORT_FORMATS } from '../../services/exports/flightPathExport';
import { getTemplateStore, parseTemplateFilename, type UserTemplate } from '../../services/exports/templateStore';
import { useLatest } from '../common/useLatest';
import { readFileText } from '../../services/files/decodeText';
import { confirm } from '../../state/confirmStore';
import { errorText } from '../../i18n/keyedError';
import i18n from '../../i18n';

export const USER_PREFIX = 'user:';

export function useExportTemplates() {
  const { t } = useTranslation();
  const store = useMemo(() => getTemplateStore(), []);
  const [selected, setSelected] = useState<string>(EXPORT_FORMATS[0]!.id);
  const [templates, setTemplates] = useState<UserTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const storeWrite = useLatest();

  // The opening listing takes a token too, so a slow one cannot overwrite an import's list.
  const claimWrite = storeWrite.claim;
  useEffect(() => {
    const mine = claimWrite();
    store
      .list()
      .then((listed) => mine() && setTemplates(listed))
      .catch((e: unknown) => {
        if (!mine()) return;
        setTemplates([]);
        setError(errorText(e, i18n.t));
      });
  }, [store, claimWrite]);

  const resolved = useMemo(() => {
    if (selected.startsWith(USER_PREFIX)) {
      const id = selected.slice(USER_PREFIX.length);
      const template = templates.find((tp) => tp.id === id);
      if (template) return { kind: 'user' as const, template };
    }
    const format = EXPORT_FORMATS.find((f) => f.id === selected) ?? EXPORT_FORMATS[0]!;
    return { kind: 'builtin' as const, format };
  }, [selected, templates]);

  const selectedUser = resolved.kind === 'user' ? resolved.template : null;

  const onImport = async (file: File) => {
    const mine = storeWrite.claim();
    let source: string;
    try {
      source = await readFileText(file);
    } catch {
      if (mine()) setError(t('pathExport.importError'));
      return;
    }
    if (!mine()) return;
    if (!source.trim()) {
      setError(t('pathExport.importEmpty'));
      return;
    }
    try {
      const { id, name, ext } = parseTemplateFilename(file.name);
      await store.add({ id, name, ext, source });
      const listed = await store.list();
      if (!mine()) return;
      setTemplates(listed);
      setSelected(`${USER_PREFIX}${id}`);
      setError(null);
    } catch {
      if (!mine()) return;
      setError(t('pathExport.importSaveError'));
    }
  };

  const deleteSelected = async () => {
    if (!selectedUser) return;
    const ok = await confirm({
      message: t('pathExport.deleteConfirm', { name: selectedUser.name }),
      confirmLabel: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    const mine = storeWrite.claim();
    try {
      await store.remove(selectedUser.id);
      const listed = await store.list();
      if (!mine()) return;
      setTemplates(listed);
    } catch {
      if (!mine()) return;
      setError(t('pathExport.deleteError'));
      return;
    }
    setSelected(EXPORT_FORMATS[0]!.id);
    setError(null);
  };

  const downloadTemplate = () => {
    if (resolved.kind === 'user') {
      const tp = resolved.template;
      saveDownload(`${safeFilename(tp.name, 'flight')}.${tp.ext}.mustache`, tp.source);
    } else {
      saveDownload(resolved.format.templateFilename, resolved.format.source);
    }
  };

  return {
    selected,
    setSelected,
    templates,
    resolved,
    selectedUser,
    error,
    setError,
    onImport,
    deleteSelected,
    downloadTemplate,
  };
}
