import { useTranslation } from 'react-i18next';
import { APP_VERSION, isPreRelease } from '../../services/app/appInfo';
import { useWorkspaceStore } from '../../state/store';
import { fireAction } from '../../state/fireAction';
import { useHelpStore } from '../../state/helpStore';
import { LanguageSwitcher } from './LanguageSwitcher';
import { WorkbenchTabs } from './WorkbenchTabs';
import { HeaderSummary } from './HeaderSummary';
import { EngineBadge } from './EngineBadge';
import { SaveStatus } from './SaveStatus';
import { UndoRedoButtons } from './UndoRedoButtons';
import { DaylightToggle } from './DaylightToggle';
import { FileMenuButton } from './FileMenu';
import { useHeaderDialogs } from './HeaderDialogs';
import { useUndoShortcuts } from './useUndoShortcuts';
import { useFilePick } from '../common/useFilePick';

export function AppHeader() {
  const { t } = useTranslation();
  const canSave = useWorkspaceStore((s) => !!s.info);
  const onNew = useWorkspaceStore((s) => s.newWorkspace);
  const onOpenFile = useWorkspaceStore((s) => s.openOrkFile);
  const onSave = useWorkspaceStore((s) => s.saveOrk);
  const refreshDesigns = useWorkspaceStore((s) => s.refreshDesigns);
  const onSaveRasaero = useWorkspaceStore((s) => s.saveRasaero);
  const onExportJson = useWorkspaceStore((s) => s.exportJson);
  const onSaveRkt = useWorkspaceStore((s) => s.saveRkt);
  const openFile = (f: File) => fireAction(onOpenFile(f));
  const ork = useFilePick({ accept: '.ork', onFile: openFile });
  const rkt = useFilePick({ accept: '.rkt', onFile: openFile });
  const { open, dialogs } = useHeaderDialogs();
  const openHelp = useHelpStore((s) => s.openHelp);

  useUndoShortcuts();

  return (
    // flex-wrap: a fixed row overflows a phone and scrolls the page sideways.
    <header className="flex flex-wrap items-center gap-1.5 border-b border-line/10 px-4 py-3 lg:gap-1 xl:gap-2">
      <button
        onClick={() => open('about')}
        title={t('about.open')}
        aria-label={t('about.open')}
        className="shrink-0 rounded hover:opacity-80"
      >
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" aria-hidden="true" className="h-6 w-6" />
      </button>
      <h1 className="text-base font-semibold tracking-tight">{t('app.title')}</h1>
      <span className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-none ring-1 ring-line/10">
        <button
          onClick={() => open('about')}
          title={t('about.open')}
          className="font-medium tabular-nums text-ink-faint hover:text-accent-400"
        >
          v{APP_VERSION}
        </button>
        {isPreRelease() && (
          <span title={t('about.wip')} className="text-[9px] font-semibold uppercase tracking-wide text-warn-300">
            {t('wip.badge')}
          </span>
        )}
        <EngineBadge />
      </span>
      <SaveStatus />

      <WorkbenchTabs />
      <HeaderSummary />

      <div className="ml-auto flex shrink-0 items-center gap-1.5 lg:gap-1 xl:gap-2">
        <UndoRedoButtons />
        <DaylightToggle />
        <LanguageSwitcher />
        <FileMenuButton
          canSave={canSave}
          actions={{
            // Through `fireAction`: a promise in a `() => void` slot would lose its failure.
            onNew: () => fireAction(onNew()),
            onOpenLibrary: () => open('library'),
            onSaveAs: () => {
              fireAction(refreshDesigns());
              open('saveAs');
            },
            onImportOrk: ork.pick,
            onImportRkt: rkt.pick,
            onImportExamples: () => open('examples'),
            onExportOrk: () => fireAction(onSave()),
            onExportRkt: () => fireAction(onSaveRkt()),
            onExportPrint: () => open('print'),
            onExportRasaero: () => fireAction(onSaveRasaero()),
            onExportJson: () => fireAction(onExportJson()),
            onReport: () => open('report'),
            onMotors: () => open('motors'),
            onLaunchLocations: () => open('locations'),
            onSavedParts: () => open('parts'),
            onMyMaterials: () => open('materials'),
            onBackup: () => open('backup'),
            onRestore: () => open('restore'),
            onSettings: () => open('settings'),
            onHelp: () => openHelp(),
            onSafety: () => openHelp('safety'),
            onPrivacy: () => open('privacy'),
            onCheckUpdates: () => open('updates'),
            onAbout: () => open('about'),
          }}
        />
      </div>

      {ork.input}
      {rkt.input}
      {dialogs}
    </header>
  );
}
