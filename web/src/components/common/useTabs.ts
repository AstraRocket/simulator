import { useId, type KeyboardEvent } from 'react';

export function useTabs<K extends string>(keys: readonly K[], active: K, select: (key: K) => void) {
  const base = useId();
  const tabId = (key: K) => `${base}-tab-${key}`;
  const panelId = `${base}-panel`;

  const onKeyDown = (e: KeyboardEvent) => {
    const at = keys.indexOf(active);
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? keys[(at + 1) % keys.length]
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? keys[(at - 1 + keys.length) % keys.length]
          : e.key === 'Home'
            ? keys[0]
            : e.key === 'End'
              ? keys[keys.length - 1]
              : undefined;
    if (next === undefined) return;
    e.preventDefault();
    select(next);
    // Every tab is always rendered, so the target exists before the re-render.
    document.getElementById(tabId(next))?.focus();
  };

  return {
    tab: (key: K) => ({
      role: 'tab' as const,
      id: tabId(key),
      'aria-selected': key === active,
      'aria-controls': panelId,
      tabIndex: key === active ? 0 : -1,
      onClick: () => select(key),
      onKeyDown,
    }),
    panel: { role: 'tabpanel' as const, id: panelId, 'aria-labelledby': tabId(active) },
  };
}
