/**
 * useCanvasVisibility — IntersectionObserver + document visibility hook.
 *
 * Returns { ref, visible } — pass `ref` to the canvas/container element and
 * gate your requestAnimationFrame loop on `visible`. This pauses heavy
 * animations when off-screen or when the tab is hidden, dramatically reducing
 * CPU & battery use on mobile.
 *
 * Usage:
 *   const { ref, visible } = useCanvasVisibility();
 *   useEffect(() => {
 *     if (!visible) return;        // animation paused — don't even start RAF
 *     const id = requestAnimationFrame(tick);
 *     return () => cancelAnimationFrame(id);
 *   }, [visible]);
 *   return <canvas ref={ref} />;
 */
import { useEffect, useRef, useState } from 'react';

export default function useCanvasVisibility({ rootMargin = '50px' } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let intersecting = true;
    let tabVisible = typeof document !== 'undefined' ? !document.hidden : true;

    const apply = () => setVisible(intersecting && tabVisible);

    let io;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            intersecting = e.isIntersecting;
          }
          apply();
        },
        { rootMargin, threshold: 0 }
      );
      io.observe(el);
    } else {
      intersecting = true;
      apply();
    }

    const onVis = () => {
      tabVisible = !document.hidden;
      apply();
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [rootMargin]);

  return { ref, visible };
}
