import { useCallback, useEffect, useState } from 'react';
import { getFull, getBySlug } from '@/api/invitations';

/** Shared /api/invite/{slug}/full loader for GuestInvitation + CeremonyInvitation.
   status: 'loading' | 'ready' | 'not_found' | 'expired' | 'locked' | 'error'.
   'locked' (401/403) doesn't happen for wedding slugs today — /full and
   /invite/{slug} carry no passcode gate (see api/invitations.js ponytail
   note) — but the brief calls for it, so it's handled defensively: retry()
   re-fetches with a passcode query param the backend is free to ignore. */
export function useInviteFull(slug) {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');

  const load = useCallback((passcode) => {
    if (!slug) return;
    setStatus('loading');
    const req = passcode ? getBySlug(slug, passcode) : getFull(slug);
    req
      .then(({ data: payload }) => {
        // getBySlug (passcode retry) returns just the invite view, not the
        // full envelope — normalise so callers always read `.invite`.
        setData(payload && payload.invite ? payload : { invite: payload });
        setStatus('ready');
      })
      .catch((err) => {
        const code = err.response?.status;
        if (code === 404) setStatus('not_found');
        else if (code === 410) setStatus('expired');
        else if (code === 401 || code === 403) setStatus('locked');
        else {
          setMessage(err.response?.data?.detail || err.message || 'Could not load this invitation.');
          setStatus('error');
        }
      });
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  return { status, data, message, retry: load };
}
