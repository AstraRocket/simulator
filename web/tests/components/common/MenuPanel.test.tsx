// @vitest-environment jsdom
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MenuPanel } from '../../../src/components/common/MenuPanel';
import { renderWithProviders } from '../../testing/renderWithProviders';

describe('MenuPanel', () => {
  it('is a menu holding the ref and the key handler', () => {
    const ref = createRef<HTMLDivElement>();
    const onKey = vi.fn();
    renderWithProviders(
      <MenuPanel menuRef={ref} onMenuKeyDown={onKey}>
        <button role="menuitem">One</button>
      </MenuPanel>,
    );
    const menu = screen.getByRole('menu');
    expect(ref.current).toBe(menu);
    expect(menu.className).toContain('right-0');
    fireEvent.keyDown(screen.getByRole('menuitem'), { key: 'ArrowDown' });
    expect(onKey).toHaveBeenCalledOnce();
  });

  it('aligns left and takes its own sizing', () => {
    renderWithProviders(
      <MenuPanel menuRef={createRef()} onMenuKeyDown={() => {}} align="left" className="min-w-48 p-1.5">
        <button role="menuitem">One</button>
      </MenuPanel>,
    );
    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('left-0');
    expect(menu.className).toContain('min-w-48');
    expect(menu.className).not.toContain('w-44');
  });
});
