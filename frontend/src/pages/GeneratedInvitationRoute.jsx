import React from 'react';
import { useParams } from 'react-router-dom';
import LuxuryPublicInvitation from '@/pages/LuxuryPublicInvitation';
import LoadingFallback from '@/components/LoadingFallback';
import InvitationShell from '@/invitations/InvitationShell';

/**
 * GeneratedInvitationRoute — serves /invite/:owner/:event.
 *
 * Resolution order:
 *   1. a generated invitation at invitations/<owner>/<event>/
 *   2. otherwise fall through to the shared data-driven template
 *
 * The fallback is what keeps every pre-existing /invite/:slug/:eventType link
 * working — this route replaces that one, so anything without a generated
 * folder must land exactly where it did before.
 *
 * The import below is dynamic ON PURPOSE. A static import of a registry would
 * pull EVERY invitation into the main bundle, so one guest opening one wedding
 * would download all of them (~40 KB each — 100 couples is ~4 MB of dead
 * weight on every page load in the whole app). Written this way, webpack emits
 * one lazily-fetched chunk per invitation and a guest downloads only theirs.
 */

const SEGMENT = /^[a-z0-9][a-z0-9-]{0,60}$/;   // also blocks ../ path traversal

export default function GeneratedInvitationRoute() {
  // The params stay named :slug/:eventType even though this route reads them as
  // owner/event. LuxuryPublicInvitation — the fallback — calls useParams().slug
  // itself, so renaming them here left it with an undefined slug and every
  // ordinary /invite/<slug>/<event> link rendered an empty page.
  const { slug: owner, eventType: event } = useParams();
  const [state, setState] = React.useState({ status: 'loading' });

  React.useEffect(() => {
    let alive = true;

    // Reject anything that is not a plain slug segment before it reaches the
    // dynamic import, so a crafted URL cannot walk the filesystem.
    if (!SEGMENT.test(owner || '') || !SEGMENT.test(event || '')) {
      setState({ status: 'fallback' });
      return () => { alive = false; };
    }

    Promise.all([
      import(`../invitations/${owner}/${event}/index.jsx`),
      import(`../invitations/${owner}/${event}/data.js`).catch(() => ({ default: {} })),
    ])
      .then(([mod, dataMod]) => {
        if (!alive) return;
        setState({ status: 'ready', Component: mod.default, data: dataMod.default || {} });
      })
      .catch(() => {
        // No generated invitation for this pair — that is the normal case for
        // every ordinary /invite/:slug/:eventType link.
        if (alive) setState({ status: 'fallback' });
      });

    return () => { alive = false; };
  }, [owner, event]);

  if (state.status === 'loading') return <LoadingFallback variant="page" />;
  if (state.status === 'fallback') return <LuxuryPublicInvitation />;

  const { Component, data } = state;

  // Expiry is enforced HERE, not inside each generated page. A page authored
  // months from now would otherwise quietly serve forever; putting the gate in
  // the resolver means every invitation inherits it without remembering to.
  const expiresAt = data?.expires_at ? new Date(data.expires_at) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
    return (
      <InvitationShell testId="invitation-expired">
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="lux-glass p-10 max-w-md text-center">
            <span className="lux-eyebrow block mb-4">◆ This invitation has closed</span>
            <h1 className="font-display text-3xl mb-3" style={{ color: '#FFF8DC' }}>
              Thank you for celebrating with us.
            </h1>
            <p className="text-sm" style={{ color: 'rgba(255,248,220,0.7)' }}>
              This link is no longer active. Please contact the couple or the studio for photos.
            </p>
          </div>
        </div>
      </InvitationShell>
    );
  }

  return (
    <InvitationShell>
      <Component data={data} />
    </InvitationShell>
  );
}
