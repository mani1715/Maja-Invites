/**
 * sentry.js — frontend error tracking (SECURITY_AUDIT.md §13).
 *
 * A complete no-op unless REACT_APP_SENTRY_DSN is set at build time. When it is,
 * @sentry/react is loaded via a DYNAMIC import so it only ships (and only runs)
 * where a DSN exists — zero cost to the main bundle otherwise. Monitoring must
 * never break the app, so every path is guarded.
 *
 * To enable: set REACT_APP_SENTRY_DSN (and optionally REACT_APP_ENV,
 * REACT_APP_SENTRY_TRACES) in the frontend build environment.
 */
export function initSentry() {
  const dsn = process.env.REACT_APP_SENTRY_DSN;
  if (!dsn) return;
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.REACT_APP_ENV || process.env.NODE_ENV || 'production',
        tracesSampleRate: Number(process.env.REACT_APP_SENTRY_TRACES || 0.1),
        sendDefaultPii: false,   // never attach user PII
      });
    })
    .catch(() => { /* never let monitoring break the app */ });
}

export default initSentry;
