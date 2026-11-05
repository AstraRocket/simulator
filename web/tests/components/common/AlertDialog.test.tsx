// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/react';
import { AlertDialog } from '../../../src/components/common/AlertDialog';
import { renderWithProviders } from '../../testing/renderWithProviders';

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
  if (offsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', offsetParent);
});

const open = (props: Partial<Parameters<typeof AlertDialog>[0]> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const r = renderWithProviders(
    <AlertDialog
      title="Delete it?"
      message="This cannot be undone."
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { ...r, onConfirm, onCancel, dialog: within(r.container).getByRole('alertdialog') };
};

/** The overlay is the panel's parent; it carries no class of its own to find. */
const backdrop = (dialog: HTMLElement) => dialog.parentElement!;

describe('AlertDialog', () => {
  describe('what it announces', () => {
    it('names itself by its visible heading and DESCRIBES itself by its message', () => {
      const { dialog } = open();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-label')).toBeNull();

      const named = dialog.querySelector(`#${CSS.escape(dialog.getAttribute('aria-labelledby')!)}`)!;
      expect(named.tagName).toBe('H2');
      expect(named.textContent).toBe('Delete it?');

      const described = dialog.querySelector(`#${CSS.escape(dialog.getAttribute('aria-describedby')!)}`)!;
      expect(described.textContent).toBe('This cannot be undone.');
    });

    it('gives two prompts on screen at once their own ids', () => {
      const r = renderWithProviders(
        <>
          <AlertDialog title="First" message="a" confirmLabel="ok" onConfirm={() => {}} />
          <AlertDialog title="Second" message="b" confirmLabel="ok" onConfirm={() => {}} />
        </>,
      );
      const [a, b] = within(r.container).getAllByRole('alertdialog');
      expect(a!.getAttribute('aria-labelledby')).not.toBe(b!.getAttribute('aria-labelledby'));
    });

    it('stays a centered card on a phone instead of filling it', () => {
      const { dialog } = open();
      expect(dialog.className).not.toContain('dialog-panel');
      expect(backdrop(dialog).className).not.toContain('dialog-overlay');
    });
  });

  describe('the way out', () => {
    it('is the button, Escape and the backdrop, all the same way out', () => {
      const a = open();
      fireEvent.click(within(a.dialog).getByText('Cancel'));
      expect(a.onCancel).toHaveBeenCalledTimes(1);
      a.unmount();

      const b = open();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(b.onCancel).toHaveBeenCalledTimes(1);
      b.unmount();

      const c = open();
      fireEvent.pointerDown(backdrop(c.dialog));
      fireEvent.click(backdrop(c.dialog));
      expect(c.onCancel).toHaveBeenCalledTimes(1);
    });

    it('is not a press that started in the panel and ended on the backdrop', () => {
      const { dialog, onCancel } = open();
      fireEvent.pointerDown(dialog);
      fireEvent.click(backdrop(dialog));
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('takes its own label when one is given', () => {
      const { dialog } = open({ cancelLabel: 'Keep' });
      expect(within(dialog).getByText('Keep')).toBeTruthy();
      expect(within(dialog).queryByText('Cancel')).toBeNull();
    });

    it('is absent in every form for a prompt that must be acknowledged', () => {
      const { dialog, onConfirm } = open({ onCancel: undefined });
      expect(within(dialog).queryByText('Cancel')).toBeNull();
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.pointerDown(backdrop(dialog));
      fireEvent.click(backdrop(dialog));
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('swallows Escape rather than passing it to what is underneath', () => {
      const under = vi.fn();
      renderWithProviders(
        <>
          <AlertDialog title="Under" message="a" confirmLabel="ok" onConfirm={() => {}} onCancel={under} />
          <AlertDialog title="Gate" message="b" confirmLabel="ok" onConfirm={() => {}} />
        </>,
      );
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(under).not.toHaveBeenCalled();
    });

    it('does not let a click inside it reach the backdrop', () => {
      const { dialog, onCancel } = open();
      fireEvent.click(within(dialog).getByText('This cannot be undone.'));
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('the buttons', () => {
    it('focuses confirm, though cancel comes first in reading order', () => {
      const { dialog } = open();
      const buttons = within(dialog).getAllByRole('button');
      expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Delete']);
      expect(document.activeElement).toBe(buttons[1]);
    });

    it('paints a destructive confirm red', () => {
      const plain = open();
      expect(within(plain.dialog).getByText('Delete').className).toContain('bg-accent-600');
      plain.unmount();
      const danger = open({ danger: true });
      expect(within(danger.dialog).getByText('Delete').className).toContain('bg-danger-600');
    });

    it('confirms on its own button only', () => {
      const { dialog, onConfirm, onCancel } = open();
      fireEvent.click(within(dialog).getByText('Delete'));
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  it('takes a named layer rather than a hand-picked z-index', () => {
    expect(backdrop(open({ layer: 'top' }).dialog).className).toContain('z-[70]');
  });

  it('shows an icon without reading it out as part of the message', () => {
    const { dialog } = open({ icon: '🚧' });
    const icon = within(dialog).getByText('🚧');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(dialog.querySelector(`#${CSS.escape(dialog.getAttribute('aria-describedby')!)}`)!.contains(icon)).toBe(
      false,
    );
  });
});
