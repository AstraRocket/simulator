import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import type { ComponentNode } from '../../engine/openRocketEngine';
import type { TreeCommands } from './useTreeEdit';

export type TreeEdit = TreeCommands & { at?: (id: string) => TreeCommands };

function collectVisibleIds(
  nodes: ComponentNode[],
  collapsed: ReadonlySet<string>,
  selectable: boolean,
  out: string[],
): string[] {
  for (const n of nodes) {
    const nid = typeof n.id === 'string' ? n.id : undefined;
    if (nid && selectable) out.push(nid);
    const hasKids = (n.children?.length ?? 0) > 0;
    const isCollapsed = hasKids && !!nid && collapsed.has(nid);
    if (!isCollapsed) collectVisibleIds(n.children ?? [], collapsed, selectable, out);
  }
  return out;
}

// On the focused row, not the selection. Scoped to the tree so text fields keep copy and paste.
function runClipboardKey(e: KeyboardEvent<HTMLDivElement>, rowEl: HTMLElement, edit?: TreeEdit): boolean {
  if (!edit || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
  const focusedId = rowEl.getAttribute('data-id');
  const on = (focusedId && edit.at?.(focusedId)) || edit;
  const command = { x: on.cut, c: on.copy, v: on.paste, d: on.duplicate }[e.key.toLowerCase()];
  if (!command) return false;
  e.preventDefault();
  if (command.enabled) command.run();
  return true;
}

/** Roving focus across the visible rows, the arrow keys, and focus restored after an edit replaces a row. */
export function useTreeNavigation({
  components,
  selectedId,
  selectable,
  collapsed,
  toggleCollapse,
  edit,
}: {
  components: ComponentNode[];
  selectedId?: string | null;
  selectable: boolean;
  collapsed: ReadonlySet<string>;
  toggleCollapse: (id: string) => void;
  edit?: TreeEdit;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const orderedIds = useMemo(
    () => collectVisibleIds(components, collapsed, selectable, []),
    [components, collapsed, selectable],
  );
  const tabbableId =
    (activeId && orderedIds.includes(activeId) && activeId) ||
    (selectedId && orderedIds.includes(selectedId) && selectedId) ||
    orderedIds[0] ||
    null;

  // Cut, undo and redo replace the focused row, dropping focus to the body; the effect restores it.
  const ownsFocus = useRef(false);
  const onTreeFocus = () => {
    ownsFocus.current = true;
  };
  const onTreeBlur = (e: FocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget as Node | null;
    if (to) {
      if (!listRef.current?.contains(to)) ownsFocus.current = false;
      return;
    }
    // A row still in the page means the user clicked away; a removed row means focus was lost.
    const from = e.target;
    setTimeout(() => {
      if (from.isConnected) ownsFocus.current = false;
    }, 0);
  };
  const focusTarget = (selectedId && orderedIds.includes(selectedId) && selectedId) || tabbableId;
  const lastSelected = useRef(selectedId);
  useEffect(() => {
    const selectionMoved = lastSelected.current !== selectedId;
    lastSelected.current = selectedId;
    if (!ownsFocus.current || !focusTarget) return;
    const active = document.activeElement;
    const lost = !active || active === document.body;
    const onRow = !!active && !!listRef.current?.contains(active);
    if (!lost && !(onRow && selectionMoved)) return;
    const row = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-tree-row]') ?? []).find(
      (el) => el.getAttribute('data-id') === focusTarget,
    );
    if (!row || row === active) return;
    row.focus();
    setActiveId(focusTarget);
  }, [orderedIds, focusTarget, selectedId]);

  const onTreeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rowEl = (e.target as HTMLElement).closest<HTMLElement>('[data-tree-row]');
    if (!rowEl || !listRef.current?.contains(rowEl)) return;
    // Arrows inside a row's export menu belong to that menu.
    if (e.target !== rowEl) return;
    if (runClipboardKey(e, rowEl, edit)) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-tree-row]'));
    const idx = rows.indexOf(rowEl);
    if (idx < 0) return;
    const move = (to?: HTMLElement) => {
      if (!to) return;
      e.preventDefault();
      to.focus();
      const rid = to.getAttribute('data-id');
      if (rid) setActiveId(rid);
    };
    const rid = rowEl.getAttribute('data-id');
    const hasKids = rowEl.getAttribute('data-haskids') === '1';
    const isCollapsed = rowEl.getAttribute('data-collapsed') === '1';
    switch (e.key) {
      case 'ArrowDown':
        move(rows[idx + 1]);
        break;
      case 'ArrowUp':
        move(rows[idx - 1]);
        break;
      case 'Home':
        move(rows[0]);
        break;
      case 'End':
        move(rows[rows.length - 1]);
        break;
      case 'ArrowRight':
        if (rid && hasKids && isCollapsed) {
          e.preventDefault();
          toggleCollapse(rid);
        } else move(rows[idx + 1]);
        break;
      case 'ArrowLeft':
        if (rid && hasKids && !isCollapsed) {
          e.preventDefault();
          toggleCollapse(rid);
        } else move(rows[idx - 1]);
        break;
    }
  };

  return { listRef, tabbableId, onTreeFocus, onTreeBlur, onTreeKeyDown };
}
