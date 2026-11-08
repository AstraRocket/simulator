import { useMemo, useState } from 'react';
import { useWorkspaceStore } from '../../state/store';
import { hiddenPartIds } from '../../tree/partVisibility';
import { ComponentTree } from './ComponentTree';
import { DesignNotesSection } from './DesignNotesSection';
import { ScaleDialog } from './ScaleDialog';
import { useTreeEdit } from './useTreeEdit';

export function TreePanel() {
  const tree = useWorkspaceStore((s) => s.tree);
  const selectedId = useWorkspaceStore((s) => s.selectedId);
  const onSelect = useWorkspaceStore((s) => s.setSelectedId);
  const onAdd = useWorkspaceStore((s) => s.addPartToTree);
  const onAddStage = useWorkspaceStore((s) => s.addStageToTree);
  const hidden = useWorkspaceStore((s) => s.hiddenParts);
  const onToggle = useWorkspaceStore((s) => s.toggleHiddenPart);
  const onShowAll = useWorkspaceStore((s) => s.showAllParts);
  const visibility = useMemo(
    () => ({ hidden, shownHidden: hiddenPartIds(tree.components, hidden), onToggle, onShowAll }),
    [hidden, tree.components, onToggle, onShowAll],
  );
  const [scaleOpen, setScaleOpen] = useState(false);
  const edit = useTreeEdit();

  return (
    <div className="space-y-4 p-2">
      <DesignNotesSection />
      <ComponentTree
        tree={tree}
        selectedId={selectedId}
        onSelect={onSelect}
        onAdd={onAdd}
        onScale={() => setScaleOpen(true)}
        onAddStage={onAddStage}
        edit={edit}
        visibility={visibility}
      />
      {/* Mounted only while open: the factor resets by unmount. */}
      {scaleOpen && <ScaleDialog onClose={() => setScaleOpen(false)} />}
    </div>
  );
}
