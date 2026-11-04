// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ConfirmDialog } from '../../../src/components/common/ConfirmDialog';
import { confirm, useConfirmStore } from '../../../src/state/confirmStore';

// jsdom reports `offsetParent === null`, so useFocusTrap would see no focusable children.
let offsetParent: PropertyDescriptor | undefined;
beforeEach(() => {
  offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return document.body;
    },
  });
});
afterEach(() => {
  cleanup();
  if (offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParent);
  useConfirmStore.setState({ request: null });
});

describe('ConfirmDialog keyboard behavior', () => {
  it('focus lands on Confirm (the autoFocus target), not on Cancel', async () => {
    render(<ConfirmDialog />);
    let done: Promise<boolean>;
    act(() => {
      done = confirm({ message: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true });
    });
    const confirmBtn = await screen.findByRole('button', { name: 'Delete' });
    expect(document.activeElement).toBe(confirmBtn);
    act(() => useConfirmStore.getState().settle(false));
    expect(await done!).toBe(false);
  });

  it('Enter with Cancel focused does not confirm', async () => {
    render(<ConfirmDialog />);
    let done: Promise<boolean>;
    act(() => {
      done = confirm({ message: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Keep', danger: true });
    });
    const cancelBtn = await screen.findByRole('button', { name: 'Keep' });
    act(() => cancelBtn.focus());
    expect(document.activeElement).toBe(cancelBtn);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(useConfirmStore.getState().request).not.toBeNull();
    fireEvent.click(cancelBtn);
    expect(await done!).toBe(false);
  });

  it('Escape cancels', async () => {
    render(<ConfirmDialog />);
    let done: Promise<boolean>;
    act(() => {
      done = confirm({ message: 'Delete it?' });
    });
    await screen.findByRole('alertdialog');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(await done!).toBe(false);
  });
});
