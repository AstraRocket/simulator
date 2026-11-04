import { useRef, useState, type ReactNode } from 'react';
import { usePopoverDismiss } from './useMenuPopover';

export interface CheckMenuItem {
  key: string;
  label: ReactNode;
  checked: boolean;
}

export function CheckMenu({
  summary,
  items,
  onToggle,
  width,
  align = 'left',
  className,
  children,
}: {
  summary: ReactNode;
  items: CheckMenuItem[];
  onToggle: (key: string) => void;
  width: string;
  align?: 'left' | 'right';
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  usePopoverDismiss(open, () => setOpen(false), ref, summaryRef);

  return (
    <details
      ref={ref}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={className ? `relative ${className}` : 'relative'}
    >
      <summary
        ref={summaryRef}
        className="cursor-pointer list-none rounded-lg bg-canvas px-3 py-1.5 text-sm text-ink-strong ring-1 ring-line/10"
      >
        {summary}
      </summary>
      <div
        className={`absolute top-full z-20 mt-1 max-h-64 ${width} overflow-y-auto rounded-lg bg-canvas p-1 shadow-xl ring-1 ring-line/10 ${
          align === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        {children}
        {items.map((it) => (
          <label key={it.key} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-ink hover:bg-raised">
            <input
              type="checkbox"
              checked={it.checked}
              className="accent-accent-500"
              onChange={() => onToggle(it.key)}
            />
            {it.label}
          </label>
        ))}
      </div>
    </details>
  );
}
