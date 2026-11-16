import type { KeyboardEvent, ReactNode, RefObject } from 'react';

/** The popup shell for `useMenuPopover`; `className` sets its width, padding and inner layout. */
export function MenuPanel({
  menuRef,
  onMenuKeyDown,
  align = 'right',
  className = 'w-44 py-1',
  children,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  onMenuKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  align?: 'left' | 'right';
  className?: string;
  /** Menu items only, or screen readers announce "menu, 0 items". */
  children: ReactNode;
}) {
  return (
    <div // eslint-disable-line jsx-a11y-x/interactive-supports-focus -- roving tabindex: focus moves to the items, as in the ARIA menu pattern, so the container is not
      ref={menuRef}
      role="menu"
      onKeyDown={onMenuKeyDown}
      className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-50 mt-1 overflow-hidden rounded-lg bg-raised shadow-xl ring-1 ring-line/10 ${className}`}
    >
      {children}
    </div>
  );
}
