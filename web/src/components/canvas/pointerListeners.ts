type Handler = (e: PointerEvent) => void;

/** Listens for a drag on an element, a canceled one ending as a released one; returns the cleanup. */
export function listenPointerDrag(
  el: HTMLElement,
  { down, move, up }: { down: Handler; move: Handler; up: Handler },
): () => void {
  const events = [
    ['pointerdown', down],
    ['pointermove', move],
    ['pointerup', up],
    ['pointercancel', up],
  ] as const;
  for (const [type, fn] of events) el.addEventListener(type, fn);
  return () => {
    for (const [type, fn] of events) el.removeEventListener(type, fn);
  };
}
