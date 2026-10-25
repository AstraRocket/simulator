import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkspaceStore } from '../../state/store';
import { useUnits } from '../../prefs/useUnits';
import { APP_VERSION, designNameOf } from '../../services/app/appInfo';
import type { ExportData } from '../../services/exports/schematicExport';
import { rocketSpanM } from './AftView';

/**
 * The header block the 2D/3D image exports stamp on the page: name, the
 * static numbers, the span, the user's units, the app version, worded in the UI
 * language. The span is measured once here, so the 2D and 3D exports of one
 * rocket print the same figure.
 *
 * `TreeSchematic` and `Rocket3D` show their export buttons only when given
 * `exportData`, so without this hook neither view offers an export.
 */
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
