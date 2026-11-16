import { useState, type ReactNode } from 'react';

/** A button that opens a dialog, mounted only while open. The caller draws the dialog. */
export function DialogOpener({
  className,
  title,
  children,
  dialog,
}: {
  className: string;
  title?: string;
  children: ReactNode;
  dialog: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={title} className={className}>
        {children}
      </button>
      {open && dialog(() => setOpen(false))}
    </>
  );
}
