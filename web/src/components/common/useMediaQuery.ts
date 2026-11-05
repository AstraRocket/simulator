import { useSyncExternalStore } from 'react';
import { DESKTOP_QUERY, formFactorsSnapshot, isMobileDevice, subscribeFormFactors } from '../../services/app/device';
import { capabilityAllowed, type Capability, type DeviceClass } from '../../services/app/capabilities';

// Prefer Tailwind classes; this is only for a component that must exist in exactly one DOM place.
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Keep in step with Tailwind's default `lg:`. */
export const useIsDesktop = (): boolean => useMediaQuery(DESKTOP_QUERY);

/** Keep in step with Tailwind's `xl:`. */
export const useIsXl = (): boolean => useMediaQuery('(min-width: 1280px)');

/** Keep in step with Tailwind's `2xl:`. */
export const useIsWide = (): boolean => useMediaQuery('(min-width: 1536px)');

// The width test alone would class a landscape iPad as a desktop.
const useDeviceClass = (): DeviceClass => {
  const desktop = useIsDesktop();
  // `formFactors` arrives after the first render.
  useSyncExternalStore(subscribeFormFactors, formFactorsSnapshot, () => null);
  return desktop && !isMobileDevice() ? 'desktop' : 'mobile';
};

export const useCapability = (): ((cap: Capability) => boolean) => {
  const device = useDeviceClass();
  return (cap) => capabilityAllowed(cap, device);
};
