import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGalleryAccess, authHeader } from '@/lib/galleryAccess';
import FindMyPhotos from '@/components/FindMyPhotos';
import AllPhotosBrowse from '@/components/AllPhotosBrowse';
import { useResolvedSlug } from '@/lib/useResolvedSlug';
import './LivePhotoWall.css';

// Dedicated "Find my photos" page — the target of an event's face-match QR.
// Deliberately SEPARATE from the full live-gallery wall (LivePhotoWall): a
// face-match guest takes one selfie and sees ONLY the photos they are in, never
// the whole gallery. Find my photos needs NO album passcode (server-side too —
// gallery_features drops enforce_gallery_access on the face routes); only the
// "All photos" tab is PIN-gated, and even then it never leaks unrelated events.
// The face-match QR / URL may carry a NUMBER (/invite/00001/find-my-photos).
// Resolve it to the real slug ONCE, up front, so useGalleryAccess and every
// gallery call keep using the slug (no gallery endpoint learns about numbers).
export default function FaceMatchPage() {
  const { slug: routeSlug } = useParams();
  const { slug, state } = useResolvedSlug(routeSlug);
  if (state === 'loading') {
    return (
      <div className="lpw-page lpw-shell"><div className="mj-aurora lpw-gate">
        <div className="lpw-spinner" />
      </div></div>
    );
  }
  if (state === 'notfound' || !slug) {
    return (
      <div className="lpw-page lpw-shell"><div className="mj-aurora lpw-gate">
        <div className="mj-glass lpw-gate-card" style={{ maxWidth: 440, textAlign: 'center' }}>
          <h1 className="lpw-gate-title">Invitation not found</h1>
          <p style={{ fontSize: 14, color: '#c9c0e4', marginTop: 12 }}>This link may have expired or been removed.</p>
        </div>
      </div></div>
    );
  }
  return <FaceMatchInner slug={slug} />;
}

function FaceMatchInner({ slug }) {
  const access = useGalleryAccess(slug);
  const deviceHeader = authHeader(access.deviceToken);

  const [passcode, setPasscode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [remember, setRemember] = useState(true);
  const [passcodeError, setPasscodeError] = useState(false);
  // This page is the face-match QR target → default to "Find my photos", which
  // needs NO album passcode. Only the "All photos" (whole album) tab is
  // PIN-gated. Find my photos returns only the guest's own matches, so it never
  // exposes the album and never needs the album PIN.
  const [mode, setMode] = useState('face'); // face (AI match) | all (whole album)

  const handleUnlock = async (e) => {
    e.preventDefault();
    setUnlocking(true);
    setPasscodeError(false);
    try {
      await access.unlock(passcode, remember);
    } catch (err) {
      setPasscodeError(err.status === 401 || err.status === 403);
    } finally {
      setUnlocking(false);
    }
  };

  if (access.loading) {
    return (
      <div className="lpw-page lpw-shell">
        <div className="mj-aurora lpw-gate">
          <div className="lpw-spinner" />
        </div>
      </div>
    );
  }

  // Two lanes, chosen by tab:
  //   • Find my photos  → face search, NO album passcode, matches-only.
  //   • All photos      → whole album, passcode-gated (the lock lives HERE, in
  //                       this tab only, not across the whole page).
  const albumLocked = !access.isUnlocked; // protected event, not yet unlocked

  return (
    <div className="lpw-page lpw-shell">
      <div className="mj-aurora lpw-gate">
        <div className="mj-glass lpw-gate-card" style={{ maxWidth: 480 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button type="button" onClick={() => setMode('face')}
              className={mode === 'face' ? 'lpw-solid-btn' : 'lpw-ghost-btn'}
              style={{ flex: 1, minHeight: 44 }}>Find my photos</button>
            <button type="button" onClick={() => setMode('all')}
              className={mode === 'all' ? 'lpw-solid-btn' : 'lpw-ghost-btn'}
              style={{ flex: 1, minHeight: 44 }}>All photos</button>
          </div>

          {mode === 'face' && (
            <FindMyPhotos slug={slug} deviceHeader={deviceHeader} onClose={() => setMode('all')} />
          )}

          {mode === 'all' && (albumLocked ? (
            <>
              <p style={{ fontSize: 12, letterSpacing: '.28em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 14px', fontWeight: 600 }}>All photos</p>
              <h2 className="lpw-gate-title" style={{ fontSize: 22 }}>Enter the event passcode</h2>
              <p style={{ fontSize: 14.5, color: '#c9c0e4', margin: '0 0 24px', lineHeight: 1.65 }}>
                {access.privacyFetchFailed ? "We couldn't reach the event just now. Please try again." : 'The full album is private. Enter the passcode shared with you to see every photo — Find my photos needs no passcode.'}
              </p>
              {access.privacyFetchFailed ? (
                <button type="button" className="lpw-solid-btn" style={{ width: 230, maxWidth: '100%', minHeight: 48 }} onClick={access.refresh}>Try again</button>
              ) : (
                <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <input
                    className="lpw-code-input"
                    value={passcode}
                    onChange={(e) => { setPasscode(e.target.value); setPasscodeError(false); }}
                    placeholder="&bull;&bull;&bull;&bull;&bull;&bull;"
                    autoComplete="off"
                  />
                  {passcodeError && <p style={{ fontSize: 13, color: '#fca5a5', margin: '0 0 14px' }}>Oh dear. That passcode doesn&rsquo;t match.</p>}
                  {access.error && !passcodeError && <p style={{ fontSize: 13, color: '#fca5a5', margin: '0 0 14px' }}>{access.error}</p>}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontSize: 13.5, color: '#c9c0e4', marginBottom: 22, cursor: 'pointer' }}>
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#a78bfa' }} />
                    Remember this device
                  </label>
                  <button type="submit" disabled={unlocking} className="lpw-solid-btn" style={{ width: 230, maxWidth: '100%', minHeight: 48, padding: '0 20px' }}>
                    {unlocking ? 'Unlocking…' : 'Continue'}
                  </button>
                </form>
              )}
            </>
          ) : (
            <AllPhotosBrowse slug={slug} deviceHeader={deviceHeader} />
          ))}
        </div>
      </div>
    </div>
  );
}
