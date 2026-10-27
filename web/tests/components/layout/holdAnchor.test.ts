// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { holdAnchor } from '../../../src/components/layout/useHelpFrame';

/**
 * A search result opens a page at its section and then moves on to the first
 * matching word below it. The hold that keeps the section heading in view while
 * the page settles must not pull the page back to the heading once the words
 * are marked.
 */
describe('the anchor hold', () => {
  const page = () => {
    document.body.innerHTML = '<article><h2 id="g">G</h2><p>glide ratio</p></article>';
    const heading = document.getElementById('g')!;
    const scrolled = vi.fn();
    heading.scrollIntoView = scrolled;
    return { heading, scrolled };
  };
  const frames = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('puts the heading back when the page re-renders under it', async () => {
    const { scrolled } = page();
    const release = holdAnchor(document, window, 'g');
    expect(scrolled).toHaveBeenCalledTimes(1);
    document.querySelector('article')!.append(document.createElement('p'));
    await frames();
    expect(scrolled).toHaveBeenCalledTimes(2);
    release();
  });

  it('lets go once a search match is marked in the page', async () => {
    const { scrolled } = page();
    const release = holdAnchor(document, window, 'g');
    const mark = document.createElement('mark');
    mark.setAttribute('data-astra-help-mark', '');
    document.querySelector('p')!.append(mark);
    await frames();
    document.querySelector('article')!.append(document.createElement('p'));
    window.dispatchEvent(new Event('scroll'));
    await frames();
    expect(scrolled).toHaveBeenCalledTimes(1);
    release();
  });
});
