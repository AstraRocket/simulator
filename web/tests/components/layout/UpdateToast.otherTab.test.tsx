// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

// Applying the update in one tab hands the new worker every tab it was offered to; the library
// then calls `onNeedReload` in each. Only the tab that asked, or one with nothing to lose, reloads.

type HookOptions = {
  onNeedRefresh?: () => void;
  onNeedReload?: () => void;
  onRegisteredSW?: (url: string, reg: ServiceWorkerRegistration | undefined) => void;
};
let hookOptions: HookOptions = {};
let needRefresh = false;
const updateServiceWorker = vi.fn();

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: HookOptions) => {
    hookOptions = options;
    return {
      needRefresh: [needRefresh, (v: boolean) => (needRefresh = v)],
      updateServiceWorker,
      offlineReady: [false, vi.fn()],
    };
  },
}));

const workerOf = (build: number) =>
  ({
    postMessage: (_msg: unknown, ports: MessagePort[]) => ports[0]!.postMessage({ build }),
    addEventListener: vi.fn(),
  }) as unknown as ServiceWorker;

const realLocation = window.location;
const reload = vi.fn();

async function boot() {
  vi.resetModules();
  await import('../../../src/i18n');
  const { UpdateToast } = await import('../../../src/components/layout/UpdateToast');
  const { useWorkspaceStore } = await import('../../../src/state/store');
  const { markWritten } = await import('../../../src/state/writtenWorkspace');
  // Boot marks the hydrated design as written; a tab that has done nothing has nothing unstored.
  markWritten(useWorkspaceStore.getState());
  render(<UpdateToast />);
  return { useWorkspaceStore };
}

const takeOver = () => act(() => hookOptions.onNeedReload?.());

beforeEach(() => {
  hookOptions = {};
  needRefresh = false;
  updateServiceWorker.mockClear();
  reload.mockClear();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

describe('an update another tab applied', () => {
  it('reloads a tab with nothing to lose', async () => {
    await boot();
    takeOver();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('holds a tab with undo history and keeps a Reload button', async () => {
    const { useWorkspaceStore } = await boot();
    useWorkspaceStore.setState({ past: [{} as never] });
    takeOver();
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('The app was updated in another tab.');

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('holds a tab whose edit is not stored yet', async () => {
    const { useWorkspaceStore } = await boot();
    useWorkspaceStore.setState({ configs: [...useWorkspaceStore.getState().configs] });
    takeOver();
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload a held tab in the background while the work is still there', async () => {
    const { useWorkspaceStore } = await boot();
    useWorkspaceStore.setState({ past: [{} as never] });
    takeOver();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.getByRole('status').textContent).toBe('');

    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('an update this tab applied', () => {
  it('reloads even with undo history', async () => {
    const { useWorkspaceStore } = await boot();
    const reg = { waiting: workerOf(1001), active: workerOf(1000), update: vi.fn(() => Promise.resolve()) };
    act(() => hookOptions.onRegisteredSW?.('', reg as unknown as ServiceWorkerRegistration));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: () => Promise.resolve(reg) },
    });
    needRefresh = true;
    await act(async () => {
      hookOptions.onNeedRefresh?.();
      await new Promise((r) => setTimeout(r, 0));
    });
    useWorkspaceStore.setState({ past: [{} as never] });

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await vi.waitFor(() => expect(updateServiceWorker).toHaveBeenCalledWith(true));
    takeOver();
    expect(reload).toHaveBeenCalledOnce();
  });
});
