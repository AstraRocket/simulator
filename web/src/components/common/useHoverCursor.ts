import { useEffect } from 'react';

const setCursor = (on: boolean): void => {
  document.body.style.cursor = on ? 'pointer' : '';
};

// Cleared on unmount: R3F meshes unmount without firing pointer-out.
export function useHoverCursor(): (on: boolean) => void {
  useEffect(() => () => setCursor(false), []);
  return setCursor;
}
