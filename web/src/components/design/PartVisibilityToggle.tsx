import { useTranslation } from 'react-i18next';
import { smallButton } from '../common/smallButton';

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
  // Hidden by a parent: this button can do nothing, so it says why rather than offering to hide.
  const inherited = hidden && !own;
  const label = own ? t('tree.showPart') : inherited ? t('tree.hiddenByParent') : t('tree.hidePart');
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // don't also select the row
        visibility.onToggle(id);
      }}
      // Only the parent's button can bring it back.
      disabled={inherited}
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
        className={smallButton('xs', 'accent', 'shrink-0 whitespace-nowrap')}
      >
        {t('tree.showAll')}
      </button>
    </div>
  );
}
