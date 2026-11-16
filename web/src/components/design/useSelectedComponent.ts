import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode } from '../../engine/openRocketEngine';
import { findMounts, findNode, findParent, hasCatalog, siblingIndex } from '../../services/design/treeEdit';
import { stageNodes } from '../../tree/treeWalk';
import { fitContextFor } from '../../services/parts/componentFit';
import { useWorkspaceStore } from '../../state/store';
import { confirm, confirmDelete } from '../../state/confirmStore';
import { bodyTubeRadius, num } from '../../tree/nodeProps';
import { partLabel } from '../../i18n/format';
import { overriddenBy, type OverrideKind } from '../../services/design/overriddenBy';
import { hasStageBelow } from '../../services/design/fieldRange';

export function useSelectedComponent() {
  const { t } = useTranslation();
  const tree = useWorkspaceStore((s) => s.tree);
  const selectedId = useWorkspaceStore((s) => s.selectedId);
  const patch = useWorkspaceStore((s) => s.patchSelected);
  const onCommit = useWorkspaceStore((s) => s.commitEdit);
  const remove = useWorkspaceStore((s) => s.removeSelected);
  const onMove = useWorkspaceStore((s) => s.moveSelected);

  const node = useMemo(() => (selectedId ? findNode(tree, selectedId) : null), [tree, selectedId]);
  const parentRadius = useMemo(() => {
    if (node?.type !== 'tubefinset' || !selectedId) return 0;
    const parent = findParent(tree, selectedId);
    if (!parent) return 0;
    return parent.type === 'bodytube' ? bodyTubeRadius(parent) : num(parent, 'outerRadius');
  }, [tree, selectedId, node]);
  const sib = useMemo(() => (selectedId ? siblingIndex(tree, selectedId) : null), [tree, selectedId]);
  const fit = useMemo(
    () => (node && hasCatalog(node.type) ? fitContextFor(tree, selectedId) : undefined),
    [tree, selectedId, node],
  );

  const isOnlyMount = !!node && node.motorMount === true && findMounts(tree).length === 1;
  const stages = stageNodes(tree);
  const isOnlyStage = !!node && node.type === 'stage' && stages.length <= 1;
  const isFirstStage = !!node && node.type === 'stage' && stages[0]?.id === node.id;
  const stageBelow = !!selectedId && hasStageBelow(tree, selectedId);
  const coveredBy = useMemo(() => {
    const out: Partial<Record<OverrideKind, string>> = {};
    if (!selectedId) return out;
    for (const kind of ['mass', 'cg', 'cd'] as const) {
      const by = overriddenBy(tree, selectedId, kind);
      if (by) out[kind] = partLabel(t, by);
    }
    return out;
  }, [tree, selectedId, t]);

  const onRemove = async () => {
    if (!node || isOnlyStage) return;
    const label = partLabel(t, node);
    const message = isOnlyMount ? t('warn.lastMountDelete') : t('warn.deletePart', { name: label });
    if (!(await confirmDelete(message))) return;
    remove();
  };
  const onChange = async (p: Partial<ComponentNode>) => {
    if (p.motorMount === false && isOnlyMount) {
      if (!(await confirm({ message: t('warn.lastMountDisable'), danger: true }))) return;
      // The checkbox closed its undo entry before the confirm resolved, so this closes its own.
      patch(p);
      onCommit();
      return;
    }
    patch(p);
  };

  return {
    node,
    onChange,
    onCommit,
    onRemove,
    onMove,
    canMoveUp: !!sib && sib.index > 0,
    canMoveDown: !!sib && sib.index < sib.count - 1,
    canRemove: !isOnlyStage,
    isFirstStage,
    coveredBy,
    parentRadius,
    fit,
    stageBelow,
  };
}
