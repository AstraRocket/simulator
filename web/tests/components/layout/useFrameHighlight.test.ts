// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFrameHighlight } from '../../../src/components/layout/useFrameHighlight';
import type { HelpTarget } from '../../../src/services/app/helpDocs';

const frame = () => ({ current: { contentDocument: document } as unknown as HTMLIFrameElement });
const marks = () => document.querySelectorAll('article mark[data-astra-help-mark]').length;
const target = { src: '/docs/motors', hash: '' } as HelpTarget;
const words = ['ejection'];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useFrameHighlight', () => {
  it('marks the words, and marks them again after the article is replaced', async () => {
    Element.prototype.scrollIntoView = () => {};
    document.body.innerHTML = '<main><article><p>Set the ejection delay.</p></article></main>';
    const { unmount } = renderHook(() => useFrameHighlight(frame(), true, words, target.src, target.hash));
    expect(marks()).toBe(1);

    document.querySelector('main')!.innerHTML = '<article><p>Set the ejection delay here.</p></article>';
    await waitFor(() => expect(marks()).toBe(1));

    unmount();
    expect(marks()).toBe(0);
    expect(document.querySelector('article')!.textContent).toBe('Set the ejection delay here.');
  });

  it('marks the words when the article arrives after the frame is ready', async () => {
    Element.prototype.scrollIntoView = () => {};
    document.body.innerHTML = '<main></main>';
    renderHook(() => useFrameHighlight(frame(), true, words, target.src, target.hash));
    expect(marks()).toBe(0);
    document.querySelector('main')!.innerHTML = '<article><p>Set the ejection delay.</p></article>';
    await waitFor(() => expect(marks()).toBe(1));
  });

  it('scrolls to the first match after the anchor the page is at, and again when only the anchor moves', () => {
    const scrolledTo: string[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolledTo.push(this.closest('[data-top]')!.id);
    });
    // jsdom lays nothing out, so each section states its top.
    const top = (el: Element) => Number(el.closest('[data-top]')?.getAttribute('data-top') ?? 0);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return { top: top(this) } as DOMRect;
    });
    document.body.innerHTML = [
      '<article>',
      '<section id="a" data-top="0"><p>ejection one</p></section>',
      '<section id="b" data-top="100"><p>ejection two</p></section>',
      '</article>',
    ].join('');
    const { rerender } = renderHook(({ hash }) => useFrameHighlight(frame(), true, words, target.src, hash), {
      initialProps: { hash: '#a' },
    });
    rerender({ hash: '#b' });
    vi.restoreAllMocks();
    expect(scrolledTo).toEqual(['a', 'b']);
  });

  it('does nothing before the frame is ready', () => {
    document.body.innerHTML = '<article><p>Set the ejection delay.</p></article>';
    renderHook(() => useFrameHighlight(frame(), false, words, target.src, target.hash));
    expect(marks()).toBe(0);
  });
});
