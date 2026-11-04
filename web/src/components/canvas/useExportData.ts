import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useUnits } from '../../prefs/useUnits';
import { APP_VERSION, designNameOf } from '../../services/app/appInfo';
import type { ExportData } from '../../services/exports/schematicExport';
import { rocketSpanM } from './AftView';

export function useExportData(motors: object): ExportData {
  const loadedMeta = useWorkspaceStore((s) => s.loadedMeta);
  const treeName = useWorkspaceStore((s) => s.tree.name);
  const components = useWorkspaceStore((s) => s.tree.components);
  const spanM = useMemo(() => rocketSpanM(components), [components]);
  const info = useWorkspaceStore((s) => s.info);
  const units = useUnits();
  const { t } = useTranslation();
  return useMemo(
    () => ({
      name: designNameOf({ name: treeName }, loadedMeta),
      info,
      spanM,
      units: units.all,
      withMotors: Object.keys(motors).length > 0,
      appVersion: APP_VERSION,
      t,
    }),
    [loadedMeta, treeName, info, spanM, units.all, motors, t],
  );
}
