import { useState } from 'react';

/** Loading / not-found / expired / locked / error screen shared by
   GuestInvitation and CeremonyInvitation, styled in the same night-glass
   language as the invitation itself (brief: "style loading/error/empty
   states in the same design language"). */
export default function InviteStateScreen({ status, message, onRetry, onPasscode, tone = 'night' }) {
  const [passcode, setPasscode] = useState('');

  if (status === 'loading') {
    return (
      <div className="mj-invite-state" data-tone={tone}>
        <div className="mj-spin" aria-hidden="true" />
        <p className="mj-eyebrow">One moment</p>
        <h1>Opening your invitation…</h1>
      </div>
    );
  }

  if (status === 'not_found') {
    return (
      <div className="mj-invite-state" data-tone={tone}>
        <p className="mj-eyebrow">Not found</p>
        <h1>We couldn&rsquo;t find this invitation.</h1>
        <p className="mj-body">The link may be mistyped, or the couple hasn&rsquo;t published it yet.</p>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="mj-invite-state" data-tone={tone}>
        <p className="mj-eyebrow">Link closed</p>
        <h1>This invitation link has expired.</h1>
        <p className="mj-body">If you were expecting to see it, ask the couple for a fresh link.</p>
      </div>
    );
  }

  if (status === 'locked') {
    return (
      <div className="mj-invite-state" data-tone={tone}>
        <p className="mj-eyebrow">Passcode required</p>
        <h1>This invitation is locked.</h1>
        <p className="mj-body">Enter the passcode shared with you to continue.</p>
        <form
          onSubmit={(e) => { e.preventDefault(); onPasscode?.(passcode); }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 4 }}
        >
          <input
            data-mj-field
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
            style={{
              textAlign: 'center', letterSpacing: '.5em', fontSize: 20, width: 220, maxWidth: '100%',
              minHeight: 48, padding: '14px 16px', borderRadius: 14,
              border: '1px solid rgba(196,181,253,.30)', background: 'rgba(25,15,51,.62)', color: '#f2eefb', outline: 'none',
            }}
          />
          <button
            type="submit"
            data-mj-btn
            style={{
              background: '#6d28d9', color: '#fff', border: 'none', padding: '0 20px', minHeight: 48,
              borderRadius: 14, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 10px 26px rgba(109,40,217,.24)',
            }}
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  // error
  return (
    <div className="mj-invite-state" data-tone={tone}>
      <p className="mj-eyebrow">Something went wrong</p>
      <h1>We couldn&rsquo;t load this invitation.</h1>
      {message && <p className="mj-body">{message}</p>}
      {onRetry && (
        <button
          type="button"
          data-mj-btn
          onClick={() => onRetry()}
          style={{
            background: 'transparent', color: '#f2eefb', border: '1px solid rgba(196,181,253,.28)',
            padding: '0 20px', minHeight: 44, borderRadius: 14, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
