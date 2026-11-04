import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import { APP_VERSION } from '../../services/app/appInfo';
import {
  UPDATE_POLL_MS,
  dueForCheck,
  snoozeUntil,
  UPDATE_SNOOZE_MS,
  readyToApplyHidden,
} from '../../services/app/updateCheck';
import { workInProgress } from '../../state/workInProgress';
import { useUpdateStore } from '../../state/updateStore';
import { waitingIsNewer } from '../../services/app/swBuild';
import { Banner } from '../common/Banner';

// The browser checks for a new worker only on navigation, so this polls.
// Only a newer build is offered: the browser reports any differing sw.js as waiting (swBuild.ts).
export function UpdateToast() {
  const lastCheck = useRef<number | null>(null);
  const [snoozed, setSnoozed] = useState<number | null>(null);

  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);

  const [waiting, setWaiting] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      lastCheck.current = Date.now(); // registering just did one
      setSwReg(registration ?? null);
    },
    onNeedRefresh() {
      void navigator.serviceWorker
        .getRegistration()
        .then(waitingIsNewer)
        .then(setWaiting, () => setWaiting(false));
    },
    // Through `reloadOnce` so this and the reload `apply` arranges never both run.
    onNeedReload: reloadOnce,
  });

  // The library reloads only on a controller change, which a first-visit tab
  // (`clientsClaim` off) never sees, so also wait for `activated`.
  const apply = useCallback(async () => {
    const next = swReg?.waiting;
    if (swReg && !next) {
      reloadOnce();
      return;
    }
    // Asked again: a stale copy can take the waiting slot after the prompt.
    if (next && !(await waitingIsNewer(swReg))) {
      setWaiting(false);
      return;
    }
    next?.addEventListener('statechange', () => next.state === 'activated' && reloadOnce());
    if (swReg) setTimeout(reloadOnce, APPLY_FALLBACK_MS);
    void updateServiceWorker(true);
  }, [swReg, updateServiceWorker]);

  useEffect(() => {
    if (!swReg) return;
    const check = () => {
      const now = Date.now();
      if (!dueForCheck(lastCheck.current, now)) return;
      lastCheck.current = now;
      void swReg.update().catch(() => {});
    };
    const onVisible = () => document.visibilityState === 'visible' && check();
    const id = setInterval(check, UPDATE_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, [swReg]);

  useEffect(() => {
    if (!swReg) return;
    const { setChecker } = useUpdateStore.getState();
    setChecker(async () => {
      lastCheck.current = Date.now();
      await swReg.update();
      const installing = swReg.installing;
      if (installing) {
        await new Promise<void>((done) => {
          const settle = () => {
            if (installing.state === 'installed' || installing.state === 'redundant') done();
          };
          installing.addEventListener('statechange', settle);
          settle();
        });
      }
      if (!(await waitingIsNewer(swReg))) return 'upToDate';
      setWaiting(true);
      setSnoozed(null);
      setNeedRefresh(true);
      return 'available';
    });
    return () => setChecker(null);
  }, [swReg, setNeedRefresh]);

  // `workInProgress` is read, not subscribed to: re-running this effect would restart the clock.
  useEffect(() => {
    if (!waiting) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      stop();
      if (document.visibilityState !== 'hidden') return;
      const hiddenSince = Date.now();
      timer = setInterval(() => {
        if (!readyToApplyHidden(true, hiddenSince, workInProgress(), Date.now())) return;
        stop();
        void apply();
      }, 5_000);
    };
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility(); // the tab may be hidden already
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [waiting, apply]);

  // Snoozing keeps `needRefresh`, so the prompt returns when the snooze ends.
  useEffect(() => {
    if (snoozed === null) return;
    const id = setTimeout(() => setSnoozed(null), Math.max(0, snoozed - Date.now()));
    return () => clearTimeout(id);
  }, [snoozed]);

  const later = useCallback(() => setSnoozed(snoozeUntil(Date.now())), []);

  // `waiting` is the newer-build check: `needRefresh` fires for older workers too.
  const show = needRefresh && waiting && snoozed === null;

  // Always mounted: screen readers skip a live region created with its text.
  return (
    <div role="status" aria-live="polite">
      {show && (
        <UpdateToastBody onRefresh={() => void apply()} onLater={later} onDismiss={() => setNeedRefresh(false)} />
      )}
    </div>
  );
}

const APPLY_FALLBACK_MS = 10_000;

let reloading = false;

function reloadOnce(): void {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

function UpdateToastBody({
  onRefresh,
  onLater,
  onDismiss,
}: {
  onRefresh: () => void;
  onLater: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [applying, setApplying] = useState(false);
  return (
    <Banner tone="accent" onDismiss={applying ? undefined : onDismiss} dismissLabel={t('update.dismiss')}>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('update.available')}</p>
        <p className="text-xs text-accent-200">{t('update.running', { version: APP_VERSION })}</p>
      </div>
      <button
        onClick={() => {
          setApplying(true);
          onRefresh();
        }}
        disabled={applying}
        aria-busy={applying}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-accent-600 px-3 py-1.5 font-semibold text-on-accent transition-transform hover:bg-accent-700 active:scale-95 active:bg-accent-700 disabled:cursor-wait disabled:bg-accent-700 disabled:active:scale-100"
      >
        {applying && (
          <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-line/40 border-t-white" />
        )}
        {applying ? t('update.reloading') : t('update.reload')}
      </button>
      {!applying && (
        <button
          onClick={onLater}
          title={t('update.laterTitle', { hours: Math.round(UPDATE_SNOOZE_MS / 3_600_000) })}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-accent-200 hover:text-on-accent"
        >
          {t('update.later')}
        </button>
      )}
    </Banner>
  );
}
