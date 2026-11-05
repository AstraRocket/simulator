import { useEffect } from 'react';
import { useSettings } from '../../state/useSettings';
import { hasOpenSurface } from '../common/useFocusTrap';

export function useMaximizeCenter() {
  const { settings, update } = useSettings();
  const maxed = settings.maximizeCenter;
  const toggleMaxed = () => update({ maximizeCenter: !maxed });
  // Skips a spent Escape or an open modal so one press never closes two things.
  useEffect(() => {
    if (!maxed) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || hasOpenSurface()) return;
      update({ maximizeCenter: false });
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [maxed, update]);
  return { maxed, toggleMaxed };
}
