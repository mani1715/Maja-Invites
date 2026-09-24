import { Component } from 'react';

// Top-level render guard. Without this, a throw anywhere in the tree unmounts
// the whole app and leaves a white page with no way back — the exact failure
// the legacy app protected against and this one did not.
//
// Two layers, because they fail differently:
//   • a chunk that 404s after a redeploy (stale index.html pointing at deleted
//     hashed bundles) is fixed by ONE hard reload, so we do that automatically
//     and only once, tracked in sessionStorage;
//   • anything else is a real bug — show a recovery card, never a blank screen.
const RELOAD_KEY = 'mj_chunk_reload';

function isChunkLoadError(error) {
  const msg = String(error?.message || error || '');
  return (
    error?.name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept on console rather than swallowed: this is the only signal until a
    // real error-tracking sink is wired (see reportError below).
    // eslint-disable-next-line no-console
    console.error('[MAJA] Unhandled render error', error, info?.componentStack);

    if (isChunkLoadError(error)) {
      let already = null;
      try { already = sessionStorage.getItem(RELOAD_KEY); } catch { /* private mode */ }
      if (!already) {
        try { sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* ignore */ }
        window.location.reload();
        return;
      }
    }

    // Hand off to whatever reporter is installed. window.__mjReportError is set
    // by src/lib/reportError.js; guarded so a missing/broken reporter can never
    // turn a recoverable render error into a second crash.
    try {
      window.__mjReportError?.(error, { componentStack: info?.componentStack });
    } catch { /* never let reporting mask the original error */ }
  }

  reset = () => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* ignore */ }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mj-crash" role="alert">
        <div className="mj-crash-card">
          <p className="mj-crash-kicker">Something broke on this page</p>
          <h1 className="mj-crash-title">We couldn&rsquo;t finish loading.</h1>
          <p className="mj-crash-body">
            This is on us, not you. Reloading fixes it most of the time. If it
            keeps happening, email{' '}
            <a href="mailto:support@majacreations.com">support@majacreations.com</a>{' '}
            and tell us what you were doing.
          </p>
          <div className="mj-crash-actions">
            <button type="button" className="mj-crash-primary" onClick={() => window.location.reload()}>
              Reload the page
            </button>
            <a className="mj-crash-secondary" href="/" onClick={this.reset}>
              Go to home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
