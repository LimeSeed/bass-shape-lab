export interface PwaCallbacks {
  onReady: () => void;
  onUpdate: (apply: () => void) => void;
  onError: (message: string) => void;
}

/** Register a static, scope-relative worker. A release is applied only on request. */
export function registerPwa(callbacks: PwaCallbacks): () => void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return () => {};
  let disposed = false;
  let applying = false;
  let readyReported = false;
  let registration: ServiceWorkerRegistration | undefined;
  const cleanups: Array<() => void> = [];
  const reportReady = () => {
    if (!disposed && !readyReported) {
      readyReported = true;
      callbacks.onReady();
    }
  };
  const reportError = () => {
    if (!disposed) callbacks.onError('离线缓存未完成，请联网后重试。');
  };
  const reportUpdate = (worker: ServiceWorker) => {
    if (disposed) return;
    callbacks.onUpdate(() => {
      if (disposed) return;
      // A different open tab may already have accepted the same waiting release.
      if (worker.state === 'activated') {
        window.location.reload();
        return;
      }
      if (worker.state !== 'installed' && worker.state !== 'activating') return;
      applying = true;
      if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };
  const onControllerChange = () => {
    if (applying && !disposed) window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  cleanups.push(() => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange));

  const base = new URL(import.meta.env.BASE_URL, window.location.href);
  void navigator.serviceWorker.register(new URL('sw.js', base), {
    scope: base.href,
    updateViaCache: 'none',
  }).then((registered) => {
    if (disposed) return;
    registration = registered;
    if (registered.active?.state === 'activated') reportReady();
    if (registered.waiting) reportUpdate(registered.waiting);

    const watchWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const changed = () => {
        if (disposed) return;
        if (worker.state === 'installed' && registered.active) reportUpdate(worker);
        if (worker.state === 'activated') reportReady();
        if (worker.state === 'redundant') reportError();
      };
      worker.addEventListener('statechange', changed);
      cleanups.push(() => worker.removeEventListener('statechange', changed));
      changed();
    };
    watchWorker(registered.installing);
    const found = () => watchWorker(registered.installing);
    registered.addEventListener('updatefound', found);
    cleanups.push(() => registered.removeEventListener('updatefound', found));
    void registered.update().catch(() => { /* Offline: keep the complete current cache. */ });
  }).catch(reportError);

  const check = () => {
    if (!disposed && navigator.onLine && document.visibilityState === 'visible') {
      void registration?.update().catch(() => {});
    }
  };
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', check);
  cleanups.push(() => window.removeEventListener('online', check));
  cleanups.push(() => document.removeEventListener('visibilitychange', check));
  return () => {
    disposed = true;
    cleanups.forEach((cleanup) => cleanup());
  };
}
