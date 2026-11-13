import { type RefObject, useEffect } from 'react';
import { clearMarks, markMatches } from '../../services/app/helpSearch';

const MARK = 'mark[data-astra-help-mark]';

// The body is observed because the docs can re-render the article after load, dropping the marks.
export function useFrameHighlight(
  frameRef: RefObject<HTMLIFrameElement | null>,
  ready: boolean,
  highlight: string[],
  src: string,
  /** The anchor the page is at, from which the first match is scrolled to. */
  hash: string,
): void {
  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!ready || !doc?.body) return;
    const win = doc.defaultView;
    let scrolled = false;

    const mark = () => {
      const root = doc.querySelector('article');
      if (!root || root.querySelector(MARK)) return;
      const marks = markMatches(root, highlight);
      if (!marks.length || !win || scrolled) return;
      scrolled = true;
      const anchor = hash ? doc.getElementById(decodeURIComponent(hash.slice(1))) : null;
      const from = anchor ? anchor.getBoundingClientRect().top + win.scrollY : 0;
      const at = marks.find((m) => m.getBoundingClientRect().top + win.scrollY >= from) ?? marks[0]!;
      at.scrollIntoView({ block: 'center' });
    };

    mark();
    const Observer = win?.MutationObserver ?? MutationObserver;
    const watch = highlight.length ? new Observer(mark) : null;
    watch?.observe(doc.body, { childList: true, subtree: true });
    return () => {
      watch?.disconnect();
      const root = doc.querySelector('article');
      if (root) clearMarks(root);
    };
  }, [frameRef, ready, highlight, hash, src]);
}
