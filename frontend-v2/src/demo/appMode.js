/**
 * appMode.js — Application mode detection and runtime demo configuration.
 *
 * Mode resolution:
 * 1. Runtime override via URL query parameter (?demo=true / ?demo=false)
 * 2. Runtime override via sessionStorage ('maja_app_mode_override')
 * 3. Explicit build environment variable VITE_APP_MODE ('demo' | 'production')
 * 4. Automatic fallback: if VITE_BACKEND_URL is not provided, defaults to 'demo'
 *    so Netlify static previews function completely without a backend.
 *    If VITE_BACKEND_URL is provided, defaults to 'production'.
 */

export function getAppMode() {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('demo');
      if (q === 'true' || q === '1') {
        sessionStorage.setItem('maja_app_mode_override', 'demo');
        return 'demo';
      }
      if (q === 'false' || q === '0') {
        sessionStorage.setItem('maja_app_mode_override', 'production');
        return 'production';
      }
      const override = sessionStorage.getItem('maja_app_mode_override');
      if (override === 'demo' || override === 'production') {
        return override;
      }
    } catch (_e) {
      // Storage unavailable in restrictive sandbox
    }
  }

  const explicit = (import.meta.env.VITE_APP_MODE || '').trim().toLowerCase();
  if (explicit === 'demo') return 'demo';
  if (explicit === 'production') return 'production';

  // If no backend URL was supplied at build time, default to demo mode
  const backend = (import.meta.env.VITE_BACKEND_URL || '').trim();
  return backend ? 'production' : 'demo';
}

export function isDemoMode() {
  return getAppMode() === 'demo';
}

export function setAppModeOverride(mode) {
  try {
    if (mode === 'demo' || mode === 'production') {
      sessionStorage.setItem('maja_app_mode_override', mode);
    } else {
      sessionStorage.removeItem('maja_app_mode_override');
    }
    window.location.reload();
  } catch (_e) {
    // ignore
  }
}

export default isDemoMode;
