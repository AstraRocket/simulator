import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCanBuildDesign } from '../design/useCanBuildDesign';
import { useMenuPopover } from '../common/useMenuPopover';
import { useOnline } from '../common/useOnline';
import { useCapability } from '../common/useMediaQuery';
import { useUpdateStore } from '../../state/updateStore';

const item =
  'flex w-full items-center px-3 py-2 text-left text-xs font-medium text-ink hover:bg-elevated aria-disabled:cursor-not-allowed aria-disabled:text-ink-dim aria-disabled:hover:bg-transparent';
const subItem =
  'flex w-full items-center py-2 pl-8 pr-3 text-left text-xs font-medium text-ink hover:bg-elevated aria-disabled:cursor-not-allowed aria-disabled:text-ink-dim aria-disabled:hover:bg-transparent';
const separator = <div role="separator" className="my-1 border-t border-line/10" />;

const laidOut = (el: HTMLElement): boolean => el.offsetParent !== null;

export interface FileMenuActions {
  onNew: () => void;
  onOpenLibrary: () => void;
  onSaveAs: () => void;
  onImportOrk: () => void;
  onImportRkt: () => void;
  onImportExamples: () => void;
  onExportOrk: () => void;
  onExportRkt: () => void;
  onExportPrint: () => void;
  onExportRasaero: () => void;
  onExportJson: () => void;
  onReport: () => void;
  onMotors: () => void;
  onLaunchLocations: () => void;
  onSavedParts: () => void;
  onMyMaterials: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onSafety: () => void;
  onPrivacy: () => void;
  onCheckUpdates: () => void;
  onAbout: () => void;
}

function MenuItem({
  sub,
  label,
  title,
  expanded,
  disabled,
  onClick,
  children,
}: {
  sub?: boolean;
  label?: string;
  title?: string;
  expanded?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const submenu = expanded !== undefined;
  // aria-disabled, not `disabled`, so the item stays in arrow-key order.
  const reasonId = useId();
  const reason = disabled && title ? title : undefined;
  return (
    <button
      role="menuitem"
      tabIndex={-1}
      className={sub ? subItem : item}
      aria-label={label}
      title={title}
      aria-haspopup={submenu ? 'true' : undefined}
      aria-expanded={expanded}
      aria-disabled={disabled || undefined}
      aria-describedby={reason ? reasonId : undefined}
      onClick={disabled ? undefined : onClick}
    >
      {/* Hidden keeps it out of the name; a description may still reference hidden text. */}
      {reason && (
        <span id={reasonId} hidden>
          {reason}
        </span>
      )}
      {submenu ? (
        <>
          <span className="flex-1">{children}</span>
          <span aria-hidden className="text-ink-muted">
            {expanded ? '▾' : '▸'}
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Submenus expand inline: a flyout would be clipped by overflow-hidden. */
function FileMenu({
  canSave,
  onClose,
  menuRef,
  onMenuKeyDown,
  actions,
}: {
  canSave: boolean;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  onMenuKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void;
  actions: FileMenuActions;
}) {
  const { t } = useTranslation();
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const canBuild = useCanBuildDesign();
  const updateChecker = useUpdateStore((s) => s.checker);
  const online = useOnline();
  const can = useCapability();

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div // eslint-disable-line jsx-a11y-x/interactive-supports-focus -- roving tabindex: focus moves to the items, as in the ARIA menu pattern, so the container is not
      ref={menuRef}
      role="menu"
      onKeyDown={onMenuKeyDown}
      className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg bg-raised py-1 shadow-xl ring-1 ring-line/10"
    >
      <MenuItem onClick={run(actions.onNew)}>{t('file.new')}</MenuItem>
      <MenuItem onClick={run(actions.onOpenLibrary)}>{t('file.openLibrary')}</MenuItem>
      <MenuItem disabled={!canSave} onClick={run(actions.onSaveAs)}>
        {t('file.saveAs')}
      </MenuItem>
      {separator}
      <MenuItem expanded={importOpen} onClick={() => setImportOpen((o) => !o)}>
        {t('file.import')}
      </MenuItem>
      {importOpen && (
        <MenuItem sub label={t('file.importOrkLabel')} onClick={run(actions.onImportOrk)}>
          {t('file.importOrk')}
        </MenuItem>
      )}
      {importOpen && can('import:rocksim') && (
        <MenuItem sub label={t('file.importRktLabel')} onClick={run(actions.onImportRkt)}>
          {t('file.importRkt')}
        </MenuItem>
      )}
      {importOpen && (
        <MenuItem sub label={t('file.importExamplesLabel')} onClick={run(actions.onImportExamples)}>
          {t('file.importExamples')}
        </MenuItem>
      )}
      {importOpen && (
        <MenuItem sub label={t('file.importBackupLabel')} onClick={run(actions.onRestore)}>
          {t('file.backup')}
        </MenuItem>
      )}
      <MenuItem expanded={exportOpen} onClick={() => setExportOpen((o) => !o)}>
        {t('file.export')}
      </MenuItem>
      {exportOpen && (
        <MenuItem sub label={t('file.exportOrkLabel')} disabled={!canSave} onClick={run(actions.onExportOrk)}>
          {t('file.exportOrk')}
        </MenuItem>
      )}
      {exportOpen && can('export:rocksim') && (
        <MenuItem sub label={t('file.exportRktLabel')} disabled={!canSave} onClick={run(actions.onExportRkt)}>
          {t('file.exportRkt')}
        </MenuItem>
      )}
      {exportOpen && can('export:print3mf') && (
        <MenuItem sub label={t('file.exportPrintLabel')} disabled={!canSave} onClick={run(actions.onExportPrint)}>
          {t('file.exportPrint')}
        </MenuItem>
      )}
      {exportOpen && can('export:rasaero') && (
        <MenuItem sub disabled={!canSave} onClick={run(actions.onExportRasaero)}>
          {t('file.rasaero')}
        </MenuItem>
      )}
      {exportOpen && can('export:onshapeJson') && (
        <MenuItem sub label={t('file.exportJsonLabel')} disabled={!canSave} onClick={run(actions.onExportJson)}>
          {t('file.exportJson')}
        </MenuItem>
      )}
      {exportOpen && (
        <MenuItem sub label={t('file.exportBackupLabel')} onClick={run(actions.onBackup)}>
          {t('file.backup')}
        </MenuItem>
      )}
      <MenuItem disabled={!canSave} onClick={run(actions.onReport)}>
        {t('file.report')}
      </MenuItem>
      {separator}
      <MenuItem onClick={run(actions.onMotors)}>{t('dash.menu')}</MenuItem>
      <MenuItem onClick={run(actions.onLaunchLocations)}>{t('location.menu')}</MenuItem>
      {canBuild && <MenuItem onClick={run(actions.onSavedParts)}>{t('picker.savedManage')}</MenuItem>}
      {canBuild && <MenuItem onClick={run(actions.onMyMaterials)}>{t('myMaterials.title')}</MenuItem>}
      {separator}
      <MenuItem onClick={run(actions.onSettings)}>{t('settings.title')}</MenuItem>
      <MenuItem onClick={run(actions.onHelp)}>{t('menu.help')}</MenuItem>
      <MenuItem onClick={run(actions.onSafety)}>{t('menu.safety')}</MenuItem>
      {separator}
      <MenuItem onClick={run(actions.onPrivacy)}>{t('about.privacy')}</MenuItem>
      <MenuItem
        disabled={!updateChecker || !online}
        title={!updateChecker ? t('update.checkUnavailable') : online ? undefined : t('common.needsConnection')}
        onClick={run(actions.onCheckUpdates)}
      >
        {t('update.check')}
      </MenuItem>
      <MenuItem onClick={run(actions.onAbout)}>{t('about.open')}</MenuItem>
    </div>
  );
}

export function FileMenuButton({ canSave, actions }: { canSave: boolean; actions: FileMenuActions }) {
  const { t } = useTranslation();
  const {
    open: menuOpen,
    toggle,
    closeAndRestore,
    wrapRef,
    triggerRef,
    menuRef,
    onMenuKeyDown,
  } = useMenuPopover({
    shown: laidOut,
  });

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        title={t('menu.open')}
        className="flex items-center gap-1.5 rounded-lg bg-raised px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-line/10 hover:bg-elevated"
      >
        <span aria-hidden>☰</span> <span className="hidden 2xl:inline">{t('menu.open')}</span>
      </button>
      {menuOpen && (
        <FileMenu
          canSave={canSave}
          onClose={closeAndRestore}
          menuRef={menuRef}
          onMenuKeyDown={onMenuKeyDown}
          actions={actions}
        />
      )}
    </div>
  );
}
