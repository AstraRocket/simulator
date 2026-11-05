import { useRef, type MouseEvent, type PointerEvent } from 'react';

// Press must start and end on the backdrop: a selection dragged out of the panel clicks it. Never propagates, or a nested dialog closes its parent.
export function useBackdropDismiss(onDismiss: (() => void) | undefined) {
  const pressedHere = useRef(false);
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      pressedHere.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      const dismiss = pressedHere.current && e.target === e.currentTarget;
      pressedHere.current = false;
      if (dismiss) onDismiss?.();
    },
  };
}
