// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
// No SettingsProvider: `rerender` would drop the wrapper and remount the tree.
import '../../../src/i18n';

// Screen readers ignore a `role="status"` created with its text, so it mounts empty.

let needRefresh = false;
const setNeedRefresh = vi.fn((v: boolean) => {
  needRefresh = v;
});
const updateServiceWorker = vi.fn();
type HookOptions = {
  onNeedRefresh?: () => void;
  onRegisteredSW?: (url: string, reg: ServiceWorkerRegistration | undefined) => void;
};
let hookOptions: HookOptions = {};

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: HookOptions) => {
    hookOptions = options;
    return {
      needRefresh: [needRefresh, setNeedRefresh],
      updateServiceWorker,
      offlineReady: [false, vi.fn()],
    };
  },
}));

const { UpdateToast } = await import('../../../src/components/layout/UpdateToast');
const { useWorkspaceStore } = await import('../../../src/state/store');

const workerOf = (build: number) =>
  ({
    postMessage: (_msg: unknown, ports: MessagePort[]) => ports[0]!.postMessage({ build }),
    addEventListener: vi.fn(),
  }) as unknown as ServiceWorker;

const ACTIVE = 1000;

async function offer(build: number) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: () => Promise.resolve({ waiting: workerOf(build), active: workerOf(ACTIVE) }) },
  });
  needRefresh = true;
  await act(async () => {
    hookOptions.onNeedRefresh?.();
    await new Promise((r) => setTimeout(r, 0));
  });
}

const NEWER = ACTIVE + 1;
const OLDER = ACTIVE - 1;

afterEach(cleanup);

beforeEach(() => {
  needRefresh = false;
  hookOptions = {};
  setNeedRefresh.mockClear();
  updateServiceWorker.mockClear();
});

describe('the live region', () => {
  it('is mounted before there is anything to announce', () => {
    render(<UpdateToast />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
  });

  it('is the same element once the update arrives, not a new one', async () => {
    render(<UpdateToast />);
    const before = screen.getByRole('status');
    await offer(NEWER);
    const after = screen.getByRole('status');
    expect(after).toBe(before);
    expect(after.textContent).toContain('A new version is available.');
  });

  it('empties the same region again when the toast is dismissed', async () => {
    const { rerender } = render(<UpdateToast />);
    await offer(NEWER);
    const region = screen.getByRole('status');
    expect(region.textContent).toContain('A new version is available.');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    rerender(<UpdateToast />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toBe('');
  });
});

describe('the toast itself', () => {
  it('offers reload, later and dismiss', async () => {
    render(<UpdateToast />);
    await offer(NEWER);
    screen.getByRole('button', { name: 'Reload' });
    screen.getByRole('button', { name: 'Later' });
    screen.getByRole('button', { name: 'Dismiss' });
  });

  it('applies the waiting worker on reload', async () => {
    render(<UpdateToast />);
    await offer(NEWER);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(updateServiceWorker).toHaveBeenCalledWith(true));
  });

  it('shows that Reload was pressed while the new version activates', async () => {
    render(<UpdateToast />);
    await offer(NEWER);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    const busy = screen.getByRole('button', { name: /Reloading/ }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('hides the body on Later without discarding the waiting worker', async () => {
    render(<UpdateToast />);
    await offer(NEWER);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    expect(setNeedRefresh).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('');
  });
});

/** After a deploy the CDN can serve the previous sw.js, which would reload into a loop. */
describe('only a newer build', () => {
  it('offers nothing for a waiting worker of an older build', async () => {
    render(<UpdateToast />);
    await offer(OLDER);
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('offers nothing for a waiting worker of the same build', async () => {
    render(<UpdateToast />);
    await offer(ACTIVE);
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });

  it('withdraws the offer when an older copy replaces the newer one', async () => {
    render(<UpdateToast />);
    await offer(NEWER);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    await offer(OLDER);
    expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
  });
});

describe('applying while the tab is hidden', () => {
  const hide = () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    useWorkspaceStore.setState({ simBusy: false, driftSweepRun: null });
  });

  it('holds off while a drift sweep flies, and applies once it lands', async () => {
    render(<UpdateToast />);
    await offer(NEWER);
    vi.useFakeTimers();
    useWorkspaceStore.setState({ driftSweepRun: { simId: 's', done: 0, total: 4 } });
    hide();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(updateServiceWorker).not.toHaveBeenCalled();

    useWorkspaceStore.setState({ driftSweepRun: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});

// Last: the page reloads only once per load, so a second reload test would see nothing.
describe('reloading after Reload', () => {
  const realLocation = window.location;
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  });

  it('waits until the new worker leaves the waiting slot', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } });
    const reg = { waiting: workerOf(NEWER), active: workerOf(ACTIVE), update: vi.fn(() => Promise.resolve()) };
    render(<UpdateToast />);
    act(() => hookOptions.onRegisteredSW?.('', reg as unknown as ServiceWorkerRegistration));
    await offer(NEWER);
    // `vi.waitFor` keeps real timers; Testing Library's would stall.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await vi.waitFor(() => expect(updateServiceWorker).toHaveBeenCalledWith(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // A reload now would load the old page through the old worker.
    expect(reload).not.toHaveBeenCalled();

    reg.waiting = undefined as unknown as ServiceWorker;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(reload).toHaveBeenCalledOnce();
  });
});
