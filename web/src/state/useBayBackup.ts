import { useEffect, useRef } from 'react';
import { useWorkspaceStore, selectDesignName } from './store';
import { hasBayRecords } from '../services/flight/recoveryBays';
import { bayCopyOf, rememberBays, restoreBays, savedBays } from '../services/storage/bayStore';

// Desktop OpenRocket drops the bay element on save, so a browser copy restores it.
export function useBayBackup(): void {
  const tree = useWorkspaceStore((s) => s.tree);
  const name = useWorkspaceStore(selectDesignName);
  const loadedMeta = useWorkspaceStore((s) => s.loadedMeta);
  const written = useRef('');

  useEffect(() => {
    if (!hasBayRecords(tree)) return;
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
      // Not an undo step: it completes the load, as the file would have had desktop kept it.
      useWorkspaceStore.setState({
        tree: restored,
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
