import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { selectDesignName } from '../../state/workspaceSelectors';
import { fireAction } from '../../state/fireAction';
import { LazyBoundary } from '../common/ErrorBoundary';
import { lazyNamed } from '../common/lazyNamed';
import { DesignLibraryDialog } from './DesignLibraryDialog';
import { DesignPropertiesDialog } from './DesignPropertiesDialog';
import { ExamplesDialog } from './ExamplesDialog';
import { AboutDialog } from './AboutDialog';
import { UpdateCheckDialog } from './UpdateCheckDialog';
// Lazy: a static import would pin reportModel into the main bundle (INEFFECTIVE_DYNAMIC_IMPORT).
const ExportDialog = lazyNamed(() => import('../report/ExportDialog'), 'ExportDialog');
import { PrintExportDialog } from '../report/PrintExportDialog';
import { HelpDialog } from './HelpDialog';
import { PrivacyDialog } from './PrivacyDialog';
import { SettingsDialog } from './SettingsDialog';
import { MotorDashboard } from '../sim/MotorDashboard';
import { LocationsDialog } from '../sim/LocationsDialog';
import { SavedPartsDialog } from '../design/SavedPartsDialog';
import { MyMaterialsDialog } from '../design/MyMaterialsDialog';
import { BackupDialog } from './BackupDialog';
import { useHelpStore } from '../../state/helpStore';
import type { HeaderDialog } from './dialogKeys';
import type { OpenFlags } from './useHeaderDialogs';

// Mounted only while open: a closed dialog must run no effects and keep no state.
export function HeaderDialogs({ flags, onClose }: { flags: OpenFlags; onClose: (id: HeaderDialog) => void }) {
  const { t } = useTranslation();
  const helpPage = useHelpStore((s) => s.page);
  const closeHelp = useHelpStore((s) => s.closeHelp);
  const saveDesignAs = useWorkspaceStore((s) => s.saveDesignAs);
  const designs = useWorkspaceStore((s) => s.designs);
  const designName = useWorkspaceStore(selectDesignName);

  return (
    <>
      {flags.motors && <MotorDashboard onClose={() => onClose('motors')} />}
      {flags.report && (
        <LazyBoundary fallback={null}>
          <ExportDialog onClose={() => onClose('report')} />
        </LazyBoundary>
      )}
      {flags.about && <AboutDialog onClose={() => onClose('about')} />}
      {flags.updates && <UpdateCheckDialog onClose={() => onClose('updates')} />}
      {flags.privacy && <PrivacyDialog onClose={() => onClose('privacy')} />}
      {/* '' is the docs index, so not a truthiness check. */}
      {helpPage !== null && <HelpDialog key={helpPage} page={helpPage} onClose={closeHelp} />}
      {flags.settings && <SettingsDialog onClose={() => onClose('settings')} />}
      {flags.library && <DesignLibraryDialog onClose={() => onClose('library')} />}
      {flags.examples && <ExamplesDialog onClose={() => onClose('examples')} />}
      {flags.print && <PrintExportDialog onClose={() => onClose('print')} />}
      {flags.locations && <LocationsDialog onClose={() => onClose('locations')} />}
      {flags.parts && <SavedPartsDialog onClose={() => onClose('parts')} />}
      {flags.materials && <MyMaterialsDialog onClose={() => onClose('materials')} />}
      {flags.backup && <BackupDialog mode="backup" onClose={() => onClose('backup')} />}
      {flags.restore && <BackupDialog mode="restore" onClose={() => onClose('restore')} />}
      {flags.saveAs && (
        <DesignPropertiesDialog
          title={t('file.saveAs')}
          confirmLabel={t('common.save')}
          initialName={designName}
          takenNames={designs.map((d) => d.name)}
          onCancel={() => onClose('saveAs')}
          onConfirm={(name) => {
            onClose('saveAs');
            fireAction(saveDesignAs(name));
          }}
        />
      )}
    </>
  );
}
