// Frontend error sink. The legacy app shipped Sentry; this build has no
// third-party agent, so errors are POSTed to the backend's own CSP/report
// endpoint family instead — no extra vendor, no extra bundle weight, and it
// works behind the same CSP the Caddyfile already allows ('self').
//
// Install once from main.jsx. Everything here is best-effort: a reporting
// failure must never surface to the user or throw inside an error handler.

const ENDPOINT = '/api/client-error';
const MAX_PER_SESSION = 10;
const DEDUPE_MS = 5000;

let sent = 0;
const recent = new Map(); // signature -> timestamp

function shouldSend(signature) {
  if (sent >= MAX_PER_SESSION) return false;
  const now = Date.now();
  const last = recent.get(signature);
  if (last && now - last < DEDUPE_MS) return false;
  recent.set(signature, now);
  return true;
}

function post(payload) {
  const body = JSON.stringify(payload);
  try {
    // sendBeacon survives page unload, which is exactly when a nav-time error
    // would otherwise be lost. Falls back to fetch+keepalive.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch { /* fall through */ }
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch { /* give up silently */ }
}

export function reportError(error, extra = {}) {
  const message = String(error?.message || error || 'Unknown error');
  const signature = `${message}::${extra.componentStack ? 'render' : 'runtime'}`;
  if (!shouldSend(signature)) return;
  sent += 1;
  post({
    message,
    name: error?.name || null,
    stack: typeof error?.stack === 'string' ? error.stack.slice(0, 4000) : null,
    component_stack: extra.componentStack ? String(extra.componentStack).slice(0, 4000) : null,
    url: window.location.href,
    user_agent: navigator.userAgent,
    at: new Date().toISOString(),
  });
}

/** Wire global handlers + expose the hook ErrorBoundary calls. Idempotent. */
export function installErrorReporting() {
  if (window.__mjReportError) return;
  window.__mjReportError = reportError;

  window.addEventListener('error', (e) => {
    // Resource load failures (img/script) arrive here with no `error` object
    // and would otherwise spam the sink with empty reports.
    if (!e.error) return;
    reportError(e.error);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e?.reason;
    if (!reason) return;
    reportError(reason instanceof Error ? reason : new Error(String(reason)));
  });
}
