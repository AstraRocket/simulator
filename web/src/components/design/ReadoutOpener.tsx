import type { ReactNode } from 'react';
import { DialogOpener } from '../common/DialogOpener';
import { smallButton } from '../common/smallButton';

/** A part editor's button that opens a dialog. The caller draws the dialog. */
export function ReadoutOpener({ label, dialog }: { label: string; dialog: (close: () => void) => ReactNode }) {
  return (
    <div className="border-t border-line/5 pt-3">
      <DialogOpener className={smallButton('sm', 'ink', 'w-full')} dialog={dialog}>
        {label}
      </DialogOpener>
    </div>
  );
}
