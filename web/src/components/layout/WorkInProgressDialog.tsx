import { useTranslation } from 'react-i18next';
import { appName, isPreRelease } from '../../services/app/appInfo';
import { useSettings } from '../../state/SettingsProvider';
import { AlertDialog } from '../common/AlertDialog';

export function WorkInProgressDialog() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();

  if (!isPreRelease() || settings.wipAcknowledged) return null;

  return (
    <AlertDialog
      title={t('wip.title')}
      message={t('wip.body', { name: appName() })}
      icon="🚧"
      size="md"
      layer="over"
      confirmLabel={t('wip.accept')}
      onConfirm={() => update({ wipAcknowledged: true })}
    />
  );
}
