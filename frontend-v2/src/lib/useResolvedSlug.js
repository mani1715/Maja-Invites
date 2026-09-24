import { useEffect, useState } from 'react';
import { resolveByNumber } from '@/api/invitations';

// A public invite identifier in the URL may be a NUMBER (00001) or a legacy
// slug. This resolves a numeric identifier to the real slug once (via the
// backend by-number endpoint) so downstream gallery/RSVP/etc. calls keep using
// the slug — no other endpoint needs to understand numbers. A non-numeric
// identifier is returned as-is with no request.
//
// Returns { slug, state } where state is 'ready' | 'loading' | 'notfound'.
export function useResolvedSlug(identifier) {
  const numeric = /^\d+$/.test(identifier || '');
  const [slug, setSlug] = useState(numeric ? null : (identifier || null));
  const [state, setState] = useState(numeric ? 'loading' : 'ready');

  useEffect(() => {
    if (!numeric) {
      setSlug(identifier || null);
      setState(identifier ? 'ready' : 'notfound');
      return undefined;
    }
    let alive = true;
    setState('loading');
    resolveByNumber(identifier)
      .then(({ data }) => { if (alive) { setSlug(data.slug); setState('ready'); } })
      .catch(() => { if (alive) { setSlug(null); setState('notfound'); } });
    return () => { alive = false; };
  }, [identifier, numeric]);

  return { slug, state };
}

export default useResolvedSlug;
