import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * RouteCleanup — fires global cleanup on every route change:
 *   - Revokes blob: object URLs registered via window.__registerBlobUrl()
 *   - Cancels pending timeouts/intervals registered via window.__registerTimer()
 *   - Fires a `route:cleanup` CustomEvent so components can listen + free memory
 *
 * Mount once near the router root. Helpers below are noop-safe and exposed on
 * `window` so any module can opt in without importing this file.
 */
if (typeof window !== 'undefined' && !window.__perfRegistry) {
  window.__perfRegistry = { urls: new Set(), timers: new Set() };
  window.__registerBlobUrl = (url) => {
    try { window.__perfRegistry.urls.add(url); } catch (_) {}
  };
  window.__registerTimer = (id) => {
    try { window.__perfRegistry.timers.add(id); } catch (_) {}
  };
}

export default function RouteCleanup() {
  const location = useLocation();
  const prev = useRef(location.pathname);

  useEffect(() => {
    if (prev.current === location.pathname) return;
    prev.current = location.pathname;
    document.body.style.overflow = ''
    document.body.style.touchAction = ''
    document.documentElement.style.overflow = ''
    try {
      const reg = window.__perfRegistry;
      if (reg) {
        reg.urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (_) {} });
        reg.urls.clear();
        reg.timers.forEach((id) => {
          try { clearTimeout(id); } catch (_) {}
          try { clearInterval(id); } catch (_) {}
        });
        reg.timers.clear();
      }
      window.dispatchEvent(new CustomEvent('route:cleanup'));
    } catch (_) {}
  }, [location.pathname]);

  return null;
}
