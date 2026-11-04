import { useTranslation } from 'react-i18next';
import { Dialog } from '../common/Dialog';
import { SiteMap } from './SiteMap';

export function SiteMapDialog({
  latitudeDeg,
  longitudeDeg,
  onPick,
  onClose,
}: {
  latitudeDeg: number | null;
  longitudeDeg: number | null;
  onPick: (latitudeDeg: number, longitudeDeg: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog
      id="siteMap"
      title={t('map.title')}
      onClose={onClose}
      // The launch panel may itself be inside a Settings dialog.
      layer="over"
      size="3xl"
      layout="fill"
    >
      <SiteMap latitudeDeg={latitudeDeg} longitudeDeg={longitudeDeg} onPick={onPick} className="m-4 min-h-0 flex-1" />
    </Dialog>
  );
}
