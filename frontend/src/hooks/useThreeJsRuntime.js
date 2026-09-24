import { useEffect, useRef, useState } from 'react';

const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ||
    (typeof window !== 'undefined' && window.innerWidth <= 768);
};

/**
 * useThreeJsRuntime — central runtime hints for Three.js scenes:
 *   - delay: don't init the renderer until the page's first frame committed
 *   - mobile: scale renderer down to 0.75x on mobile
 *   - frameSkip: render every 2nd frame on mobile (~30 FPS cap)
 *   - supportsOffscreen: hint for moving to OffscreenCanvas if possible
 *
 * Usage:
 *   const { ready, isMobile, scale, shouldRenderFrame } = useThreeJsRuntime();
 *   if (!ready) return null;
 *   const animate = () => {
 *     if (!shouldRenderFrame()) { rafId = requestAnimationFrame(animate); return; }
 *     renderer.render(scene, camera);
 *     rafId = requestAnimationFrame(animate);
 *   };
 */
export default function useThreeJsRuntime({ delayMs = 500 } = {}) {
  const [ready, setReady] = useState(false);
  const isMobile = useRef(isMobileDevice()).current;
  const scale = isMobile ? 0.75 : 1;
  const frameCounter = useRef(0);

  useEffect(() => {
    let id;
    if (typeof requestIdleCallback !== 'undefined') {
      id = requestIdleCallback(() => setReady(true), { timeout: delayMs + 200 });
    } else {
      id = setTimeout(() => setReady(true), delayMs);
    }
    return () => {
      if (typeof cancelIdleCallback !== 'undefined' && typeof id === 'number') {
        try { cancelIdleCallback(id); } catch (_) {}
      } else {
        clearTimeout(id);
      }
    };
  }, [delayMs]);

  const shouldRenderFrame = () => {
    frameCounter.current += 1;
    if (isMobile && frameCounter.current % 2 === 0) return false;
    return true;
  };

  const supportsOffscreen = typeof OffscreenCanvas !== 'undefined';

  return { ready, isMobile, scale, shouldRenderFrame, supportsOffscreen };
}
