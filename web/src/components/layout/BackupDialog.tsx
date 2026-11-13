import { useState } from 'react';
import { fmtDateTime } from '../../i18n/format';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { useFilePick } from '../common/useFilePick';
import { errorText } from '../../i18n/keyedError';
import { useSettings } from '../../state/useSettings';
import { assertImportSize, readFileText } from '../../services/files/decodeText';
import { exportFilename, saveText } from '../../services/files/saveFile';
import { appName } from '../../services/app/appInfo';
import { localToday } from '../../services/app/localDate';
import { withMember } from '../../services/app/collections';
import {
  BACKUP_LIBRARIES,
  libraryCounts,
  makeBackup,
  readBackup,
  restoreBackup,
  type BackupLibrary,
  type ReadBackup,
  type RestoreCount,
} from '../../services/storage/backup';
import { Check } from '../common/Check';
import { StatusLine } from '../common/StatusLine';
import { DialogButton } from '../common/DialogButton';

export function BackupDialog({ mode, onClose }: { mode: 'backup' | 'restore'; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { settings, update } = useSettings();
  const counts = useAsyncLoad(libraryCounts, 'counts');
  const [toSave, setToSave] = useState<Set<BackupLibrary>>(() => new Set(BACKUP_LIBRARIES));
  const [file, setFile] = useState<ReadBackup | null>(null);
  const [toRestore, setToRestore] = useState<Set<BackupLibrary>>(new Set());
  const [results, setResults] = useState<Partial<Record<BackupLibrary, RestoreCount>> | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await work();
    } catch (e) {
      setStatus(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const text = await makeBackup(toSave, settings);
      // Local calendar day: a UTC date names an evening backup in the Americas tomorrow.
      // Not on a cancel: a user who then clears site data would lose what they thought was saved.
      if (await saveText(text, exportFilename([appName(), 'backup', localToday()], 'json'), 'application/json')) {
        setStatus(t('backup.saved'));
      }
    });

  const open = useFilePick({
    accept: '.json,application/json',
    label: t('backup.open'),
    onFile: (f) =>
      void (async () => {
        setStatus(null);
        setResults(null);
        try {
          assertImportSize(f.size);
          const read = readBackup(await readFileText(f));
          setFile(read);
          setToRestore(new Set(BACKUP_LIBRARIES.filter((lib) => read.entries[lib])));
        } catch (e) {
          setFile(null);
          setStatus(errorText(e, t));
        }
      })(),
  });

  const restore = async () => {
    if (!file) return;
    await run(async () => {
      setResults(await restoreBackup(file, toRestore, (s) => update(s)));
      counts.retry();
    });
  };

  const libraries = [...BACKUP_LIBRARIES].sort((x, y) =>
    t(`backup.lib.${x}`).localeCompare(t(`backup.lib.${y}`), i18n.language),
  );

  const restorable = !!file && BACKUP_LIBRARIES.some((lib) => toRestore.has(lib) && file.entries[lib]);

  const madeText = file?.created ? fmtDateTime(new Date(file.created).getTime()) : null;

  return (
    <Dialog
      id={mode}
      title={t(mode === 'backup' ? 'backup.title' : 'backup.restoreTitle')}
      onClose={onClose}
      size="lg"
      layout="pad"
      expandable={false}
    >
      <div className="space-y-6 text-sm">
        {mode === 'backup' && (
          <section className="space-y-2">
            <p className="leading-snug text-ink-muted">{t('backup.intro')}</p>
            {libraries.map((lib) => (
              <Check
                key={lib}
                checked={toSave.has(lib)}
                onChange={(v) => setToSave((s) => withMember(s, lib, v))}
                className=""
                label={
                  <>
                    {t(`backup.lib.${lib}`)}
                    {lib !== 'settings' && counts.data && (
                      <span className="tabular-nums text-ink-faint">({counts.data[lib]})</span>
                    )}
                  </>
                }
              />
            ))}
            <DialogButton size="sm" onClick={() => void save()} disabled={busy || toSave.size === 0}>
              {t('backup.save')}
            </DialogButton>
          </section>
        )}

        {mode === 'restore' && (
          <section className="space-y-2">
            <p className="leading-snug text-ink-muted">{t('backup.restoreNote')}</p>
            {libraries.map((lib) => {
              const held = file?.entries[lib];
              return (
                <Check
                  key={lib}
                  checked={toRestore.has(lib) && !!held}
                  disabled={!held}
                  onChange={(v) => setToRestore((s) => withMember(s, lib, v))}
                  className=""
                  label={
                    <>
                      {t(`backup.lib.${lib}`)}
                      {file && !held && <span>({t('backup.notInFile')})</span>}
                      {held && lib !== 'settings' && (
                        <span className="tabular-nums text-ink-faint">({held.length})</span>
                      )}
                    </>
                  }
                />
              );
            })}
            <p className="text-xs leading-snug text-ink-faint">{t('backup.skipNote')}</p>
            <div className="flex flex-wrap gap-2">
              <DialogButton size="sm" onClick={open.pick} disabled={busy}>
                {t('backup.open')}
              </DialogButton>
              <DialogButton size="sm" onClick={() => void restore()} disabled={busy || !restorable}>
                {t('backup.restore')}
              </DialogButton>
            </div>
            {open.input}
            {file && madeText && (
              <p className="text-xs text-ink-muted">{t('backup.fileInfo', { date: madeText, app: file.app })}</p>
            )}
            {results && (
              <ul className="space-y-0.5 text-xs text-ink">
                {libraries
                  .filter((lib) => results[lib])
                  .map((lib) => {
                    const r = results[lib]!;
                    return (
                      <li key={lib}>
                        {lib === 'settings'
                          ? t(r.replaced ? 'backup.settingsRestored' : 'backup.settingsRefused')
                          : t('backup.result', { lib: t(`backup.lib.${lib}`), ...r })}
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        )}

        {/* Always mounted so the live region announces (see UpdateToast). */}
        <StatusLine tone="muted">{status}</StatusLine>
      </div>
    </Dialog>
  );
}
