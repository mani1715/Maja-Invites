import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      isChunkError: false,
      error: null,
      errorInfo: null
    };
  }

  // A failed dynamic import after a redeploy (the route's hashed chunk was
  // replaced by a new build) throws a ChunkLoadError. That's a stale-tab
  // problem, not a real crash — reload once to pull the current build instead
  // of showing the error card.
  static _isChunkError(error) {
    const msg = `${error?.name || ''} ${error?.message || ''}`;
    return /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk|dynamically imported module/i.test(msg);
  }

  // The recovery reload is rate-limited by TIME, not by a one-shot flag.
  //
  // It used to be a flag that `componentDidMount` cleared on every clean mount —
  // but this boundary mounts on the FIRST render, long before a lazy route chunk
  // resolves, so the guard was always cleared before the chunk could fail. A
  // genuinely missing chunk therefore reloaded, cleared the guard, reloaded
  // again... forever. A tab stuck in that loop paints nothing at all, which is
  // exactly the "reload in the panel gives me a blank black page" report (going
  // back worked because that route's chunk was already in memory).
  static RELOAD_WINDOW_MS = 30000;

  static _recentlyReloaded() {
    try {
      const at = Number(sessionStorage.getItem('chunk_reload_at') || 0);
      return at > 0 && Date.now() - at < ErrorBoundary.RELOAD_WINDOW_MS;
    } catch (e) {
      return false;   // storage blocked (private mode): prefer the error card
    }
  }

  // Recover from a stale chunk by pulling a FRESH index.html, not a possibly
  // cache-served copy of the same stale one. A plain window.location.reload()
  // is allowed to come straight from the browser's HTTP cache — the same
  // index.html that references the missing chunk — so it fails again and the
  // panel paints nothing (the "blank black page on reload" report). A one-off
  // `?_v=<ts>` query makes the browser bypass its cache for the document, so
  // the current build's index.html (with the current chunk hashes) is fetched.
  static _cacheBustReload() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('_v', String(Date.now()));
      window.location.replace(url.toString());
    } catch (e) {
      window.location.reload();   // URL API unavailable: best-effort plain reload
    }
  }

  static getDerivedStateFromError(error) {
    const chunk = ErrorBoundary._isChunkError(error);
    if (chunk && !ErrorBoundary._recentlyReloaded()) {
      // Stamp the attempt BEFORE reloading, so the fresh load can see it.
      try { sessionStorage.setItem('chunk_reload_at', String(Date.now())); } catch (e) { /* ignore */ }
      ErrorBoundary._cacheBustReload();
      return { hasError: false, isChunkError: true };
    }
    // One recovery reload already happened and it still fails — stop looping and
    // show something actionable instead of a blank screen.
    return { hasError: true, isChunkError: chunk };
  }

  componentDidMount() {
    // Retire the old one-shot key so upgraded tabs don't carry it around.
    try { sessionStorage.removeItem('chunk_reload'); } catch (e) { /* ignore */ }
  }

  componentDidCatch(error, errorInfo) {
    // Log error details to console in development only
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    // Reload the page to reset the app state
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  // Chunk errors mean the browser is holding a stale index.html whose hashed
  // chunks no longer exist, so a plain reload can be served from cache and fail
  // again. A one-off query param forces a fresh fetch of the document.
  handleHardReload = () => {
    try { sessionStorage.removeItem('chunk_reload_at'); } catch (e) { /* ignore */ }
    const url = new URL(window.location.href);
    url.searchParams.set('_v', String(Date.now()));
    window.location.replace(url.toString());
  };

  render() {
    // A chunk that still won't load after one recovery reload: say what actually
    // happened and offer the fix, rather than the generic "unexpected error".
    if (this.state.hasError && this.state.isChunkError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
                <RefreshCw className="w-10 h-10 text-amber-600" />
              </div>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">This page didn't finish loading</h1>
            <p className="text-gray-600 mb-6">
              MAJA was updated while this tab was open, so part of the app is missing from
              your browser's cache. Nothing is wrong with your account or your data —
              a fresh load fixes it.
            </p>
            <div className="space-y-3">
              <Button
                onClick={this.handleHardReload}
                className="w-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Load the latest version
              </Button>
              <Button onClick={this.handleGoHome} variant="outline"
                className="w-full flex items-center justify-center gap-2">
                <Home className="w-4 h-4" />
                Go to Homepage
              </Button>
            </div>
            <p className="mt-5 text-xs text-gray-400">
              If it keeps happening, a hard refresh (Ctrl+Shift+R) clears the cached copy.
            </p>
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            {/* Icon */}
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              Oops! Something went wrong
            </h1>

            {/* Description */}
            <p className="text-gray-600 mb-6">
              We encountered an unexpected error. Don't worry, your data is safe. Please try refreshing the page.
            </p>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={this.handleReset}
                className="w-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh Page
              </Button>
              
              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
              >
                <Home className="w-4 h-4" />
                Go to Homepage
              </Button>
            </div>

            {/* Development mode error details */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                  Error Details (Dev Only)
                </summary>
                <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs font-mono overflow-auto max-h-40">
                  <p className="text-red-600 font-semibold mb-1">{this.state.error.toString()}</p>
                  <pre className="text-gray-600 whitespace-pre-wrap">
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
