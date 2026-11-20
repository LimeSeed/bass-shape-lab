/** Update notifications never reload an active practice session by themselves. */
export function startPWA(): void {
  if (!('serviceWorker' in navigator)) return;
  const shellVersion = document.querySelector<HTMLMetaElement>('meta[name="btl-build"]')?.content ?? '';
  let registration: ServiceWorkerRegistration | undefined;
  let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;
  let applying = false;
  let reloading = false;
  const announced = new Set<string>();

  function reloadOnce(): void {
    if (!applying || reloading) return;
    reloading = true;
    window.location.reload();
  }
  function announce(version: string): void {
    if (!version || version === shellVersion || announced.has(version)) return;
    announced.add(version);
    window.dispatchEvent(new CustomEvent('app-update-ready', { detail: { version } }));
  }
  function reportVersion(worker: ServiceWorker | null | undefined): void {
    worker?.postMessage({ type: 'BTL_CLIENT_VERSION', version: shellVersion });
  }
  function queryVersion(worker: ServiceWorker | null | undefined): void {
    if (!worker || !['installed', 'activating', 'activated'].includes(worker.state)) return;
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => channel.port1.close(), 2500);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      channel.port1.close();
      if (typeof event.data?.version === 'string') announce(event.data.version);
    };
    worker.postMessage({ type: 'BTL_GET_VERSION' }, [channel.port2]);
  }
  function observe(worker: ServiceWorker | null): void {
    if (!worker) return;
    const changed = () => {
      if (worker.state === 'installed' || worker.state === 'activated') queryVersion(worker);
      if (worker.state === 'redundant' && !registration?.active) window.dispatchEvent(new Event('offline-failed'));
    };
    worker.addEventListener('statechange', changed);
    changed();
  }
  async function checkForUpdate(): Promise<void> {
    if (!registration || !navigator.onLine) return;
    try {
      await registration.update();
      queryVersion(registration.waiting ?? registration.active);
      reportVersion(registration.active);
    } catch { /* Keep the working app and its offline cache when the network is unavailable. */ }
  }
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'BTL_UPDATE_READY') announce(event.data.version);
    if (event.data?.type === 'BTL_QUERY_CLIENT_VERSION') {
      (event.source as ServiceWorker | null)?.postMessage({ type: 'BTL_CLIENT_VERSION', version: shellVersion });
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // skipWaiting may replace the controller even without clients.claim().
    // Only the tab whose user requested the update may refresh.
    if (applying) reloadOnce();
    else {
      reportVersion(navigator.serviceWorker.controller);
      queryVersion(navigator.serviceWorker.controller);
    }
  });
  window.addEventListener('app-apply-update', () => {
    if (applying || reloading) return;
    applying = true;
    void (async () => {
      try {
        const current = registration ?? await registrationPromise;
        if (!current) { reloadOnce(); return; }
        const waiting = current.waiting;
        if (waiting) {
          waiting.addEventListener('statechange', () => {
            if (waiting.state === 'activated') reloadOnce();
          });
          waiting.postMessage({ type: 'SKIP_WAITING' });
          window.setTimeout(() => {
            if (current.active?.state === 'activated') reloadOnce();
            else {
              applying = false;
              window.dispatchEvent(new Event('app-update-error'));
            }
          }, 5000);
        } else reloadOnce();
      } catch {
        applying = false;
        window.dispatchEvent(new Event('app-update-error'));
      }
    })();
  });
  window.addEventListener('online', () => void checkForUpdate());
  window.addEventListener('pageshow', () => void checkForUpdate());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  }, 5 * 60 * 1000);

  function register(): void {
    registrationPromise = navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' });
    void registrationPromise.then(async current => {
      registration = current;
      current.addEventListener('updatefound', () => observe(current.installing));
      observe(current.installing);
      queryVersion(current.waiting ?? current.active);
      await navigator.serviceWorker.ready;
      reportVersion(current.active);
      window.dispatchEvent(new Event('offline-ready'));
      void checkForUpdate();
    }).catch(() => window.dispatchEvent(new Event('offline-failed')));
  }
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
