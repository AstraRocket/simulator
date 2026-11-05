import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import {
  canConvertToFreeform,
  canSplit,
  canSplitCluster,
  convertToFreeform,
  resetCluster,
  splitCluster,
  splitInstances,
  splitCount,
} from '../../services/design/componentActions';
import { num } from '../../tree/nodeProps';
import { isFinSet } from '../../tree/tubefins';
import { isAssembly } from '../../tree/assembly';
import { useWorkspaceStore } from '../../state/store';
import { partLabel } from '../../i18n/format';
import { PanelButton } from './PanelButton';

export function ComponentActions({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const apply = useWorkspaceStore((s) => s.applyTreeAction);
  const id = node.id as string;
  const baseName = partLabel(t, node);

  const splitLabel =
    node.type === 'podset' ? 'splitPods' : node.type === 'parallelstage' ? 'splitBoosters' : 'splitFins';

  const buttons: { key: string; label: string; title: string; enabled: boolean; run: () => void }[] = [];

  if (canConvertToFreeform(node)) {
    buttons.push({
      key: 'convert',
      label: t('prop.convertToFreeform'),
      title: t('prop.convertToFreeformTip'),
      enabled: true,
      run: () => apply((tree) => convertToFreeform(tree, id)),
    });
  }
  if (isFinSet(node.type) || isAssembly(node.type)) {
    buttons.push({
      key: 'split',
      label: t(`prop.${splitLabel}`),
      title: canSplit(node) ? t('prop.splitTip', { n: splitCount(node) }) : t('prop.splitNoneTip'),
      enabled: canSplit(node),
      run: () => apply((tree, origins) => splitInstances(tree, id, baseName, origins)),
    });
  }
  if (node.type === 'innertube') {
    buttons.push({
      key: 'splitCluster',
      label: t('prop.splitCluster'),
      title: canSplitCluster(node) ? t('prop.splitClusterTip') : t('prop.splitNoneTip'),
      enabled: canSplitCluster(node),
      run: () => apply((tree, origins) => splitCluster(tree, id, baseName, origins)),
    });
    buttons.push({
      key: 'resetCluster',
      label: t('prop.resetCluster'),
      title: t('prop.resetClusterTip'),
      enabled: canSplitCluster(node) && (num(node, 'clusterScale', 1) !== 1 || num(node, 'clusterRotation', 0) !== 0),
      run: () => apply((tree) => resetCluster(tree, id)),
    });
  }

  if (!buttons.length) return null;
  return (
    <div className="flex flex-wrap gap-2 border-t border-line/5 pt-3">
      {buttons.map((b) => (
        <PanelButton key={b.key} onClick={b.run} disabled={!b.enabled} title={b.title}>
          {b.label}
        </PanelButton>
      ))}
    </div>
  );
}
