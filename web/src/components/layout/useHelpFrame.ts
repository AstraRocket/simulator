import { type RefObject, useCallback, useRef, useState } from 'react';
import { type HelpTarget, helpTarget, helpTargetFromUrl } from '../../services/app/helpDocs';

// Not zero, or the highlight flickers on a slow scroll across a boundary.
const SPY_OFFSET_PX = 96;

const HELP_MARK = 'mark[data-astra-help-mark]';

const ANCHOR_HOLD_MS = 10_000;

/** Re-jumps while the page settles: docs hydration can drop the scroll to the top. */
export function holdAnchor(doc: Document, win: Window, id: string): () => void {
  // Looked up by id each time: hydration can replace the element.
  const go = () => {
    const el = id ? doc.getElementById(id) : null;
    if (el) el.scrollIntoView();
    else win.scrollTo(0, 0);
  };
  go();
  let queued = false;
  const settle = () => {
    if (doc.querySelector(HELP_MARK)) {
      release();
      return;
    }
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(() => {
      queued = false;
      go();
    });
  };
  // The frame's own constructor: an observer from this window would watch another realm.
  const Observer = (win as Window & typeof globalThis).MutationObserver;
  const content = new Observer(settle);
  content.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true });
  win.addEventListener('scroll', settle, { passive: true });
  const inputs = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;
  const release = () => {
    content.disconnect();
    win.removeEventListener('scroll', settle);
    for (const kind of inputs) win.removeEventListener(kind, release, true);
    win.clearTimeout(timer);
  };
  for (const kind of inputs) win.addEventListener(kind, release, { capture: true, passive: true });
  const timer = win.setTimeout(release, ANCHOR_HOLD_MS);
  return release;
}

export function useHelpFrame(
  target: HelpTarget,
  language: string,
  open: (next: string) => void,
): {
  frameRef: RefObject<HTMLIFrameElement | null>;
  ready: boolean;
  activeHash: string;
  /** The anchor the page was last sent to: a move within the page keeps `target` and changes this. */
  anchorHash: string;
  navigate: (next: string) => void;
  onFrameLoad: () => void;
} {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // '' means the top of the page.
  const pendingAnchor = useRef<string | null>(null);
  const releaseHold = useRef<(() => void) | null>(null);
  const hold = useCallback((doc: Document, win: Window, id: string) => {
    releaseHold.current?.();
    releaseHold.current = holdAnchor(doc, win, id);
  }, []);
  const [frame, setFrame] = useState<string | null>(null);
  // '' above the first heading.
  const [activeHash, setActiveHash] = useState('');
  const [moved, setMoved] = useState<{ src: string; hash: string } | null>(null);
  const anchorHash = moved?.src === target.src ? moved.hash : target.hash;

  const ready = frame === target.src;
  // Set synchronously on load: `ready` lags a render, and a click in that gap would be lost.
  const loaded = useRef<string | null>(null);

  const navigate = useCallback(
    (next: string) => {
      const to = helpTarget(next, language);
      if (to.slug === target.slug) {
        const doc = frameRef.current?.contentDocument;
        const id = to.hash ? decodeURIComponent(to.hash.slice(1)) : '';
        setMoved({ src: target.src, hash: to.hash });
        if (loaded.current !== target.src) {
          pendingAnchor.current = id;
          return;
        }
        const win = doc?.defaultView;
        if (doc && win) hold(doc, win, id);
        return;
      }
      pendingAnchor.current = null;
      open(next);
    },
    [open, language, target.slug, target.src, hold],
  );

  const onFrameClick = useCallback(
    (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      // A bare "#id" is the page's own heading link; let it scroll itself.
      if ((anchor.getAttribute('href') ?? '').startsWith('#')) return;
      const next = helpTargetFromUrl(anchor.href);
      // Both, in the capture phase: otherwise Docusaurus's router routes client-side.
      e.preventDefault();
      e.stopPropagation();
      if (next === null) {
        window.open(anchor.href, '_blank', 'noopener,noreferrer');
        return;
      }
      navigate(next);
    },
    [navigate],
  );

  // Each navigation replaces the frame's document and window, so there is nothing to detach.
  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const html = doc.documentElement;
    html.setAttribute('data-astra-embed', '');
    // Docusaurus reads both attributes back on hydration, so set both.
    const appTheme = document.documentElement.getAttribute('data-theme');
    const docsTheme = appTheme === 'light' || appTheme === 'daylight' ? 'light' : 'dark';
    html.setAttribute('data-theme', docsTheme);
    html.setAttribute('data-theme-choice', docsTheme);
    doc.addEventListener('click', onFrameClick, true);

    const win = doc.defaultView;
    if (win) {
      // Queried on every pass: hydration can replace the headings.
      const headings = () =>
        doc.querySelectorAll<HTMLElement>('.theme-doc-markdown h2[id], .theme-doc-markdown h3[id]');
      let queued = false;
      const spy = () => {
        if (queued) return;
        queued = true;
        win.requestAnimationFrame(() => {
          queued = false;
          let active = '';
          for (const mark of headings()) {
            if (mark.getBoundingClientRect().top > SPY_OFFSET_PX) break;
            active = `#${mark.id}`;
          }
          setActiveHash(active);
        });
      };
      win.addEventListener('scroll', spy, { passive: true });
      spy();
      // Hydration undoes the browser's own jump to the fragment.
      const wanted = pendingAnchor.current ?? (target.hash ? decodeURIComponent(target.hash.slice(1)) : null);
      pendingAnchor.current = null;
      if (wanted !== null) hold(doc, win, wanted);
    }

    loaded.current = target.src;
    setFrame(target.src);
  }, [onFrameClick, target.src, target.hash, hold]);

  return { frameRef, ready, activeHash, anchorHash, navigate, onFrameLoad };
}
