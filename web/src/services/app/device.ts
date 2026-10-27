import { capabilityAllowed, type Capability, type DeviceClass } from './capabilities';

/**
 * What kind of device the app is running on, and so which of the capabilities
 * in capabilities.ts it offers.
 *
 * Two questions: is the window wide enough for the desktop layout, and is the
 * device a desktop computer.
 *
 * - **Width**: the `lg:` breakpoint (1024 px), where the phone layout ends.
 * - **Device, where the browser says**: Chromium (Chrome, Edge, Samsung
 *   Internet) answers the `formFactors` User-Agent Client Hint with the device's
 *   own form factors ("Desktop", "Mobile", "Tablet", ...). A device that lists
 *   "Desktop" is one; one that does not is not. The answer arrives
 *   asynchronously, so it is asked for once and cached, and until it lands (or
 *   in a browser without it) the device is read the old way below.
 * - **Device, where it does not**: iOS/iPadOS when the user agent names an
 *   iPhone, iPad or iPod, or the browser reports a Mac with a touch screen
 *   (iPadOS 13+ calls itself `MacIntel`; a real Mac has no touch points).
 *   Android when Client Hints report that platform, else when the user agent
 *   names it (Firefox). Every iOS browser is WebKit, which has no Client Hints
 *   at all, so iOS is always read this way.
 *
 * Windows is never singled out: a Windows tablet runs desktop programs, and it
 * reports "Desktop" or passes the fallback. A browser set to "request desktop
 * site" can hide what it is from the fallback, though not from `formFactors`.
 *
 * Why it is this crude, per browser (as of 2026; browser makers treat "what
 * device is this" as fingerprinting data and keep cutting it back):
 *
 * - **Safari, and so every iPhone and iPad, tells sites almost nothing.**
 *   Apple refused to implement User-Agent Client Hints, and Safari on an iPad
 *   pretends to be a Mac on purpose. The touch-point check is the trick
 *   everyone uses, because Apple offers nothing better. Every iOS browser
 *   (Chrome and Firefox included) is WebKit underneath, so this holds for all
 *   of them.
 * - **Firefox has neither.** It gets the user agent string and nothing else:
 *   no Client Hints, so no `platform` and no `formFactors`.
 * - **Chromium** (Chrome, Edge, Samsung Internet) is the one engine with a
 *   real answer, `formFactors`, and only asynchronously.
 *
 * See docs/DEVELOPER.md, "Detecting a phone or tablet".
 */

interface UaHints {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ formFactors?: string[] }>;
}

const uaHints = (): UaHints | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as unknown as { userAgentData?: UaHints }).userAgentData;

/** The browser's `formFactors` answer, once it has arrived; null before then or without one. */
let formFactors: readonly string[] | null = null;
let asked = false;
const listeners = new Set<() => void>();

/** Ask the browser for its form factors, once. Listeners hear when the answer lands. */
function askFormFactors(): void {
  if (asked) return;
  asked = true;
  uaHints()
    ?.getHighEntropyValues?.(['formFactors'])
    .then((v) => {
      if (!v.formFactors?.length) return;
      formFactors = v.formFactors;
      for (const fn of listeners) fn();
    })
    .catch(() => {});
}

/** For `useSyncExternalStore`: re-render when the `formFactors` answer arrives. */
export function subscribeFormFactors(onChange: () => void): () => void {
  askFormFactors();
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** The cached `formFactors` answer, as the snapshot `subscribeFormFactors` pairs with. */
export const formFactorsSnapshot = (): readonly string[] | null => formFactors;

/** The `lg:` breakpoint, where the phone layout ends. Keep in step with Tailwind's default. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** iOS or iPadOS. iPadOS 13+ reports as a Mac, hence the touch check. */
export function isApplePhoneOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

/** Android, phone or tablet: Client Hints first, the user agent string where there are none. */
export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = uaHints()?.platform;
  return platform ? platform === 'Android' : /Android/i.test(navigator.userAgent);
}

/** A phone or tablet, whatever the window's width: the browser's form factors when known, else its OS. */
export function isMobileDevice(): boolean {
  askFormFactors();
  if (formFactors) return !formFactors.includes('Desktop');
  return isApplePhoneOrTablet() || isAndroid();
}

/**
 * Whether this is a desktop computer, read once. The React side reads the
 * width as state instead (useDeviceClass), so a resize re-renders.
 */
export function isDesktopComputer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia(DESKTOP_QUERY).matches && !isMobileDevice();
}

/** This device's class, read once. */
export const deviceClass = (): DeviceClass => (isDesktopComputer() ? 'desktop' : 'mobile');

/** Whether this device offers the capability, read once (see capabilities.ts). Outside React. */
export const hasCapability = (cap: Capability): boolean => capabilityAllowed(cap, deviceClass());
