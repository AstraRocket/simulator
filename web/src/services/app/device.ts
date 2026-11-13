import { capabilityAllowed, type Capability, type DeviceClass } from './capabilities';

// Windows is never singled out: a Windows tablet runs desktop programs.

interface UaHints {
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ formFactors?: string[] }>;
}

const uaHints = (): UaHints | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as unknown as { userAgentData?: UaHints }).userAgentData;

let formFactors: readonly string[] | null = null;
let asked = false;
const listeners = new Set<() => void>();

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

export function subscribeFormFactors(onChange: () => void): () => void {
  askFormFactors();
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export const formFactorsSnapshot = (): readonly string[] | null => formFactors;

/** 1040px on touch keeps a 13" portrait iPad (1032) on the phone layout; keep in step with index.css `lg`. */
export const DESKTOP_QUERY = '(min-width: 1040px), (min-width: 1024px) and (not (pointer: coarse))';

/** iPadOS 13+ reports as a Mac, hence the touch check. */
export function isApplePhoneOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (/iP(hone|ad|od)/.test(navigator.userAgent)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

/** Macs as well as iPhones and iPads: where the undo shortcut is ⌘Z, not Ctrl+Z. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = uaHints()?.platform;
  return platform
    ? /^(macOS|iOS)$/.test(platform)
    : /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent);
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = uaHints()?.platform;
  return platform ? platform === 'Android' : /Android/i.test(navigator.userAgent);
}

export function isMobileDevice(): boolean {
  askFormFactors();
  if (formFactors) return !formFactors.includes('Desktop');
  return isApplePhoneOrTablet() || isAndroid();
}

/** Not reactive; React code uses useDeviceClass. */
export function isDesktopComputer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia(DESKTOP_QUERY).matches && !isMobileDevice();
}

export const deviceClass = (): DeviceClass => (isDesktopComputer() ? 'desktop' : 'mobile');

export const hasCapability = (cap: Capability): boolean => capabilityAllowed(cap, deviceClass());
