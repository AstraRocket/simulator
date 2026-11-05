import { useState } from 'react';
import { useSettings } from '../../state/useSettings';

/** The saved pane widths, or the width being dragged. */
export function usePaneWidths() {
  const { settings, update } = useSettings();
  const [dragTree, setDragTree] = useState<number | null>(null);
  const [dragSide, setDragSide] = useState<number | null>(null);
  const treeW = dragTree ?? settings.treePaneWidth;
  const sideW = dragSide ?? settings.sidePaneWidth;
  return {
    treeW,
    sideW,
    onDragTree: setDragTree,
    onCommitTree: (w: number) => {
      setDragTree(null);
      update({ treePaneWidth: w });
    },
    onDragSide: setDragSide,
    onCommitSide: (w: number) => {
      setDragSide(null);
      update({ sidePaneWidth: w });
    },
  };
}
