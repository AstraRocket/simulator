import { useRef, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

// Only for the rendered aria-valuemax; `clamp` reads the live width at gesture time.
const subscribeResize = (cb: () => void) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const readInnerWidth = () => window.innerWidth;

/** px per arrow press, and per Shift+arrow. */
const STEP = 16;
const COARSE_STEP = 64;

/** Reports an absolute width from the pane's outer edge, not a delta: deltas drift once a clamp bites. */
export function PaneSplitter({
  paneRef,
  side = 'left',
  width,
  min,
  max,
  reserve,
  fallback,
  label,
  onDrag,
  onCommit,
}: {
  paneRef: RefObject<HTMLElement | null>;
  side?: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  /** px the rest of the window needs. */
  reserve: number;
  fallback: number;
  label: string;
  onDrag: (w: number) => void;
  onCommit: (w: number) => void;
}) {
  const dragging = useRef(false);
  // A click must not commit: the pointer sits a pixel off, undoing a double-click reset.
  const moved = useRef(false);

  const innerWidth = useSyncExternalStore(subscribeResize, readInnerWidth, readInnerWidth);
  const clamp = (w: number) => {
    const room = Math.max(min, Math.min(max, window.innerWidth - reserve));
    return Math.round(Math.min(room, Math.max(min, w)));
  };

  const widthAt = (clientX: number): number => {
    const box = paneRef.current?.getBoundingClientRect();
    return clamp(side === 'left' ? clientX - (box?.left ?? 0) : (box?.right ?? 0) - clientX);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Primary only: a right-click drag gets no matching pointerup.
    if (e.button !== 0) return;
    dragging.current = true;
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    e.preventDefault();
    moved.current = true;
    onDrag(widthAt(e.clientX));
  };

  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!moved.current) return;
    moved.current = false;
    onCommit(widthAt(e.clientX));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Arrows push the divider, so the sign depends on the side.
    const step = (e.shiftKey ? COARSE_STEP : STEP) * (side === 'left' ? 1 : -1);
    const next =
      e.key === 'ArrowLeft'
        ? width - step
        : e.key === 'ArrowRight'
          ? width + step
          : e.key === 'Home'
            ? min
            : e.key === 'End'
              ? max
              : null;
    if (next === null) return;
    e.preventDefault();
    onCommit(clamp(next));
  };

  return (
    <div // eslint-disable-line jsx-a11y-x/no-noninteractive-element-interactions -- a focusable separator is a widget in ARIA 1.2 (the window splitter pattern); the rule treats every separator as static
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      // The effective maximum `clamp` enforces, not the static prop.
      aria-valuemax={Math.round(Math.max(min, Math.min(max, innerWidth - reserve)))}
      // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex -- a focusable separator is a widget in ARIA 1.2 (the window splitter pattern); the rule treats every separator as static
      tabIndex={0}
      title={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onCommit(clamp(fallback))}
      className="group hidden w-[5px] shrink-0 cursor-col-resize touch-none justify-center bg-transparent focus:outline-none lg:flex"
    >
      <div className="h-full w-px bg-line/10 transition-colors group-hover:w-[3px] group-hover:bg-accent-500/70 group-focus:w-[3px] group-focus:bg-accent-500" />
    </div>
  );
}
