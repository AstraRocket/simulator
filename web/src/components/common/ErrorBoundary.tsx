import { Component, lazy, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogButton } from './DialogButton';

/** Browsers word a failed chunk fetch differently with no distinct error type, so the message is all there is. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ChunkLoadError' ||
    /dynamically imported module|module script failed|MIME type|Loading chunk/i.test(error.message)
  );
}

/** Reload only, no retry: React's `lazy` caches a rejected import forever. */
function ErrorFallback({ error }: { error: Error }) {
  const { t } = useTranslation();
  const stale = isChunkLoadError(error);
  return (
    <div role="alert" className="flex h-full min-h-32 flex-col items-center justify-center gap-3 p-4 text-center">
      <p className="text-sm text-ink-soft">{t(stale ? 'errors.staleBuild' : 'errors.viewFailed')}</p>
      <p className="max-w-md break-words text-[11px] leading-snug text-ink-faint">{error.message}</p>
      <DialogButton variant="primary" size="sm" onClick={() => window.location.reload()}>
        {t('update.reload')}
      </DialogButton>
    </div>
  );
}

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Not the store's error banner: writing a store here re-renders the tree that just threw.
    console.error('view failed to render', error, info.componentStack);
  }

  render() {
    return this.state.error ? <ErrorFallback error={this.state.error} /> : this.props.children;
  }
}

/** The boundary must sit outside the Suspense, which re-throws a failed chunk fetch during render. */
export function LazyBoundary({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}

// `any` is React.lazy's own constraint; the real props type is kept through T.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed<K extends string, T extends ComponentType<any>>(load: () => Promise<Record<K, T>>, key: K) {
  return lazy(() => load().then((m) => ({ default: m[key] })));
}
