// One request per worker at a time, so a timeout terminates exactly the worker that hung.
import { backendPref, kernelLengthUnit } from './openRocketEngine';
import { isKeyed, KeyedError } from '../i18n/keyedError';
import type {
  SimPayload,
  WorkerCall,
  WorkerMethod,
  WorkerReady,
  WorkerRequest,
  WorkerResponse,
  WorkerResults,
} from './simProtocol';

/** Timed from when the worker's engine is ready, not from queueing. */
const SIM_TIMEOUT_MS = 30_000;

/** A cold WASM load on a slow phone takes tens of seconds. */
const LOAD_TIMEOUT_MS = 120_000;

const IDLE_REAP_MS = 60_000;

const MAX_POOL = 4;

export class SimTimeoutError extends Error {
  constructor() {
    super('sim timed out');
    this.name = 'SimTimeoutError';
  }
}

export class SimCanceledError extends Error {
  constructor() {
    super('sim canceled');
    this.name = 'SimCanceledError';
  }
}

interface Pending {
  id: number;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  timeoutMs: number | undefined;
}

interface Slot {
  worker: Worker;
  busy: Pending | null;
  ready: boolean;
  reaper: ReturnType<typeof setTimeout> | undefined;
}

interface Queued {
  call: WorkerCall;
  timeoutMs: number | undefined;
  onStart: (() => void) | undefined;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  slot: Slot | null;
  detach: (() => void) | undefined;
}

const live = new Set<Queued>();

const pool: Slot[] = [];
const queue: Queued[] = [];
let seq = 0;

/** Read per call so a test can stub it. */
function poolLimit(): number {
  const cores = typeof navigator === 'undefined' ? 4 : (navigator.hardwareConcurrency ?? 4);
  return Math.max(1, Math.min(cores - 1, MAX_POOL));
}

function spawn(): Slot {
  // Vite only bundles the worker when it sees this exact new URL(...) form.
  const worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
  const slot: Slot = { worker, busy: null, ready: false, reaper: undefined };
  worker.onmessage = (e: MessageEvent<WorkerResponse | WorkerReady>) => {
    const data = e.data;
    if ('ready' in data) {
      slot.ready = true;
      const busy = slot.busy;
      if (busy) {
        clearTimeout(busy.timer);
        busy.timer = armTimeout(slot, busy.timeoutMs);
      }
      return;
    }
    const msg = data;
    const p = slot.busy;
    // A straggler from a timed-out call must not free a slot serving the next task.
    if (!p || p.id !== msg.id) return;
    if (!msg.ok && msg.fatal) {
      killWorker(slot, replyError(msg));
      return;
    }
    clearTimeout(p.timer);
    slot.busy = null;
    if (msg.ok) p.resolve(msg.result);
    else p.reject(replyError(msg));
    release(slot);
  };
  worker.onerror = (e) => {
    killWorker(
      slot,
      e.message
        ? new KeyedError('errors.sim.workerCrashedReason', { reason: e.message })
        : new KeyedError('errors.sim.workerCrashed'),
    );
  };
  // A structured-clone failure would otherwise leave the call unsettled forever.
  worker.onmessageerror = () => {
    killWorker(slot, new KeyedError('errors.sim.replyUnreadable'));
  };
  pool.push(slot);
  return slot;
}

function replyError(msg: { error: unknown; keyed?: unknown }): Error {
  if (isKeyed(msg.keyed)) return new KeyedError(msg.keyed.key, msg.keyed.values);
  return typeof msg.error === 'string' ? new Error(msg.error) : new KeyedError('errors.sim.replyUnreadable');
}

function killWorker(slot: Slot, err: Error): void {
  const p = slot.busy;
  slot.busy = null;
  clearTimeout(slot.reaper);
  const i = pool.indexOf(slot);
  if (i >= 0) pool.splice(i, 1);
  slot.worker.terminate();
  if (p) {
    clearTimeout(p.timer);
    p.reject(err);
  }
  pump();
}

function release(slot: Slot): void {
  if (pump()) return;
  clearTimeout(slot.reaper);
  slot.reaper = setTimeout(() => {
    if (slot.busy) return;
    const i = pool.indexOf(slot);
    if (i >= 0) pool.splice(i, 1);
    slot.worker.terminate();
  }, IDLE_REAP_MS);
  // Node: without unref() the reaper keeps the test runner alive for a minute.
  (slot.reaper as unknown as { unref?: () => void }).unref?.();
}

function armTimeout(slot: Slot, ms: number | undefined): ReturnType<typeof setTimeout> | undefined {
  return ms && ms > 0 ? setTimeout(() => killWorker(slot, new SimTimeoutError()), ms) : undefined;
}

/** A worker still loading gets the load ceiling until it reports ready. */
function dispatch(slot: Slot, task: Queued): void {
  clearTimeout(slot.reaper);
  slot.reaper = undefined;
  const id = ++seq;
  const pending: Pending = {
    id,
    resolve: task.resolve,
    reject: task.reject,
    timeoutMs: task.timeoutMs,
    timer: armTimeout(slot, slot.ready || !task.timeoutMs ? task.timeoutMs : Math.max(LOAD_TIMEOUT_MS, task.timeoutMs)),
  };
  slot.busy = pending;
  task.slot = slot;
  task.onStart?.();
  slot.worker.postMessage({
    id,
    engine: backendPref(),
    lengthUnit: kernelLengthUnit(),
    ...task.call,
  } satisfies WorkerRequest);
}

function pump(): boolean {
  let moved = false;
  while (queue.length) {
    const free = pool.find((s) => !s.busy) ?? (pool.length < poolLimit() ? spawn() : null);
    if (!free) break;
    const job = queue.shift();
    if (!job) break;
    dispatch(free, job);
    moved = true;
  }
  return moved;
}

export interface SimCallOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  onStart?: () => void;
}

function cancel(task: Queued): void {
  if (!live.has(task)) return;
  settle(task);
  const i = queue.indexOf(task);
  if (i >= 0) queue.splice(i, 1);
  if (task.slot) killWorker(task.slot, new SimCanceledError());
  else task.reject(new SimCanceledError());
}

function settle(task: Queued): void {
  live.delete(task);
  task.detach?.();
  task.detach = undefined;
}

function call<M extends WorkerMethod>(
  c: Extract<WorkerCall, { method: M }>,
  opts: SimCallOptions = {},
): Promise<WorkerResults[M]> {
  return new Promise<WorkerResults[M]>((resolve, reject) => {
    const task: Queued = {
      call: c,
      timeoutMs: opts.timeoutMs,
      onStart: opts.onStart,
      // Leave the live set on settle, or a later cancel kills a worker now flying another task.
      resolve: (v: unknown) => {
        settle(task);
        resolve(v as WorkerResults[M]);
      },
      reject: (e: Error) => {
        settle(task);
        reject(e);
      },
      slot: null,
      detach: undefined,
    };
    const signal = opts.signal;
    if (signal?.aborted) {
      reject(new SimCanceledError());
      return;
    }
    if (signal) {
      const onAbort = () => cancel(task);
      signal.addEventListener('abort', onAbort);
      task.detach = () => signal.removeEventListener('abort', onAbort);
    }
    live.add(task);
    queue.push(task);
    pump();
  });
}

/** Without it a stalled WASM fetch holds the ping's slot busy forever. */
const WARM_TIMEOUT_MS = LOAD_TIMEOUT_MS;

export function warmSimWorker(): void {
  void call({ method: 'ping', args: null }, { timeoutMs: WARM_TIMEOUT_MS }).catch(() => {
    /* best-effort: the first real sim spawns a fresh worker */
  });
}

export function simulateInWorker(payload: SimPayload, opts: SimCallOptions = {}): Promise<WorkerResults['simulate']> {
  return call({ method: 'simulate', args: payload }, { timeoutMs: SIM_TIMEOUT_MS, ...opts });
}
