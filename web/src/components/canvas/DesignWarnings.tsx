import { useMemo } from 'react';
import { useLauncherT } from '../common/useLauncher';
import { useUnits } from '../../prefs/useUnits';
import { useWorkspaceStore } from '../../state/store';
import { componentName, kernelComponentName, warningText } from '../../services/app/warningText';
import { treeRecoveryDensityOutliers } from '../../services/design/recoveryDensity';

export function DesignWarnings() {
  const t = useLauncherT();
  const u = useUnits();
  const kernel = useWorkspaceStore((s) => s.info?.warningTexts);
  const tree = useWorkspaceStore((s) => s.tree);
  const outliers = useMemo(() => treeRecoveryDensityOutliers(tree), [tree]);
  const texts = [
    ...(kernel ?? []).map((text) => warningText(text, t, (q, si) => u.fmtSym(q, si))),
    ...outliers.map(({ node, material, density }) => {
      const quantity = material === 'surface' ? 'surfaceDensity' : 'lineDensity';
      return t(material === 'surface' ? 'design.surfaceDensityOutlier' : 'design.lineDensityOutlier', {
        part: componentName(kernelComponentName(node), t),
        density: u.fmt(quantity, density),
        unit: u.sym(quantity),
      });
    }),
  ];
  if (!texts.length) return null;

  return (
    <section
      aria-label={t('design.warnings', { count: texts.length })}
      className="mx-3 mb-2 rounded-xl bg-warn-500/10 p-3 ring-1 ring-warn-400/30"
    >
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-warn-200">
        {t('design.warnings', { count: texts.length })}
      </div>
      <ul className="space-y-1">
        {texts.map((text, i) => (
          <li key={`${text}-${i}`} className="flex gap-2 text-xs text-warn-200">
            <span aria-hidden>⚠</span>
            <span className="min-w-0">{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
