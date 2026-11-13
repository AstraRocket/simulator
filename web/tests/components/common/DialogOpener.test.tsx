// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogOpener } from '../../../src/components/common/DialogOpener';

describe('DialogOpener', () => {
  it('mounts the dialog only while open, and closes it through the callback', () => {
    render(
      <DialogOpener className="btn" dialog={(close) => <button onClick={close}>Done</button>}>
        Open
      </DialogOpener>,
    );
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });
});
