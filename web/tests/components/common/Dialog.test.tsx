import { nsKey } from '../../../src/services/storage/storageKeys';
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, within } from '@testing-library/react';
import { Dialog } from '../../../src/components/common/Dialog';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { readExpanded, sizeClasses, writeExpanded } from '../../../src/components/common/dialogSize';

const press = (el: Element) => {
  fireEvent.pointerDown(el);
  fireEvent.click(el);
};

const open = (props: Partial<Parameters<typeof Dialog>[0]> = {}) => {
  const onClose = vi.fn();
  const r = renderWithProviders(
    <Dialog id="test" title="A Title" onClose={onClose} {...props}>
      <p>body</p>
    </Dialog>,
  );
  return { ...r, onClose, dialog: within(r.container).getByRole('dialog') };
};

describe('Dialog', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.clearAllMocks());

  describe('the shape every dialog gets from the shared component', () => {
    it('names itself by its visible heading rather than a duplicate label', () => {
      const { dialog } = open();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      const id = dialog.getAttribute('aria-labelledby')!;
      expect(id).toBeTruthy();
      const heading = dialog.querySelector(`#${CSS.escape(id)}`)!;
      expect(heading.tagName).toBe('H2');
      expect(heading.textContent).toBe('A Title');
      expect(dialog.getAttribute('aria-label')).toBeNull();
    });

    it('keeps the classes that make a dialog full-bleed on a phone', () => {
      const { container, dialog } = open();
      expect(dialog.className).toContain('dialog-panel');
      expect(container.querySelector('.dialog-overlay')).not.toBeNull();
    });

    it('always caps its height', () => {
      const { dialog } = open();
      expect(dialog.className).toMatch(/max-h-\[\d+vh\]/);
    });

    it('closes on the backdrop but not on a click inside it', () => {
      const { container, dialog, onClose } = open();
      fireEvent.click(within(dialog).getByText('body'));
      expect(onClose).not.toHaveBeenCalled();
      press(container.querySelector('.dialog-overlay')!);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('stays open when a press that started in the panel ends on the backdrop', () => {
      // A selection dragged out of the panel fires its click on the backdrop.
      const { container, dialog, onClose } = open();
      fireEvent.pointerDown(within(dialog).getByText('body'));
      fireEvent.click(container.querySelector('.dialog-overlay')!);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on Escape and on the close button', () => {
      const a = open();
      fireEvent.keyDown(a.dialog, { key: 'Escape' });
      expect(a.onClose).toHaveBeenCalledTimes(1);
      a.unmount();

      const b = open();
      fireEvent.click(within(b.dialog).getByLabelText('Close'));
      expect(b.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not dismiss the dialog it is nested inside', () => {
      const outer = vi.fn();
      const r = renderWithProviders(
        <div onClick={outer}>
          <Dialog id="inner" title="Inner" onClose={() => {}}>
            <p>body</p>
          </Dialog>
        </div>,
      );
      press(r.container.querySelector('.dialog-overlay')!);
      expect(outer).not.toHaveBeenCalled();
    });

    it('stacks a dialog that opens over another above it', () => {
      const base = open({ layer: 'base' });
      expect(base.container.querySelector('.dialog-overlay')!.className).toContain('z-50');
      base.unmount();
      const over = open({ layer: 'over' });
      expect(over.container.querySelector('.dialog-overlay')!.className).toContain('z-[60]');
    });
  });

  describe('expanding', () => {
    it('widens the panel and says so', () => {
      const { dialog } = open({ size: 'lg' });
      expect(dialog.className).toContain('max-w-lg');
      const button = within(dialog).getByLabelText('Make this dialog wider');
      expect(button.getAttribute('aria-pressed')).toBe('false');

      fireEvent.click(button);
      expect(dialog.className).not.toContain('max-w-lg');
      expect(dialog.className).toContain('max-w-[96vw]');
      const shrink = within(dialog).getByLabelText('Return this dialog to its normal size');
      expect(shrink.getAttribute('aria-pressed')).toBe('true');

      fireEvent.click(shrink);
      expect(dialog.className).toContain('max-w-lg');
    });

    it('is hidden below lg, where the panel is already full-bleed', () => {
      // index.css makes `.dialog-panel` 100% under lg, so expanding is a no-op there.
      const { dialog } = open();
      expect(within(dialog).getByLabelText('Make this dialog wider').className).toContain('lg:block');
      expect(within(dialog).getByLabelText('Make this dialog wider').className).toContain('hidden');
    });

    it('remembers the choice, because it is a preference and not a gesture', () => {
      const first = open({ id: 'picker' });
      fireEvent.click(within(first.dialog).getByLabelText('Make this dialog wider'));
      first.unmount();

      const second = open({ id: 'picker' });
      expect(second.dialog.className).toContain('max-w-[96vw]');
      expect(within(second.dialog).getByLabelText('Return this dialog to its normal size')).toBeTruthy();
    });

    it('remembers each dialog separately', () => {
      const a = open({ id: 'one' });
      fireEvent.click(within(a.dialog).getByLabelText('Make this dialog wider'));
      a.unmount();
      const b = open({ id: 'two' });
      expect(b.dialog.className).not.toContain('max-w-[96vw]');
    });

    it('offers nothing to expand where widening would not help', () => {
      const { dialog } = open({ expandable: false });
      expect(within(dialog).queryByLabelText('Make this dialog wider')).toBeNull();
      expect(within(dialog).getByLabelText('Close')).toBeTruthy();
    });
  });

  describe('layout', () => {
    it('gives a scrolling dialog a footer only when there is one', () => {
      const without = open();
      expect(without.dialog.querySelectorAll('.border-t').length).toBe(0);
      without.unmount();
      const withFooter = open({ footer: <span>count</span> });
      expect(within(withFooter.dialog).getByText('count')).toBeTruthy();
    });

    it('keeps a toolbar from scrolling away with the rows it filters', () => {
      const { dialog } = open({ toolbar: <input aria-label="search" /> });
      const scroller = dialog.querySelector('.overflow-auto')!;
      expect(scroller.contains(within(dialog).getByLabelText('search'))).toBe(false);
      expect(scroller.textContent).toContain('body');
    });

    it('pads a prose dialog instead of ruling it into sections', () => {
      const { dialog } = open({ layout: 'pad', footer: <span>ignored</span> });
      expect(within(dialog).queryByText('ignored')).toBeNull();
    });

    it('pins a footer under a body that fills the dialog too', () => {
      const { dialog } = open({ layout: 'fill', footer: <span>save</span> });
      expect(within(dialog).getByText('save')).toBeTruthy();
    });

    it('leaves a filling body to do its own padding', () => {
      const { dialog } = open({ layout: 'fill' });
      const body = within(dialog).getByText('body').parentElement!;
      expect(body.className).not.toMatch(/\bp-4\b/);
    });
  });

  describe('height', () => {
    it('hugs its content by default, capped so it cannot run off the window', () => {
      const { dialog } = open();
      expect(dialog.style.height).toBe('');
      expect(dialog.className).toContain('max-h-[85vh]');
    });

    it('takes a fixed height for a dialog that must not resize under you', () => {
      const { dialog } = open({ height: 560 });
      expect(dialog.style.getPropertyValue('--dialog-height')).toBe('560px');
      expect(dialog.className).toContain('h-[var(--dialog-height)]');
      expect(dialog.className).toContain('max-h-[85vh]');
      // Inline height would beat the phone rule; Tailwind never generates a runtime `h-[560px]`.
      expect(dialog.style.height).toBe('');
    });

    it('keeps the full-bleed classes unless a dialog opts out of them', () => {
      expect(open({ fullBleed: false }).dialog.className).not.toContain('dialog-panel');
    });

    it('takes the viewport when a filling body does not say otherwise', () => {
      expect(open({ layout: 'fill' }).dialog.className).toContain('h-[85vh]');
    });
  });

  describe('the header slots', () => {
    it('puts navigation before the title and everything else after it', () => {
      const { dialog } = open({
        leading: <button>back</button>,
        actions: <button>on site</button>,
      });
      const heading = dialog.querySelector(`#${CSS.escape(dialog.getAttribute('aria-labelledby')!)}`)!;
      const order = (el: Element) => heading.compareDocumentPosition(el);
      expect(order(within(dialog).getByText('back')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
      expect(order(within(dialog).getByText('on site')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('a dialog that is busy', () => {
    it('ignores the backdrop and Escape, but never its own close button', () => {
      const { container, dialog, onClose } = open({ dismissible: false });
      fireEvent.click(container.querySelector('.dialog-overlay')!);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('scales the heading by the content, not by which dialog it is', () => {
    const list = open({ layout: 'scroll' });
    const heading = (d: HTMLElement) => d.querySelector(`#${CSS.escape(d.getAttribute('aria-labelledby')!)}`)!;
    expect(heading(list.dialog).className).toContain('text-sm');
    list.unmount();
    for (const layout of ['pad', 'fill'] as const) {
      const prose = open({ layout });
      expect(heading(prose.dialog).className, layout).toContain('text-base');
      prose.unmount();
    }
  });

  it('closes only the dialog on top when two are open', () => {
    const under = vi.fn();
    const over = vi.fn();
    const r = renderWithProviders(
      <>
        <Dialog id="under" title="Under" onClose={under}>
          <p>body</p>
        </Dialog>
        <Dialog id="over" title="Over" onClose={over} layer="over">
          <p>body</p>
        </Dialog>
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(over).toHaveBeenCalledTimes(1);
    expect(under).not.toHaveBeenCalled();

    const overlays = r.container.querySelectorAll('.dialog-overlay');
    press(overlays[overlays.length - 1]!);
    expect(under).not.toHaveBeenCalled();
  });

  it('shows an eyebrow above the title without making it the accessible name', () => {
    const { dialog } = open({ eyebrow: 'Estes' });
    expect(within(dialog).getByText('Estes')).toBeTruthy();
    const id = dialog.getAttribute('aria-labelledby')!;
    expect(dialog.querySelector(`#${CSS.escape(id)}`)!.textContent).toBe('A Title');
  });
});

describe('dialogSize', () => {
  beforeEach(() => localStorage.clear());

  it('maps each declared width, and one expanded width for all of them', () => {
    expect(sizeClasses('sm', false)).toContain('max-w-sm');
    expect(sizeClasses('6xl', false)).toContain('max-w-6xl');
    expect(sizeClasses('sm', true)).toBe(sizeClasses('6xl', true));
    expect(sizeClasses('sm', true)).toContain('max-w-[96vw]');
  });

  it('stores only the expanded ones, so the key does not collect every dialog', () => {
    writeExpanded('a', true);
    writeExpanded('b', false);
    expect(readExpanded('a')).toBe(true);
    expect(readExpanded('b')).toBe(false);
    expect(JSON.parse(localStorage.getItem(nsKey('dialogExpanded'))!)).toEqual({ a: true });
    writeExpanded('a', false);
    expect(JSON.parse(localStorage.getItem(nsKey('dialogExpanded'))!)).toEqual({});
  });

  it('survives storage that is unavailable or holds junk', () => {
    // Private browsing with site data blocked throws on access.
    localStorage.setItem(nsKey('dialogExpanded'), 'not json');
    expect(readExpanded('a')).toBe(false);
    expect(() => writeExpanded('a', true)).not.toThrow();

    const boom = () => {
      throw new Error('blocked');
    };
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom);
    expect(readExpanded('a')).toBe(false);
    spy.mockRestore();
  });
});
