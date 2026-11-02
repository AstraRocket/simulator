import { useEffect, useRef } from 'react';
import { useWorkspaceStore, selectDesignName } from './store';
import { hasBayRecords } from '../services/flight/recoveryBays';
import { bayCopyOf, rememberBays, restoreBays, savedBays } from '../services/storage/bayStore';

/**
 * Keeps the browser's copy of the design's recovery bay records (`bayStore`),
 * and puts them back on a design file that arrives without them.
 *
 * Saved on every change to the records, under the design's name. When a file is
 * opened (`loadedMeta` changes) and none of its tubes carries a record, the copy
 * for its name is put back, as one undo step, and the file's notes say so: the
 * usual way to get here is desktop OpenRocket having saved the file and dropped
 * the element it does not know.
 */
export function useBayBackup(): void {
  const tree = useWorkspaceStore((s) => s.tree);
  const name = useWorkspaceStore(selectDesignName);
  const loadedMeta = useWorkspaceStore((s) => s.loadedMeta);
  const written = useRef('');

  useEffect(() => {
    if (!hasBayRecords(tree)) return;
    // Only on a change to the records themselves, not on every design edit.
    const stamp = `${name}\n${JSON.stringify(bayCopyOf(tree))}`;
    if (stamp === written.current) return;
    written.current = stamp;
    void rememberBays(name, tree);
  }, [tree, name]);

  useEffect(() => {
    if (!loadedMeta) return;
    const s = useWorkspaceStore.getState();
    if (hasBayRecords(s.tree)) return;
    let live = true;
    void savedBays(selectDesignName(s)).then((copy) => {
      if (!live || !copy) return;
      const now = useWorkspaceStore.getState();
      if (now.loadedMeta !== loadedMeta || hasBayRecords(now.tree)) return;
      const { tree: restored, restored: count } = restoreBays(now.tree, copy);
      if (!count) return;
      now.applyTreeAction(() => restored);
      useWorkspaceStore.setState({
        loadedMeta: {
          ...loadedMeta,
          notes: [...loadedMeta.notes, { key: 'recoveryBays.restored', values: { n: count } }],
        },
      });
    });
    return () => {
      live = false;
    };
  }, [loadedMeta]);
}
