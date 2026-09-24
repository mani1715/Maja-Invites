import { useEffect, useRef } from 'react';

/**
 * useAbortController — auto-aborts in-flight requests on unmount / route change.
 *
 * Usage:
 *   const getSignal = useAbortController();
 *   useEffect(() => {
 *     axios.get('/api/...', { signal: getSignal() });
 *   }, []);
 *
 * Or with fetch:
 *   fetch(url, { signal: getSignal() })
 */
export default function useAbortController() {
  const ref = useRef(null);

  const get = () => {
    if (!ref.current) {
      ref.current = new AbortController();
    }
    return ref.current.signal;
  };

  useEffect(() => {
    return () => {
      try {
        if (ref.current) ref.current.abort();
      } catch (_) {}
      ref.current = null;
    };
  }, []);

  return get;
}
