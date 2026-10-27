import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';
import { useAsyncLoad } from '../common/useAsyncLoad';
import { useFilePick } from '../common/useFilePick';
import { errorText } from '../../i18n/keyedError';
import { useSettings } from '../../state/SettingsProvider';
import { assertImportSize, readFileText } from '../../services/files/decodeText';
import { exportFilename, saveText } from '../../services/files/saveFile';
import { appName } from '../../services/app/appInfo';
import { todayYmd } from '../../services/weather/openMeteo';
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

const button =
  'rounded-lg bg-raised px-3 py-1.5 text-sm font-medium text-ink ring-1 ring-line/10 hover:bg-elevated disabled:opacity-50';

/**
 * Export ▸ Backup and Import ▸ Backup: everything this browser keeps besides
 * designs, as one file to take to another browser or machine
 * (services/storage/backup.ts). One dialog with a half for each, since they
 * share the library list and its names.
 *
 * Both let the user choose libraries. A backup starts with all of them; a
 * restore starts with all the file holds, and says what each one did.
 */
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

  const toggle = (set: Set<BackupLibrary>, lib: BackupLibrary, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(lib);
    else next.delete(lib);
    return next;
  };

  /**
   * A save or a restore: busy while it runs, and its failure in the status
   * line. The store's own message, since a refused write is not always
   * "storage full".
   */
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
      // The user's own calendar day: a UTC date names an evening backup in the
      // Americas tomorrow.
      await saveText(text, exportFilename([appName(), 'backup', todayYmd()], 'json'), 'application/json');
      setStatus(t('backup.saved'));
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

  // Alphabetical by the name shown, in the reader's language.
  const libraries = [...BACKUP_LIBRARIES].sort((x, y) =>
    t(`backup.lib.${x}`).localeCompare(t(`backup.lib.${y}`), i18n.language),
  );

  // Something to take: a file is open and it holds a library that is ticked.
  const restorable = !!file && BACKUP_LIBRARIES.some((lib) => toRestore.has(lib) && file.entries[lib]);

  const made = file?.created ? new Date(file.created) : null;
  const madeText =
    made && !Number.isNaN(made.getTime())
      ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(made)
      : null;

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
                onChange={(v) => setToSave((s) => toggle(s, lib, v))}
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
            <button onClick={() => void save()} disabled={busy || toSave.size === 0} className={button}>
              {t('backup.save')}
            </button>
          </section>
        )}

        {mode === 'restore' && (
          <section className="space-y-2">
            <p className="leading-snug text-ink-muted">{t('backup.restoreNote')}</p>
            {/* The same list the backup offers, settled by the file: until one
                is open nothing can be chosen, and then the lists it holds start
                ticked and the rest stay off, shown rather than hidden. */}
            {libraries.map((lib) => {
              const held = file?.entries[lib];
              return (
                <Check
                  key={lib}
                  checked={toRestore.has(lib) && !!held}
                  disabled={!held}
                  onChange={(v) => setToRestore((s) => toggle(s, lib, v))}
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
              <button onClick={open.pick} disabled={busy} className={button}>
                {t('backup.open')}
              </button>
              <button onClick={() => void restore()} disabled={busy || !restorable} className={button}>
                {t('backup.restore')}
              </button>
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

        {/* Always mounted, empty until there is something to say (see UpdateToast). */}
        <StatusLine tone="muted">{status}</StatusLine>
      </div>
    </Dialog>
  );
}
