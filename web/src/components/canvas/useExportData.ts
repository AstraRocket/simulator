import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { selectDesignName, useWorkspaceStore } from '../../state/store';
import { useUnits } from '../../prefs/useUnits';
import { APP_VERSION } from '../../services/app/appInfo';
import type { ExportData } from '../../services/exports/schematicExport';
import { rocketSpanM } from './aftScene';

export function useExportData(motors: object): ExportData {
  const name = useWorkspaceStore(selectDesignName);
  const components = useWorkspaceStore((s) => s.tree.components);
  const spanM = useMemo(() => rocketSpanM(components), [components]);
  const info = useWorkspaceStore((s) => s.info);
  const units = useUnits();
  const { t } = useTranslation();
  return useMemo(
    () => ({
      name,
      info,
      spanM,
      units: units.all,
      withMotors: Object.keys(motors).length > 0,
      appVersion: APP_VERSION,
      t,
    }),
    [name, info, spanM, units.all, motors, t],
  );
}
