// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** jsdom has no matchMedia; answer the width test. */
const setWidth = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

/** jsdom has no maxTouchPoints, so it is defined rather than spied on. */
const setTouchPoints = (n: number) => Object.defineProperty(navigator, 'maxTouchPoints', { value: n, configurable: true });

const setHints = (hints: object | undefined) =>
  Object.defineProperty(navigator, 'userAgentData', { value: hints, configurable: true });

/** A fresh module each time: it caches the browser's `formFactors` answer. */
const load = () => import('../../../src/services/app/device');

const flush = () => new Promise((r) => setTimeout(r, 0));

/**
 * Chromium's `formFactors` Client Hint answers "phone or tablet" when the
 * browser has it; the user agent answers everywhere else. See
 * docs/DEVELOPER.md, "Detecting a phone or tablet".
 */
describe('device detection', () => {
  beforeEach(() => {
    vi.resetModules();
    setWidth(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'userAgentData');
    Reflect.deleteProperty(navigator, 'maxTouchPoints');
  });

  it('takes a Chromium tablet at its word once formFactors answers', async () => {
    setHints({ platform: 'Windows', getHighEntropyValues: async () => ({ formFactors: ['Tablet'] }) });
    const device = await load();
    const heard = vi.fn();
    device.subscribeFormFactors(heard);
    await flush();
    expect(heard).toHaveBeenCalledOnce();
    expect(device.isMobileDevice()).toBe(true);
    expect(device.isDesktopComputer()).toBe(false);
  });

  it('keeps a desktop that reports Desktop, even with a tablet form factor beside it', async () => {
    setHints({ platform: 'Windows', getHighEntropyValues: async () => ({ formFactors: ['Desktop', 'Tablet'] }) });
    const device = await load();
    device.isMobileDevice();
    await flush();
    expect(device.isDesktopComputer()).toBe(true);
  });

  it('is not fooled by a desktop user agent when formFactors says Mobile', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64) Chrome/126.0');
    setHints({ platform: 'Linux', getHighEntropyValues: async () => ({ formFactors: ['Mobile'] }) });
    const device = await load();
    device.isMobileDevice();
    await flush();
    expect(device.isMobileDevice()).toBe(true);
  });

  it('falls back to the platform hint until formFactors lands', async () => {
    setHints({ platform: 'Android', getHighEntropyValues: () => new Promise(() => {}) });
    const device = await load();
    expect(device.isMobileDevice()).toBe(true);
  });

  it('reads an iPad that calls itself a Mac by its touch points', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    setTouchPoints(5);
    const device = await load();
    expect(device.isMobileDevice()).toBe(true);
  });

  it('reads a real Mac, with no touch points, as a desktop', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    setTouchPoints(0);
    const device = await load();
    expect(device.isDesktopComputer()).toBe(true);
  });

  it('treats a narrow window as a phone whatever the device', async () => {
    setWidth(false);
    const device = await load();
    expect(device.isDesktopComputer()).toBe(false);
  });
});
