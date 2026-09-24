import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "@/index.css";
import "@/styles/pixora.css";
import "@/styles/luxury.css";
import "@/styles/luxury-overrides.css";
import "@/styles/mobile-fixes.css";
import "@/styles/responsive-fixes.css";
import App from "@/App";
import { initSentry } from "@/sentry";

// Error tracking — no-op unless REACT_APP_SENTRY_DSN is set at build time.
initSentry();

// Mobile scroll perf: ensure all scroll/touch listeners default to passive.
// This prevents 3rd-party libs (or framer-motion subscribers) from
// blocking the main thread on touch/scroll on Android Chrome.
if (typeof window !== 'undefined' && 'EventTarget' in window) {
  const PASSIVE_EVENTS = new Set(['scroll', 'touchmove', 'touchstart', 'wheel', 'mousewheel']);
  const originalAddEventListener = window.EventTarget.prototype.addEventListener;
  window.EventTarget.prototype.addEventListener = function (type, fn, options) {
    if (PASSIVE_EVENTS.has(type)) {
      if (typeof options === 'object' && options !== null) {
        if (options.passive === undefined) options.passive = true;
      } else if (options === undefined || typeof options === 'boolean') {
        options = { capture: !!options, passive: true };
      }
    }
    return originalAddEventListener.call(this, type, fn, options);
  };
}

const rootEl = document.getElementById("root");
// NOTE: `data-booted` is deliberately NOT set here. It is the pre-React recovery
// guard's "React is alive" flag (public/index.html), and setting it before
// render() DISARMED that guard: if the first render threw — a bad chunk, a
// provider blowing up — the splash was gone, nothing was painted, and the
// safety net skipped its own check because the flag already said "booted". That
// is the blank page on reload. App.js now sets it from a mount effect, which
// only runs once React has actually rendered.
const root = ReactDOM.createRoot(rootEl);
root.render(
  <React.StrictMode>
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} storageKey="maja-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
