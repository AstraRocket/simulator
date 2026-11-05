import { describe, it, expect, vi, afterEach } from 'vitest';
import { askBuild, isNewerBuild, waitingIsNewer } from '../../../src/services/app/swBuild';

const worker = (reply?: unknown) =>
  ({
    postMessage: (_msg: unknown, ports: MessagePort[]) => {
      if (reply !== undefined) ports[0]!.postMessage(reply);
    },
  }) as unknown as ServiceWorker;

afterEach(() => {
  vi.useRealTimers();
});

describe('askBuild', () => {
  it('returns the build the worker reports', async () => {
    expect(await askBuild(worker({ build: 2000 }))).toBe(2000);
  });

  it('returns null for an answer that is not a build', async () => {
    expect(await askBuild(worker({ build: 'soon' }))).toBeNull();
  });

  it('returns null when the worker never answers, as a build from before the question does', async () => {
    vi.useFakeTimers();
    const pending = askBuild(worker(), 3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await pending).toBeNull();
  });
});

describe('isNewerBuild', () => {
  it('is true only for a waiting build strictly higher than the active one', () => {
    expect(isNewerBuild(2000, 1000)).toBe(true);
    expect(isNewerBuild(1000, 1000)).toBe(false);
    expect(isNewerBuild(500, 1000)).toBe(false);
  });

  it('treats a waiting build that does not answer as not newer', () => {
    expect(isNewerBuild(null, 1000)).toBe(false);
    expect(isNewerBuild(null, null)).toBe(false);
  });

  it('takes any answering build over an active one from before the question existed', () => {
    expect(isNewerBuild(2000, null)).toBe(true);
  });
});

describe('waitingIsNewer', () => {
  const reg = (waiting: ServiceWorker | null, active: ServiceWorker | null) =>
    ({ waiting, active }) as ServiceWorkerRegistration;

  it('is true for a waiting worker of a newer build than the active one', async () => {
    expect(await waitingIsNewer(reg(worker({ build: 2000 }), worker({ build: 1000 })))).toBe(true);
  });

  it('is false for a waiting worker of an older build, as a stale CDN copy is', async () => {
    expect(await waitingIsNewer(reg(worker({ build: 500 }), worker({ build: 1000 })))).toBe(false);
  });

  it('asks a silent active worker again before taking it for an old build', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let asked = 0;
    const slow = {
      postMessage: (_msg: unknown, ports: MessagePort[]) => {
        if (++asked > 1) ports[0]!.postMessage({ build: 1000 });
      },
    } as unknown as ServiceWorker;
    const pending = waitingIsNewer(reg(worker({ build: 500 }), slow));
    await new Promise((r) => setImmediate(r));
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.waitFor(() => expect(asked).toBe(2));
    expect(await pending).toBe(false);
    expect(asked).toBe(2);
  });

  it('still takes up a newer build over an active worker that never answers', async () => {
    vi.useFakeTimers();
    const pending = waitingIsNewer(reg(worker({ build: 2000 }), worker()));
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await pending).toBe(true);
  });

  it('is false with nothing waiting', async () => {
    expect(await waitingIsNewer(reg(null, worker({ build: 1000 })))).toBe(false);
    expect(await waitingIsNewer(null)).toBe(false);
  });
});
