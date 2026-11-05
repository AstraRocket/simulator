import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusTrap } from './useFocusTrap';
import { useBackdropDismiss } from './useBackdropDismiss';
import { layerClass, readExpanded, sizeClasses, writeExpanded, type DialogLayer, type DialogSize } from './dialogSize';

/** `fill` gives the panel a definite height, since a `flex-1` child of an auto-height parent collapses. */
export function Dialog({
  id,
  title,
  name,
  eyebrow,
  onClose,
  size = 'lg',
  height,
  layer = 'base',
  layout = 'scroll',
  expandable = true,
  dismissible = true,
  fullBleed = true,
  leading,
  actions,
  toolbar,
  footer,
  children,
}: {
  id: string;
  title: string;
  /** For a heading that is content, not a label; never an `aria-label` repeating the heading. */
  name?: string;
  eyebrow?: string;
  onClose: () => void;
  size?: DialogSize;
  height?: number;
  layer?: DialogLayer;
  layout?: 'scroll' | 'pad' | 'fill';
  expandable?: boolean;
  /** Suppresses Escape and the backdrop only; the ✕ still closes. */
  dismissible?: boolean;
  fullBleed?: boolean | 'xl';
  leading?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  // On the panel, not the overlay, so role/aria-modal land on the named element.
  const panelRef = useFocusTrap<HTMLDivElement>(true, { onEscape: dismissible ? onClose : undefined });
  const backdrop = useBackdropDismiss(dismissible ? onClose : undefined);
  const headingId = useId();
  const [expanded, setExpanded] = useState(() => readExpanded(id));
  const toggleExpanded = () => {
    const next = !expanded;
    setExpanded(next);
    writeExpanded(id, next);
  };

  return (
    <div
      className={`dialog-overlay ${fullBleed === 'xl' ? 'dialog-overlay-xl' : ''} fixed inset-0 ${layerClass[layer]} flex items-center justify-center bg-shade/60 p-4`}
      {...backdrop}
    >
      <div // eslint-disable-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions -- a backdrop click is the mouse twin of Escape, which the focus trap handles; the panel only stops that click
        ref={panelRef}
        // Read by useUndoShortcuts.
        data-dialog={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={name === undefined ? headingId : undefined}
        aria-label={name}
        className={`${fullBleed ? 'dialog-panel' : ''} ${fullBleed === 'xl' ? 'dialog-panel-xl' : ''} flex w-full flex-col overflow-hidden rounded-xl bg-surface ring-1 ring-line/10 ${sizeClasses(size, expanded, layout === 'fill' && height === undefined)} ${height === undefined ? '' : 'h-[var(--dialog-height)]'}`}
        // A custom property, not an inline `height`, which would beat the full-bleed phone rule.
        style={height === undefined ? undefined : ({ '--dialog-height': `${height}px` } as CSSProperties)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line/10 p-3">
          {leading}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="truncate text-[11px] font-semibold uppercase tracking-wider text-warn-300">{eyebrow}</div>
            )}
            <h2
              id={headingId}
              className={`truncate font-semibold text-ink ${layout === 'scroll' ? 'text-sm' : 'text-base'}`}
            >
              {title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            {expandable && (
              <button
                onClick={toggleExpanded}
                aria-pressed={expanded}
                aria-label={t(expanded ? 'dialog.shrink' : 'dialog.expand')}
                title={t(expanded ? 'dialog.shrink' : 'dialog.expand')}
                className="hidden rounded-md bg-raised px-2 py-1 text-xs text-ink-soft hover:bg-elevated lg:block"
              >
                {expanded ? '⤡' : '⤢'}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="rounded-md bg-raised px-2 py-1 text-xs text-ink-soft hover:bg-elevated"
            >
              ✕
            </button>
          </div>
        </div>

        {layout === 'scroll' && (
          <>
            {toolbar && <div className="border-b border-line/10">{toolbar}</div>}
            <div className="min-h-0 flex-1 overflow-auto">{children}</div>
          </>
        )}
        {layout === 'pad' && <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>}
        {layout === 'fill' && <div className="flex min-h-0 flex-1 flex-col">{children}</div>}
        {layout !== 'pad' && footer && <div className="border-t border-line/10">{footer}</div>}
      </div>
    </div>
  );
}
