// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useHoverCursor } from '../../../src/components/common/useHoverCursor';

afterEach(() => {
  cleanup();
  document.body.style.cursor = '';
});

// A prop callback: the compiler lint forbids assigning a module variable during render.
function Mesh({ expose }: { expose: (set: (on: boolean) => void) => void }) {
  expose(useHoverCursor());
  return null;
}
let set!: (on: boolean) => void;
const grab = (s: (on: boolean) => void) => {
  set = s;
};
const cursor = () => document.body.style.cursor;

describe('useHoverCursor', () => {
  it('paints the pointer on hover and clears it on leave', () => {
    render(<Mesh expose={grab} />);
    set(true);
    expect(cursor()).toBe('pointer');
    set(false);
    expect(cursor()).toBe('');
  });

  it('clears the cursor when the canvas unmounts mid-hover', () => {
    const { unmount } = render(<Mesh expose={grab} />);
    set(true);
    expect(cursor()).toBe('pointer');
    unmount();
    expect(cursor()).toBe('');
  });

  it('clears unconditionally on unmount, even a cursor it did not set', () => {
    document.body.style.cursor = 'wait';
    const { unmount } = render(<Mesh expose={grab} />);
    unmount();
    expect(cursor()).toBe('');
  });

  it('returns the same setter across re-renders', () => {
    const { rerender } = render(<Mesh expose={grab} />);
    const first = set;
    rerender(<Mesh expose={grab} />);
    expect(set).toBe(first);
  });
});
