import { useEffect, useState } from 'react';
import { getEventInvitation } from '@/api/invitations';

/** Per-ceremony /api/invite/{slug}/{eventType} loader — the endpoint QR codes
   from StudioProfileQrCodes.jsx point at. Checks db.event_invitations first,
   so it's authoritative for that ceremony's design_id/deity_id override,
   its own enabled toggle, and its own expiry — none of which survive the
   generic /full envelope's client-side event_type filter.

   status: 'loading' | 'ready' | 'unavailable' | 'legacy' | 'skip'.
    - 'ready'       success; `data` is an InvitationPublicView-shaped object
                    (same shape as /full's `invite`) with `events[]` already
                    filtered to this event_type.
    - 'unavailable' the ceremony was explicitly disabled or its own expiry
                    passed (backend 404 "... is not available") — render the
                    expired state, do NOT fall back to /full.
    - 'legacy'      no event_invitations row and no matching legacy event
                    (400 unknown event_type, or 404 "not found in this
                    invitation"), or a network hiccup — fall back to
                    client-side filtering of the /full envelope so profiles
                    without event_invitations rows keep working. */
export function useEventInvitation(slug, eventType) {
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!slug || !eventType) { setStatus('skip'); return undefined; }
    let live = true;
    setStatus('loading');
    getEventInvitation(slug, eventType)
      .then(({ data: payload }) => {
        if (!live) return;
        setData(payload);
        setStatus('ready');
      })
      .catch((err) => {
        if (!live) return;
        const code = err.response?.status;
        const detail = err.response?.data?.detail || '';
        if (code === 404 && /not available/i.test(detail)) setStatus('unavailable');
        else setStatus('legacy'); // 400 invalid type, 404 no match, 410, network error, etc.
      });
    return () => { live = false; };
  }, [slug, eventType]);

  return { status, data };
}
