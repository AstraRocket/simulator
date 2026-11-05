import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimPayload } from '../../src/engine/simProtocol';

// The client caches its worker pool, so each test resets modules and re-imports.

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onmessageerror: ((e: unknown) => void) | null = null;
  terminate = vi.fn();
  posts: { id: number; engine?: string; method?: string }[] = [];
  static onPost: (self: FakeWorker, msg: { id: number }) => void = () => {};
  static cold = false;
  private loaded = false;
  postMessage(msg: { id: number }) {
    this.posts.push(msg);
    if (!FakeWorker.cold && !this.loaded) this.ready();
    FakeWorker.onPost(this, msg);
  }
  ready() {
    this.loaded = true;
    this.onmessage?.({ data: { ready: true } } as MessageEvent);
  }
  reply(id: number, result: unknown = { ok: true }) {
    this.onmessage?.({ data: { id, ok: true, result } } as MessageEvent);
  }
  fail(id: number, error: string, fatal?: true) {
    this.onmessage?.({ data: { id, ok: false, error, fatal } } as MessageEvent);
  }
}

const created: FakeWorker[] = [];

// The pool takes n-1 cores, capped at 4.
function withCores(n: number) {
  vi.stubGlobal('navigator', { hardwareConcurrency: n });
}

beforeEach(() => {
  created.length = 0;
  FakeWorker.onPost = () => {};
  FakeWorker.cold = false;
  vi.stubGlobal(
    'Worker',
    // A regular function, not an arrow: `new Worker(...)` needs a constructable stub.
    vi.fn(function () {
      const w = new FakeWorker();
      created.push(w);
      return w;
    }),
  );
  withCores(2);
  vi.useFakeTimers();
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const payload = {} as unknown as SimPayload;

// Its armed timeout would otherwise reject unhandled in whichever later test advances the clock.
function fire(run: () => Promise<unknown>): void {
  void run().catch(() => {});
}

describe('simClient timeout', () => {
  it('rejects with SimTimeoutError and terminates a hung worker', async () => {
    const { simulateInWorker, SimTimeoutError } = await import('../../src/engine/simClient');
    const p = simulateInWorker(payload, { timeoutMs: 1000 });
    const rejects = expect(p).rejects.toBeInstanceOf(SimTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await rejects;
    expect(created).toHaveLength(1);
    expect(created[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('resolves normally and does not fire the timeout for a prompt reply', async () => {
    FakeWorker.onPost = (self, msg) => self.reply(msg.id, { apogee: 42 });
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const result = await simulateInWorker(payload, { timeoutMs: 1000 });
    expect(result).toEqual({ apogee: 42 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(created[0]!.terminate).not.toHaveBeenCalled();
  });
});

describe('simClient pool', () => {
  it('runs several sims at once, one per worker', async () => {
    withCores(5);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    for (let i = 0; i < 4; i++) fire(() => simulateInWorker(payload));
    expect(created).toHaveLength(4);
    expect(created.map((w) => w.posts.length)).toEqual([1, 1, 1, 1]);
  });

  it('leaves a core for the main thread and caps the pool', async () => {
    withCores(32);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    for (let i = 0; i < 8; i++) fire(() => simulateInWorker(payload));
    expect(created).toHaveLength(4);
  });

  it('queues past the pool limit and dispatches as workers free up', async () => {
    withCores(3);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const started: number[] = [];
    for (let i = 0; i < 3; i++) fire(() => simulateInWorker(payload, { onStart: () => started.push(i) }));
    expect(created).toHaveLength(2);
    expect(started).toEqual([0, 1]);

    created[0]!.reply(created[0]!.posts[0]!.id);
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    expect(created).toHaveLength(2);
    expect(created[0]!.posts).toHaveLength(2);
  });

  it('spawns lazily rather than filling the pool up front', async () => {
    withCores(5);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    fire(() => simulateInWorker(payload));
    expect(created).toHaveLength(1);
  });

  it('a timeout kills only the worker that hung', async () => {
    withCores(3);
    const { simulateInWorker, SimTimeoutError } = await import('../../src/engine/simClient');
    const hung = simulateInWorker(payload, { timeoutMs: 1000 });
    const healthy = simulateInWorker(payload, { timeoutMs: 1000 });
    expect(created).toHaveLength(2);

    // Attached before the clock moves, or the rejection is unhandled at that instant.
    const rejects = expect(hung).rejects.toBeInstanceOf(SimTimeoutError);

    created[1]!.reply(created[1]!.posts[0]!.id, { apogee: 7 });
    await expect(healthy).resolves.toEqual({ apogee: 7 });

    await vi.advanceTimersByTimeAsync(1000);
    await rejects;
    expect(created[0]!.terminate).toHaveBeenCalledOnce();
    expect(created[1]!.terminate).not.toHaveBeenCalled();
  });

  it('a crashed worker fails only its own call, and the pool recovers', async () => {
    withCores(3);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const doomed = simulateInWorker(payload);
    const other = simulateInWorker(payload);
    created[0]!.onerror?.({ message: 'boom' });
    await expect(doomed).rejects.toThrow('boom');

    created[1]!.reply(created[1]!.posts[0]!.id, { apogee: 1 });
    await expect(other).resolves.toEqual({ apogee: 1 });

    FakeWorker.onPost = (self, msg) => self.reply(msg.id, { apogee: 2 });
    await expect(simulateInWorker(payload)).resolves.toEqual({ apogee: 2 });
  });

  it('reaps idle workers so an editing session does not sit on four engines', async () => {
    withCores(5);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const both = Promise.all([simulateInWorker(payload), simulateInWorker(payload)]);
    expect(created).toHaveLength(2);
    for (const w of created) w.reply(w.posts[0]!.id, { apogee: 3 });
    await both;
    expect(created.every((w) => !w.terminate.mock.calls.length)).toBe(true);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(created.every((w) => w.terminate.mock.calls.length === 1)).toBe(true);

    FakeWorker.onPost = (self, msg) => self.reply(msg.id, { apogee: 3 });
    await expect(simulateInWorker(payload)).resolves.toEqual({ apogee: 3 });
    expect(created).toHaveLength(3);
  });

  it('does not reap a worker that picked up new work while idling', async () => {
    withCores(2);
    FakeWorker.onPost = (self, msg) => self.reply(msg.id, { apogee: 4 });
    const { simulateInWorker } = await import('../../src/engine/simClient');
    await simulateInWorker(payload);
    await vi.advanceTimersByTimeAsync(30_000);
    await simulateInWorker(payload);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(created).toHaveLength(1);
    expect(created[0]!.terminate).not.toHaveBeenCalled();
  });
});

describe('simClient cancel', () => {
  it('drops a queued run without touching any worker', async () => {
    withCores(2);
    const { simulateInWorker, SimCanceledError } = await import('../../src/engine/simClient');
    const ac = new AbortController();
    const running = simulateInWorker(payload);
    const waiting = simulateInWorker(payload, { signal: ac.signal });
    expect(created).toHaveLength(1);

    const rejects = expect(waiting).rejects.toBeInstanceOf(SimCanceledError);
    ac.abort();
    await rejects;
    expect(created[0]!.terminate).not.toHaveBeenCalled();

    created[0]!.reply(created[0]!.posts[0]!.id, { apogee: 5 });
    await expect(running).resolves.toEqual({ apogee: 5 });
  });

  it('terminates the worker of a run already in flight', async () => {
    withCores(3);
    const { simulateInWorker, SimCanceledError } = await import('../../src/engine/simClient');
    const ac = new AbortController();
    const doomed = simulateInWorker(payload, { signal: ac.signal });
    const other = simulateInWorker(payload);

    const rejects = expect(doomed).rejects.toBeInstanceOf(SimCanceledError);
    ac.abort();
    await rejects;
    expect(created[0]!.terminate).toHaveBeenCalledOnce();
    expect(created[1]!.terminate).not.toHaveBeenCalled();
    created[1]!.reply(created[1]!.posts[0]!.id, { apogee: 6 });
    await expect(other).resolves.toEqual({ apogee: 6 });
  });

  it('hands a freed-up worker the next queued run when one is canceled', async () => {
    withCores(2);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const ac = new AbortController();
    const started: string[] = [];
    fire(() => simulateInWorker(payload, { signal: ac.signal, onStart: () => started.push('first') }));
    fire(() => simulateInWorker(payload, { onStart: () => started.push('second') }));
    expect(started).toEqual(['first']);

    ac.abort();
    await Promise.resolve();
    expect(started).toEqual(['first', 'second']);
    expect(created).toHaveLength(2);
  });

  it('does nothing when the run has already finished', async () => {
    FakeWorker.onPost = (self, msg) => self.reply(msg.id, { apogee: 9 });
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const ac = new AbortController();
    await expect(simulateInWorker(payload, { signal: ac.signal })).resolves.toEqual({ apogee: 9 });
    ac.abort();
    expect(created[0]!.terminate).not.toHaveBeenCalled();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const { simulateInWorker, SimCanceledError } = await import('../../src/engine/simClient');
    const ac = new AbortController();
    ac.abort();
    await expect(simulateInWorker(payload, { signal: ac.signal })).rejects.toBeInstanceOf(SimCanceledError);
    expect(created).toHaveLength(0);
  });
});

describe('simClient worker retirement', () => {
  it('kills a worker that reports a FATAL engine failure and spawns a fresh one for the next call', async () => {
    FakeWorker.onPost = (self, msg) => self.fail(msg.id, 'engine failed to load', true);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    await expect(simulateInWorker(payload)).rejects.toThrow('engine failed to load');
    expect(created[0]!.terminate).toHaveBeenCalledOnce();

    FakeWorker.onPost = (self, msg) => self.reply(msg.id, { apogee: 1 });
    await expect(simulateInWorker(payload)).resolves.toEqual({ apogee: 1 });
    expect(created).toHaveLength(2);
  });

  it('a plain (non-fatal) error rejects the call but keeps the worker', async () => {
    FakeWorker.onPost = (self, msg) => self.fail(msg.id, 'bad geometry');
    const { simulateInWorker } = await import('../../src/engine/simClient');
    await expect(simulateInWorker(payload)).rejects.toThrow('bad geometry');
    expect(created[0]!.terminate).not.toHaveBeenCalled();
  });

  it('kills the slot on a reply that cannot be deserialized (onmessageerror)', async () => {
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const p = simulateInWorker(payload);
    const rejects = expect(p).rejects.toMatchObject({ key: 'errors.sim.replyUnreadable' });
    created[0]!.onmessageerror?.({});
    await rejects;
    expect(created[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('rebuilds a keyed error from the reply, so the main thread can translate it', async () => {
    const keyed = { key: 'errors.motorCurve.noMass', values: { motor: 'F67' } };
    FakeWorker.onPost = (self, msg) =>
      self.onmessage?.({ data: { id: msg.id, ok: false, error: 'English for logs', keyed } } as MessageEvent);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const { KeyedError } = await import('../../src/i18n/keyedError');
    const err = await simulateInWorker(payload).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KeyedError);
    expect(err).toMatchObject(keyed);
    expect(created[0]!.terminate).not.toHaveBeenCalled();
  });

  it('rebuilds a keyed FATAL error too, and still retires the worker', async () => {
    const keyed = { key: 'errors.sim.engineLoad', values: { reason: 'no WASM' } };
    FakeWorker.onPost = (self, msg) =>
      self.onmessage?.({
        data: { id: msg.id, ok: false, error: 'English for logs', keyed, fatal: true },
      } as MessageEvent);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    await expect(simulateInWorker(payload)).rejects.toMatchObject(keyed);
    expect(created[0]!.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    ['no key', { values: { motor: 'F67' } }],
    ['an empty key', { key: '' }],
    ['a value that is not text', { key: 'errors.motorCurve.noMass', values: { motor: { nested: true } } }],
    ['values that are a list', { key: 'errors.motorCurve.noMass', values: ['F67'] }],
  ])('falls back to the English text when the keyed part has %s', async (_what, keyed) => {
    FakeWorker.onPost = (self, msg) =>
      self.onmessage?.({ data: { id: msg.id, ok: false, error: 'English for logs', keyed } } as MessageEvent);
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const { KeyedError } = await import('../../src/i18n/keyedError');
    const err = await simulateInWorker(payload).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(KeyedError);
    expect((err as Error).message).toBe('English for logs');
  });

  it('carries the backend preference on every request, since a worker cannot read it', async () => {
    const { simulateInWorker, warmSimWorker } = await import('../../src/engine/simClient');
    warmSimWorker();
    fire(() => simulateInWorker(payload));
    expect(created[0]!.posts.map((p) => [p.method, p.engine])).toEqual([['ping', 'auto']]);
  });
});

describe('a call on a cold worker', () => {
  it('times the flight from the engine being ready, not from dispatch', async () => {
    FakeWorker.cold = true;
    const { simulateInWorker } = await import('../../src/engine/simClient');
    const p = simulateInWorker(payload, { timeoutMs: 1000 });
    let settled = false;
    void p.then(
      () => (settled = true),
      () => (settled = true),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(settled).toBe(false);
    expect(created[0]!.terminate).not.toHaveBeenCalled();
    created[0]!.ready();
    await vi.advanceTimersByTimeAsync(999);
    created[0]!.reply(created[0]!.posts[0]!.id, { apogee: 7 });
    await expect(p).resolves.toEqual({ apogee: 7 });
  });

  it('still times out a flight that hangs after the load', async () => {
    FakeWorker.cold = true;
    const { simulateInWorker, SimTimeoutError } = await import('../../src/engine/simClient');
    const p = simulateInWorker(payload, { timeoutMs: 1000 });
    const rejects = expect(p).rejects.toBeInstanceOf(SimTimeoutError);
    await vi.advanceTimersByTimeAsync(5000);
    created[0]!.ready();
    await vi.advanceTimersByTimeAsync(1000);
    await rejects;
    expect(created[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('fails a load that never finishes at the load ceiling', async () => {
    FakeWorker.cold = true;
    const { simulateInWorker, SimTimeoutError } = await import('../../src/engine/simClient');
    const p = simulateInWorker(payload, { timeoutMs: 1000 });
    const rejects = expect(p).rejects.toBeInstanceOf(SimTimeoutError);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(created[0]!.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejects;
    expect(created[0]!.terminate).toHaveBeenCalledOnce();
  });

  it('gives a warm worker only the call timeout', async () => {
    const { simulateInWorker, SimTimeoutError } = await import('../../src/engine/simClient');
    fire(() => simulateInWorker(payload, { timeoutMs: 1000 }).then(() => undefined));
    created[0]!.reply(created[0]!.posts[0]!.id);
    await vi.advanceTimersByTimeAsync(0);
    const p = simulateInWorker(payload, { timeoutMs: 1000 });
    const rejects = expect(p).rejects.toBeInstanceOf(SimTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await rejects;
  });
});
