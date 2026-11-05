import { useTranslation } from 'react-i18next';

export interface PartVisibility {
  /** The parts hidden by their own button. */
  hidden: ReadonlySet<string>;
  /** Those plus everything inside them. */
  shownHidden: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onShowAll: () => void;
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
      {crossed && <path d="M3 13 13 3" />}
    </svg>
  );
}

export function PartVisibilityToggle({
  id,
  visibility,
  tabIndex,
}: {
  id: string | undefined;
  visibility: PartVisibility | undefined;
  tabIndex: number;
}) {
  const { t } = useTranslation();
  if (!id || !visibility) return null;
  const own = visibility.hidden.has(id);
  const hidden = visibility.shownHidden.has(id);
  const label = own ? t('tree.showPart') : t('tree.hidePart');
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // don't also select the row
        visibility.onToggle(id);
      }}
      // Hidden by a parent: only that parent's button can bring it back.
      disabled={hidden && !own}
      tabIndex={tabIndex}
      aria-pressed={own}
      aria-label={label}
      title={label}
      className={`shrink-0 rounded px-0.5 hover:bg-elevated hover:text-accent-300 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
        hidden ? 'text-ink-dim' : 'text-ink-faint'
      }`}
    >
      <EyeIcon crossed={hidden} />
    </button>
  );
}

export function HiddenPartsNote({ visibility }: { visibility: PartVisibility }) {
  const { t } = useTranslation();
  if (visibility.shownHidden.size === 0) return null;
  return (
    <div className="mt-2 flex items-start gap-2 border-t border-line/5 px-1 pt-2">
      <p className="min-w-0 flex-1 text-[11px] text-ink-muted">{t('tree.hiddenNote')}</p>
      <button
        type="button"
        onClick={visibility.onShowAll}
        className="shrink-0 whitespace-nowrap rounded-md bg-raised px-2 py-1 text-xs font-medium text-accent-300 ring-1 ring-line/10 hover:bg-elevated"
      >
        {t('tree.showAll')}
      </button>
    </div>
  );
}
