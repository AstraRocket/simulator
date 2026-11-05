import { useTranslation } from 'react-i18next';
import { useWorkspaceStore, selectActive } from '../../state/store';
import { resultFlight } from '../../services/flight/simulations';
import { useMenuPopover } from '../common/useMenuPopover';

export function ResultPicker({ fallbackName }: { fallbackName: string }) {
  const { t } = useTranslation();
  const sims = useWorkspaceStore((s) => s.sims);
  const activeId = useWorkspaceStore((s) => selectActive(s).id);
  const chosen = useWorkspaceStore((s) => s.resultSimId);
  const lastRunIds = useWorkspaceStore((s) => s.lastRunIds);
  const setChosen = useWorkspaceStore((s) => s.setResultSimId);
  const { open, toggle, closeAndRestore, wrapRef, triggerRef, menuRef, onMenuKeyDown } = useMenuPopover();

  const ran = lastRunIds
    .map((id) => sims.find((x) => x.id === id))
    .filter((x): x is NonNullable<typeof x> => !!x?.result);
  const shown = resultFlight(sims, chosen, activeId);
  const name = shown?.name ?? sims.find((s) => s.id === activeId)?.name ?? fallbackName;

  if (ran.length < 2) return <h2 className="text-sm font-semibold text-ink-strong">{name}</h2>;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <h2>
        <button
          ref={triggerRef}
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('flight.pickAria', { name })}
          title={t('flight.pickTitle')}
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-sm font-semibold text-ink-strong hover:bg-raised"
        >
          {name}
          <span aria-hidden className="text-[9px] text-ink-muted">
            ▼
          </span>
        </button>
      </h2>
      {open && (
        <div // eslint-disable-line jsx-a11y-x/interactive-supports-focus -- roving tabindex: focus moves to the items, as in the ARIA menu pattern, so the container is not
          role="menu"
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 z-50 mt-1 min-w-48 rounded-lg bg-surface p-1.5 shadow-xl ring-1 ring-line/15"
        >
          {ran.map((s) => {
            const on = s.id === shown?.id;
            return (
              <button
                key={s.id}
                role="menuitemradio"
                aria-checked={on}
                tabIndex={-1}
                onClick={() => {
                  setChosen(s.id);
                  closeAndRestore();
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-raised ${
                  on ? 'text-accent-200' : 'text-ink'
                }`}
              >
                <span aria-hidden className="w-3 shrink-0 text-[10px]">
                  {on ? '✓' : ''}
                </span>
                <span className="flex-1 truncate">{s.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
