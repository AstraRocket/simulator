// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { FileMenuButton, type FileMenuActions } from '../../../src/components/layout/FileMenu';
import { renderWithProviders } from '../../testing/renderWithProviders';
import { useUpdateStore } from '../../../src/state/updateStore';

const actions = () =>
  new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (target, key: string) => (target[key] ??= vi.fn()),
  }) as unknown as FileMenuActions & Record<string, ReturnType<typeof vi.fn>>;

const openMenu = (canSave: boolean) => {
  const a = actions();
  renderWithProviders(<FileMenuButton canSave={canSave} actions={a} />);
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  return a;
};

/**
 * The file menu holds only menu items and separators, and a disabled item stays
 * reachable by the arrow keys, so the reason it is disabled can be heard.
 */
describe('FileMenu structure', () => {
  // jsdom has no matchMedia; the menu asks it whether the window can build a
  // design (useCanBuildDesign). Answer "desktop".
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    })) as unknown as typeof window.matchMedia;
  });

  it('marks its dividers as separators', () => {
    openMenu(true);
    const menu = screen.getByRole('menu');
    expect(menu.querySelectorAll('[role="separator"]').length).toBe(4);
    for (const child of Array.from(menu.children))
      expect(['menuitem', 'separator']).toContain(child.getAttribute('role'));
  });

  it('keeps a disabled item focusable, inert and described', () => {
    useUpdateStore.setState({ checker: null } as never);
    const a = openMenu(false);
    const saveAs = screen.getByRole('menuitem', { name: 'Save As…' });
    expect(saveAs.getAttribute('aria-disabled')).toBe('true');
    expect(saveAs.hasAttribute('disabled')).toBe(false);
    fireEvent.click(saveAs);
    expect(a.onSaveAs).not.toHaveBeenCalled();

    const check = screen.getByRole('menuitem', { name: 'Check for updates' });
    expect(check.getAttribute('aria-disabled')).toBe('true');
    const reason = document.getElementById(check.getAttribute('aria-describedby')!);
    expect(reason?.textContent).toMatch(/development server/);
  });

  it('moves onto a disabled item with the arrow keys', () => {
    // jsdom lays nothing out, so every element reports no offsetParent, which
    // the menu reads as hidden.
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      return this.parentElement;
    });
    openMenu(false);
    const menu = screen.getByRole('menu');
    const open = screen.getByRole('menuitem', { name: 'Open…' });
    open.focus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Save As…' }));
    spy.mockRestore();
  });

  it('opens with focus on its first item and hands it back to the button on Escape', () => {
    openMenu(true);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'New' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Menu' }));
  });

  it('keeps the arrow keys it answers from reaching the page around it', () => {
    const spy = vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      return this.parentElement;
    });
    const outer = vi.fn();
    renderWithProviders(
      <div onKeyDown={outer}>
        <FileMenuButton canSave actions={actions()} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(outer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Open…' }));
    spy.mockRestore();
  });
});

/**
 * RockSim, RASAero II, a slicer and Onshape's import feature run only on a
 * desktop computer, so their exports, and RockSim import, are left off a phone
 * or tablet. The exports a phone can use stay.
 */
describe('FileMenu exports for desktop programs', () => {
  const setWindow = (desktop: boolean) => {
    window.matchMedia = ((query: string) => ({
      matches: desktop,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };

  const formats = () => {
    openMenu(true);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Import' }));
    return {
      rktOut: screen.queryByRole('menuitem', { name: 'Export RockSim (.rkt)' }),
      rasaero: screen.queryByRole('menuitem', { name: 'RASAero II' }),
      rktIn: screen.queryByRole('menuitem', { name: 'Import RockSim (.rkt)' }),
      print: screen.queryByRole('menuitem', { name: 'Export printable parts as 3MF' }),
      json: screen.queryByRole('menuitem', { name: 'Export JSON (.json)' }),
      ork: screen.queryByRole('menuitem', { name: 'Export OpenRocket (.ork)' }),
    };
  };

  afterEach(() => vi.restoreAllMocks());

  it('offers them on a desktop window', () => {
    setWindow(true);
    const f = formats();
    expect(f.rktOut).not.toBeNull();
    expect(f.rasaero).not.toBeNull();
    expect(f.print).not.toBeNull();
    expect(f.json).not.toBeNull();
    expect(f.rktIn).not.toBeNull();
  });

  it('leaves them and RockSim import off at phone width, and keeps .ork', () => {
    setWindow(false);
    const f = formats();
    expect(f.rktOut).toBeNull();
    expect(f.rasaero).toBeNull();
    expect(f.print).toBeNull();
    expect(f.json).toBeNull();
    expect(f.rktIn).toBeNull();
    expect(f.ork).not.toBeNull();
  });

  it('trusts the Client Hints platform over the user agent', () => {
    setWindow(true);
    Object.defineProperty(navigator, 'userAgentData', { value: { platform: 'Android' }, configurable: true });
    try {
      expect(formats().rasaero).toBeNull();
    } finally {
      Reflect.deleteProperty(navigator, 'userAgentData');
    }
  });

  it.each([
    ['an iPad in landscape', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15'],
    ['an Android tablet', 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0'],
  ])('leaves both off on %s, however wide', (_, ua) => {
    setWindow(true);
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
    const f = formats();
    expect(f.rktOut).toBeNull();
    expect(f.rasaero).toBeNull();
    expect(f.rktIn).toBeNull();
  });
});
