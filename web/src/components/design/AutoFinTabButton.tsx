import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { autoFinTab, canAutoFinTab } from '../../services/design/finTabAuto';
import { findParent, updateNode } from '../../services/design/treeEdit';
import { useWorkspaceStore } from '../../state/store';
import { PanelButton } from './PanelButton';

export function AutoFinTabButton({ node }: { node: ComponentNode }) {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const apply = useWorkspaceStore((s) => s.applyTreeAction);
  const id = node.id as string;
  if (!canAutoFinTab(node, findParent(tree, id))) return null;
  return (
    <PanelButton
      onClick={() =>
        apply((t0) => {
          const patch = autoFinTab(t0, id);
          return patch ? updateNode(t0, id, patch) : t0;
        })
      }
      title={t('prop.autoFinTabTip')}
    >
      {t('prop.autoFinTab')}
    </PanelButton>
  );
}
