import { useState, type ReactNode } from 'react';
import { smallButton } from '../common/smallButton';

/** A part editor's button that opens a dialog. The caller draws the dialog. */
export function ReadoutOpener({ label, dialog }: { label: string; dialog: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line/5 pt-3">
      <button type="button" onClick={() => setOpen(true)} className={smallButton('sm', 'ink', 'w-full')}>
        {label}
      </button>
      {open && dialog(() => setOpen(false))}
    </div>
  );
}
