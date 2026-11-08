import { create } from 'zustand';
import { engineRetryCanRecover, initEngine, resetEngineInit, type EngineLoadStatus } from '../engine/openRocketEngine';
import { errorReason, type Keyed } from '../i18n/keyedError';

// A stalled fetch neither resolves nor rejects, so the app mounts before the engine loads.
type EnginePhase = 'loading' | 'ready' | 'failed';

const SLOW_AFTER_MS = 15_000;

interface EngineState {
  phase: EnginePhase;
  backend: 'wasm' | 'js' | null;
  status: EngineLoadStatus | null;
  slow: boolean;
  error: string | Keyed | null;
  needsReload: boolean;
  start: () => void;
  retry: () => void;
  reload: () => void;
}

export const useEngineStore = create<EngineState>((set) => {
  // An abandoned (stalled) load keeps running; its callbacks must not overwrite a newer attempt.
  let attempt = 0;
  let slowTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSlowTimer = () => {
    if (slowTimer !== null) clearTimeout(slowTimer);
    slowTimer = null;
  };

  const run = () => {
    const mine = attempt;
    clearSlowTimer();
    slowTimer = setTimeout(() => {
      if (mine === attempt) set({ slow: true, needsReload: !engineRetryCanRecover() });
    }, SLOW_AFTER_MS);
    set({ phase: 'loading', status: null, error: null, slow: false });

    initEngine((s) => {
      if (mine === attempt) set({ status: s, needsReload: !engineRetryCanRecover() });
    })
      .then((backend) => {
        if (mine !== attempt) return;
        clearSlowTimer();
        set({ phase: 'ready', backend, status: null, error: null, slow: false });
      })
      .catch((e: unknown) => {
        if (mine !== attempt) return;
        clearSlowTimer();
        console.warn('engine load failed', e);
        set({ phase: 'failed', error: errorReason(e), status: null, needsReload: !engineRetryCanRecover() });
      });
  };

  return {
    phase: 'loading',
    backend: null,
    status: null,
    slow: false,
    error: null,
    needsReload: false,
    start: run,
    retry: () => {
      attempt++;
      resetEngineInit();
      run();
    },
    reload: () => location.reload(),
  };
});

export const useEngineReady = (): boolean => useEngineStore((s) => s.phase === 'ready');
