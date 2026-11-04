/// <reference lib="webworker" />
import { initEngine, resetEngine, setKernelLengthUnit } from './openRocketEngine';
import { buildConfiguredRocket } from '../services/design/buildRocket';
import type { WorkerReady, WorkerRequest, WorkerResponse } from './simProtocol';
import { errorMessage } from '../services/app/errorMessage';
import { errorReason, KeyedError, type Keyed } from '../i18n/keyedError';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Started by the first request: in a worker `backendPref()` would always say `auto`.
let ready: Promise<void> | null = null;
let fatal: KeyedError | null = null;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  const id = req.id;
  const reply = (r: WorkerResponse) => ctx.postMessage(r);
  const fail = (err: unknown, isFatal?: true) =>
    reply({
      id,
      ok: false,
      error: errorMessage(err),
      ...(err instanceof KeyedError ? { keyed: errorReason(err) as Keyed } : {}),
      ...(isFatal ? { fatal: isFatal } : {}),
    });
  ready ??= initEngine(undefined, req.engine).then(
    () => {
      ctx.postMessage({ ready: true } satisfies WorkerReady);
    },
    (err: unknown) => {
      fatal = new KeyedError('errors.sim.engineLoad', { reason: errorReason(err) });
    },
  );
  try {
    await ready;
    if (fatal) {
      fail(fatal, true);
      return;
    }
    switch (req.method) {
      case 'ping':
        reply({ id, ok: true, result: 'ok' });
        return;
      case 'simulate': {
        const { tree, config, options, lengthUnit } = req.args;
        setKernelLengthUnit(lengthUnit ?? req.lengthUnit);
        resetEngine();
        const design = buildConfiguredRocket(tree, config);
        const result = design.simulate(options);
        reply({ id, ok: true, result });
        return;
      }
      default:
        fail(new KeyedError('errors.sim.unknownMethod', { method: String((req as { method: unknown }).method) }));
    }
  } catch (err) {
    fail(err);
  }
};
