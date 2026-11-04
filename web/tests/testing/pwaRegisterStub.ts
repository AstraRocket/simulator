// `virtual:pwa-register/react` exists only in the app build; `vitest.config.ts` aliases it here.
export function useRegisterSW(_options?: {
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
  onNeedRefresh?: () => void;
}): {
  needRefresh: [boolean, (v: boolean) => void];
  offlineReady: [boolean, (v: boolean) => void];
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  return {
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  };
}
