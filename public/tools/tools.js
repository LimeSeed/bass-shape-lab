const updateNotice = document.getElementById('update-notice');
const cacheError = document.getElementById('cache-error');
let applying = false;
let registration;

function showUpdate(worker) {
  updateNotice.hidden = false;
  document.getElementById('apply-update').onclick = () => {
    if (worker.state === 'activated') {
      location.reload();
    } else if (worker.state === 'installed' || worker.state === 'activating') {
      applying = true;
      if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' });
    }
  };
}

function watchWorker(worker) {
  if (!worker) return;
  const changed = () => {
    if (worker.state === 'installed' && registration.active) showUpdate(worker);
    if (worker.state === 'activated') cacheError.hidden = true;
    if (worker.state === 'redundant') cacheError.hidden = false;
  };
  worker.addEventListener('statechange', changed);
  changed();
}

async function prepareOffline() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const base = new URL('../', location.href);
    registration = await navigator.serviceWorker.register(new URL('sw.js', base), {
      scope: base.href,
      updateViaCache: 'none',
    });
    if (registration.waiting) showUpdate(registration.waiting);
    watchWorker(registration.installing);
    registration.addEventListener('updatefound', () => watchWorker(registration.installing));
    cacheError.hidden = true;
    void registration.update().catch(() => {});
  } catch {
    cacheError.hidden = false;
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });
  window.addEventListener('online', () => {
    if (registration) void registration.update().catch(() => {});
    else void prepareOffline();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) void registration?.update().catch(() => {});
  });
}
document.getElementById('retry-cache').onclick = () => { void prepareOffline(); };
void prepareOffline();
