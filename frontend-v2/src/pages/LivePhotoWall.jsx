import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useGalleryAccess, authHeader } from '@/lib/galleryAccess';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import * as galleryApi from '@/api/gallery';
import { getBySlug } from '@/api/invitations';
import { scanPing } from '@/api/qr';
import FindMyPhotos from '@/components/FindMyPhotos';
import { getProfile } from '@/lib/performanceProfile';
import './LivePhotoWall.css';

const API_URL = import.meta.env.VITE_BACKEND_URL || '';
const POLL_MS = 20000;
const MAX_WS_RETRIES = 3;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Gallery page size comes from the shared performance policy rather than a
// second local read of navigator.connection — one device, one answer. The
// policy already handles the browsers that expose no connection at all.
function pageLimit() {
  return getProfile().galleryBatchSize;
}

function wsUrl(slug, token) {
  const base = API_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  const wsBase = base.replace(/^http/, 'ws');
  return `${wsBase}/api/ws/gallery/${slug}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
}

function getDeviceId() {
  try {
    let id = localStorage.getItem('maja_device_id');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem('maja_device_id', id);
    }
    return id;
  } catch (e) {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeWsPhoto(raw) {
  return {
    id: raw.id,
    url: raw.url || '',
    thumb_url: raw.thumb_url || raw.url || '',
    caption: raw.caption || '',
    uploader_name: raw.guest_name || (raw.source === 'photographer' ? 'Studio' : ''),
    source: raw.source || 'guest',
    favorite_count: 0,
    created_at: raw.created_at || new Date().toISOString(),
  };
}

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'guests', label: 'From guests' },
  { key: 'studio', label: 'By the studio' },
];

export default function LivePhotoWall() {
  const { slug } = useParams();
  const access = useGalleryAccess(slug);
  const deviceHeader = useMemo(() => authHeader(access.deviceToken), [access.deviceToken]);

  const [couple, setCouple] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [passcodeError, setPasscodeError] = useState(false);
  const [remember, setRemember] = useState(true);
  const [unlocking, setUnlocking] = useState(false);

  const [feed, setFeed] = useState({ photos: [], total: 0, guestUploadsAllowed: false });
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all');

  const [modal, setModal] = useState(null); // null | 'upload' | 'find'
  const [lightbox, setLightbox] = useState(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(null);

  const [guestName, setGuestName] = useState('');
  const [caption, setCaption] = useState('');
  const [pickedFiles, setPickedFiles] = useState([]);
  const [uploadStatus, setUploadStatus] = useState('form'); // form | uploading | done | error
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const wsRef = useRef(null);
  const wsRetries = useRef(0);
  const pollRef = useRef(null);
  const lastFetchedAt = useRef(null);

  const flash = useCallback((msg) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2600);
  }, []);

  // Scan ping — once on mount.
  useEffect(() => { if (slug) scanPing(slug); }, [slug]);

  // Couple names for the header/lock screen.
  useEffect(() => {
    if (!slug) return;
    let live = true;
    getBySlug(slug).then((r) => { if (live) setCouple(r.data); }).catch(() => {});
    return () => { live = false; };
  }, [slug]);

  const fetchFeed = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setFeedLoading(true);
    setFeedError('');
    try {
      const skip = append ? feed.photos.length : 0;
      const limit = pageLimit();
      const r = await galleryApi.getWall(slug, { limit, skip, deviceToken: access.deviceToken });
      lastFetchedAt.current = r.data.fetched_at || new Date().toISOString();
      setFeed((prev) => {
        const incoming = r.data.photos || [];
        const merged = append ? [...prev.photos] : [];
        const seen = new Set(merged.map((p) => p.id));
        for (const p of incoming) { if (!seen.has(p.id)) { merged.push(p); seen.add(p.id); } }
        return { photos: merged, total: r.data.total || 0, guestUploadsAllowed: !!r.data.guest_uploads_allowed };
      });
      setHasMore((r.data.photos || []).length >= limit);
    } catch (e) {
      setFeedError(e.response?.data?.detail || 'Could not load the wall. Please try again.');
    } finally {
      setFeedLoading(false);
      setLoadingMore(false);
    }
  }, [slug, feed.photos.length]);

  // Initial feed load once unlocked.
  useEffect(() => {
    if (access.loading || !access.isUnlocked) return;
    fetchFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.loading, access.isUnlocked]);

  const pollOnce = useCallback(async () => {
    try {
      const r = await galleryApi.getWall(slug, { since: lastFetchedAt.current, limit: 60, deviceToken: access.deviceToken });
      lastFetchedAt.current = r.data.fetched_at || new Date().toISOString();
      const incoming = r.data.photos || [];
      if (!incoming.length) return;
      setFeed((prev) => {
        const seen = new Set(prev.photos.map((p) => p.id));
        const fresh = incoming.filter((p) => !seen.has(p.id));
        if (!fresh.length) return prev;
        return { ...prev, photos: [...fresh, ...prev.photos], total: prev.total + fresh.length };
      });
    } catch (e) { /* silent — next poll retries */ }
  }, [slug]);

  // WebSocket live updates, falling back to polling.
  useEffect(() => {
    if (access.loading || !access.isUnlocked || !slug) return undefined;
    let cancelled = false;
    let retryTimer = null;

    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(pollOnce, POLL_MS);
    };
    const stopPolling = () => { clearInterval(pollRef.current); pollRef.current = null; };

    const connect = () => {
      if (cancelled) return;
      let ws;
      try {
        ws = new WebSocket(wsUrl(slug, access.deviceToken));
      } catch (e) {
        startPolling();
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => { wsRetries.current = 0; stopPolling(); };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'photo_added' && msg.photo) {
            const p = normalizeWsPhoto(msg.photo);
            setFeed((prev) => {
              if (prev.photos.some((x) => x.id === p.id)) return prev;
              return { ...prev, photos: [p, ...prev.photos], total: prev.total + 1 };
            });
          }
        } catch (e) { /* ignore heartbeat/non-JSON */ }
      };
      ws.onclose = (evt) => {
        wsRef.current = null;
        if (cancelled) return;
        if (evt.code === 4401) {
          // Device token rejected — the gallery lock changed under us.
          startPolling();
          flash('Your access has changed. Refresh to unlock again if needed.');
          return;
        }
        if (wsRetries.current < MAX_WS_RETRIES) {
          wsRetries.current += 1;
          retryTimer = setTimeout(connect, 1000 * 2 ** wsRetries.current);
        } else {
          startPolling();
        }
      };
      ws.onerror = () => { try { ws.close(); } catch (e) { /* noop */ } };
    };

    connect();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      stopPolling();
      if (wsRef.current) { try { wsRef.current.close(); } catch (e) { /* noop */ } wsRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.loading, access.isUnlocked, access.deviceToken, slug]);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setPasscodeError(false);
    setUnlocking(true);
    try {
      await access.unlock(passcode, remember);
    } catch (err) {
      setPasscodeError(true);
    } finally {
      setUnlocking(false);
    }
  };

  const visiblePhotos = useMemo(() => {
    if (filter === 'guests') return feed.photos.filter((p) => p.source === 'guest');
    if (filter === 'studio') return feed.photos.filter((p) => p.source !== 'guest');
    return feed.photos;
  }, [feed.photos, filter]);

  const openUpload = () => { setModal('upload'); setUploadStatus('form'); setUploadError(''); };
  const openFind = () => setModal('find');
  const closeAll = () => { setModal(null); setLightbox(null); };
  const stop = (e) => e.stopPropagation();

  const onPickFiles = (e) => {
    const files = Array.from(e.target.files || []);
    const oversized = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (oversized.length) {
      setUploadError(`${oversized.length} file(s) are over 25MB and were skipped.`);
    } else {
      setUploadError('');
    }
    setPickedFiles(files.filter((f) => f.size <= MAX_UPLOAD_BYTES));
  };

  const submitUpload = async () => {
    if (!guestName.trim()) { setUploadError('Please add your name so the couple knows who to thank.'); return; }
    if (!pickedFiles.length) { setUploadError('Choose at least one photograph first.'); return; }
    setUploadStatus('uploading');
    setUploadError('');
    let succeeded = 0;
    const newPhotos = [];
    for (const file of pickedFiles) {
      try {
        const r = await galleryApi.guestUpload(slug, file, guestName.trim(), caption.trim());
        succeeded += 1;
        if (r.data?.photo) {
          newPhotos.push({
            id: r.data.photo.id, url: r.data.photo.url, thumb_url: r.data.photo.thumb_url,
            caption: r.data.photo.caption || '', uploader_name: r.data.photo.guest_name || guestName.trim(),
            source: 'guest', favorite_count: 0, created_at: r.data.photo.created_at,
          });
        }
      } catch (e) { /* keep going — report partial failure below */ }
    }
    if (newPhotos.length) {
      setFeed((prev) => {
        const seen = new Set(prev.photos.map((p) => p.id));
        const fresh = newPhotos.filter((p) => !seen.has(p.id));
        return { ...prev, photos: [...fresh, ...prev.photos], total: prev.total + fresh.length };
      });
    }
    if (succeeded === 0) {
      setUploadStatus('error');
      setUploadError('Could not upload your photographs. Please check your connection and try again.');
    } else if (succeeded < pickedFiles.length) {
      setUploadStatus('done');
      setUploadError(`${succeeded} of ${pickedFiles.length} uploaded — the rest failed. Try again for those.`);
    } else {
      setUploadStatus('done');
    }
  };

  const resetUpload = () => { setUploadStatus('form'); setPickedFiles([]); setCaption(''); setUploadError(''); };

  const loadOlder = () => fetchFeed({ append: true });

  const deviceId = useMemo(() => getDeviceId(), []);
  const toggleFavorite = async (photo) => {
    try {
      const r = await galleryApi.favoritePhoto(slug, photo.id, deviceId);
      setFeed((prev) => ({
        ...prev,
        photos: prev.photos.map((p) => (p.id === photo.id
          ? { ...p, favorite_count: p.favorite_count + (r.data.favorited ? 1 : -1), _favorited: r.data.favorited }
          : p)),
      }));
      setLightbox((lb) => (lb && lb.id === photo.id ? { ...lb, _favorited: r.data.favorited, favorite_count: lb.favorite_count + (r.data.favorited ? 1 : -1) } : lb));
    } catch (e) { flash('Could not save that — try again.'); }
  };

  const coupleTitle = couple
    ? <>{couple.bride_name && <span style={{ color: '#f2eefb' }}>{couple.bride_name} &amp; </span>}<span style={{ color: '#c4b5fd', fontStyle: 'italic' }}>{couple.groom_name || ''}</span></>
    : 'This gallery';

  // ---- Locked gate ----
  if (access.loading) {
    return (
      <div className="lpw-page lpw-shell">
        <div className="lpw-state"><div className="lpw-spinner" /> Loading the gallery&hellip;</div>
      </div>
    );
  }

  // Full-gallery wall explicitly disabled by the photographer: this event
  // shares photos via face-match only. Don't show (or prompt to unlock) a wall
  // that isn't offered — send the guest to the find-my-photos page instead.
  // Undefined flag (legacy galleries) is treated as enabled, so nothing regresses.
  if (access.privacy && access.privacy.private_full_gallery_enabled === false) {
    return (
      <div className="lpw-page lpw-shell">
        <div className="mj-aurora lpw-gate">
          <div className="mj-glass lpw-gate-card">
            <p style={{ fontSize: 12, letterSpacing: '.28em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 18px', fontWeight: 600 }}>Find my photos</p>
            <h1 className="lpw-gate-title">{coupleTitle}</h1>
            <p style={{ fontSize: 14.5, color: '#c9c0e4', maxWidth: '36ch', margin: '0 0 30px', lineHeight: 1.65 }}>
              This event shares photos through face match. Take one selfie to find the photographs you are in.
            </p>
            <a className="lpw-solid-btn" href={`/invite/${slug}/find-my-photos`} style={{ width: 230, maxWidth: '100%', minHeight: 48, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Find my photos</a>
          </div>
        </div>
      </div>
    );
  }

  if (!access.isUnlocked) {
    return (
      <div className="lpw-page lpw-shell">
        <div className="mj-aurora lpw-gate">
          <span aria-hidden="true" className="mj-petal" style={{ left: '9%', animationDuration: '16s', animationDelay: '-1s' }} />
          <span aria-hidden="true" className="mj-petal" style={{ left: '41%', width: 14, height: 18, opacity: .5, animationDuration: '13s', animationDelay: '-4s' }} />
          <span aria-hidden="true" className="mj-petal" style={{ left: '79%', width: 10, height: 14, opacity: .45, animationDuration: '15s', animationDelay: '-3s' }} />
          <div className="mj-glass lpw-gate-card">
            <div style={{ width: 74, height: 74, flex: 'none', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#f0c46a,#e5a93c 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 26, boxShadow: '0 18px 40px rgba(229,169,60,.26)' }}>
              <span style={{ fontFamily: "'Spectral',serif", fontSize: 23, color: '#190f33', fontWeight: 500 }}>M</span>
            </div>
            <p style={{ fontSize: 12, letterSpacing: '.28em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 18px', fontWeight: 600 }}>Gallery locked</p>
            <h1 className="lpw-gate-title">{coupleTitle}</h1>
            <p style={{ fontSize: 14.5, color: '#c9c0e4', maxWidth: '36ch', margin: '0 0 30px', lineHeight: 1.65 }}>
              {access.privacyFetchFailed ? "We couldn't reach the gallery just now. Please try again." : 'This gallery is locked. Please enter the passcode shared with you.'}
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
                  {unlocking ? 'Unlocking…' : 'Unlock the wall'}
                </button>
              </form>
            )}
            <p style={{ fontSize: 13, color: '#a396c4', margin: '26px 0 0', lineHeight: 1.6, maxWidth: '32ch' }}>The passcode is on your invitation card, or ask anyone at the welcome desk.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lpw-page lpw-shell">
      <header className="mj-glass lpw-header">
        <div className="lpw-header-inner">
          <div style={{ minWidth: 0 }}>
            <div className="lpw-live-chip">
              <span className="lpw-breathe" style={{ width: 7, height: 7, borderRadius: '50%', background: '#a78bfa', flex: 'none' }} />
              <p>The wall is awake</p>
            </div>
            <h1 className="lpw-title">{coupleTitle}</h1>
          </div>
          <div className="lpw-header-actions">
            <button type="button" className="lpw-ghost-btn" onClick={openFind}>Find my photos</button>
            {feed.guestUploadsAllowed && (
              <button type="button" className="lpw-solid-btn" onClick={openUpload}>Add photos</button>
            )}
          </div>
        </div>
      </header>

      <div className="lpw-meta">
        <p>{feed.total} photograph{feed.total === 1 ? '' : 's'} &middot; {feed.photos.filter((p) => p.source === 'guest').length} from guests &middot; updating live</p>
        <div className="lpw-filters">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                className="lpw-filter-btn"
                onClick={() => setFilter(f.key)}
                style={{
                  border: `1px solid ${on ? '#6d28d9' : 'rgba(196,181,253,.28)'}`,
                  background: on ? '#6d28d9' : 'transparent',
                  color: on ? '#ffffff' : '#c9c0e4',
                  fontWeight: on ? 600 : 400,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <main id="main-content" className="lpw-grid-wrap">
        {feedLoading && (
          <div className="lpw-state"><div className="lpw-spinner" /> Gathering the photographs&hellip;</div>
        )}
        {!feedLoading && feedError && (
          <div className="lpw-state">
            <p style={{ marginBottom: 14 }}>{feedError}</p>
            <button type="button" className="lpw-ghost-btn" style={{ minHeight: 44, padding: '0 20px' }} onClick={() => fetchFeed()}>Try again</button>
          </div>
        )}
        {!feedLoading && !feedError && visiblePhotos.length === 0 && (
          <div className="lpw-state">No photographs here yet. Be the first to add one.</div>
        )}
        {!feedLoading && !feedError && visiblePhotos.length > 0 && (
          <>
            <div className="lpw-masonry">
              {visiblePhotos.map((p) => (
                <button key={p.id} type="button" className="lpw-tile" data-mj-tile onClick={() => setLightbox(p)}>
                  <img src={resolveMediaUrl(p.thumb_url || p.url)} alt={p.caption || 'Wedding photograph'} loading="lazy" />
                  {(p.caption || p.uploader_name) && (
                    <span className="lpw-tile-cap">
                      {p.caption}
                      <span className="by">{p.uploader_name ? `${p.uploader_name}${p.source === 'guest' ? ', guest' : ''}` : ''}</span>
                    </span>
                  )}
                  {p.source === 'guest' && <span className="lpw-guest-badge">Guest</span>}
                </button>
              ))}
            </div>
            {hasMore && (
              <div className="lpw-load-older">
                <button type="button" className="lpw-ghost-btn" style={{ minHeight: 48, padding: '0 28px' }} disabled={loadingMore} onClick={loadOlder}>
                  {loadingMore ? 'Loading…' : 'Load older photographs'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="mj-ripple" style={{ borderTop: '1px solid rgba(196,181,253,.18)', marginTop: 20, overflow: 'hidden' }}>
        <div style={{ position: 'relative', maxWidth: 1320, margin: '0 auto', padding: '28px 24px 44px', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ fontSize: 13, color: '#a396c4', margin: 0, lineHeight: 1.6, maxWidth: '46ch' }}>Please do not repost these photographs without asking the couple.</p>
          <span data-mj-link style={{ fontSize: 13, color: '#a396c4' }}>Made with MAJA Invites</span>
        </div>
      </footer>

      {modal === 'upload' && (
        <div className="lpw-modal-backdrop" onClick={closeAll}>
          <div className="mj-glass lpw-modal-sheet" onClick={stop}>
            {uploadStatus === 'done' ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 20px', boxShadow: '0 18px 40px rgba(109,40,217,.30)' }}>&#10003;</div>
                <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 22, margin: '0 0 10px' }}>On the wall.</h2>
                <p style={{ fontSize: 14, color: '#c9c0e4', lineHeight: 1.7, margin: '0 0 8px' }}>Thank you. Your photographs are with everyone else&rsquo;s now.</p>
                {uploadError && <p style={{ fontSize: 13, color: '#fbbf24', lineHeight: 1.6, margin: '0 0 18px' }}>{uploadError}</p>}
                <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                  <button type="button" className="lpw-ghost-btn" style={{ flex: 1, minHeight: 48 }} onClick={resetUpload}>Add more</button>
                  <button type="button" className="lpw-solid-btn" style={{ flex: 1, minHeight: 48 }} onClick={closeAll}>Back to the wall</button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: '#a78bfa', margin: '0 0 12px', fontWeight: 600 }}>Add your photographs</p>
                <h2 style={{ fontFamily: "'Spectral',serif", fontWeight: 400, fontSize: 22, margin: '0 0 8px' }}>You were there. Show us.</h2>
                <p style={{ fontSize: 13.5, color: '#c9c0e4', lineHeight: 1.7, margin: '0 0 24px' }}>No app, no account. Pick photographs from your phone and they go up in seconds.</p>
                <label className="lpw-field-label">Your name</label>
                <input className="lpw-text-input" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="So the couple knows who to thank" disabled={uploadStatus === 'uploading'} />
                <label className="lpw-field-label">Caption (optional)</label>
                <input className="lpw-text-input" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Where, when, who&rsquo;s in it" disabled={uploadStatus === 'uploading'} />
                <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPickFiles} />
                <button type="button" className={`lpw-picker-btn${pickedFiles.length ? ' has-files' : ''}`} onClick={() => fileInputRef.current?.click()} disabled={uploadStatus === 'uploading'}>
                  <span style={{ fontSize: 22 }}>{pickedFiles.length ? '✓' : '+'}</span>
                  <span>{pickedFiles.length ? `${pickedFiles.length} photograph${pickedFiles.length === 1 ? '' : 's'} ready` : 'Choose photographs from your phone'}</span>
                </button>
                {uploadError && <p style={{ fontSize: 13, color: '#fca5a5', margin: '-10px 0 16px' }}>{uploadError}</p>}
                <button type="button" className="lpw-solid-btn" style={{ width: '100%', minHeight: 48 }} disabled={uploadStatus === 'uploading'} onClick={submitUpload}>
                  {uploadStatus === 'uploading' ? 'Putting them up…' : 'Put them on the wall'}
                </button>
                <button type="button" className="lpw-text-btn" onClick={closeAll} disabled={uploadStatus === 'uploading'}>Not now</button>
              </>
            )}
          </div>
        </div>
      )}

      {modal === 'find' && (
        <div className="lpw-modal-backdrop" onClick={closeAll}>
          <div className="mj-glass lpw-modal-sheet" onClick={stop} style={{ maxWidth: 480 }}>
            <FindMyPhotos slug={slug} deviceHeader={deviceHeader} onClose={closeAll} />
          </div>
        </div>
      )}

      {lightbox && (
        <div className="lpw-lightbox-backdrop" onClick={closeAll}>
          <img className="lpw-lightbox-img" onClick={stop} src={resolveMediaUrl(lightbox.url || lightbox.thumb_url)} alt={lightbox.caption || 'Wedding photograph'} />
          <p style={{ fontSize: 14, color: '#e1d7f0', margin: '0 0 4px', textAlign: 'center' }}>{lightbox.caption}</p>
          <p style={{ fontSize: 13, color: '#a396c4', margin: '0 0 20px', textAlign: 'center' }}>
            {lightbox.uploader_name}{lightbox.source === 'guest' ? ', guest' : ''}{lightbox.created_at ? ` · ${new Date(lightbox.created_at).toLocaleDateString()}` : ''}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }} onClick={stop}>
            <a className="lpw-solid-btn" style={{ minHeight: 48, padding: '0 20px', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }} href={resolveMediaUrl(lightbox.url || lightbox.thumb_url)} download target="_blank" rel="noreferrer">Download</a>
            <button type="button" className="lpw-ghost-btn" style={{ minHeight: 48, padding: '0 20px' }} onClick={() => toggleFavorite(lightbox)}>
              {lightbox._favorited ? '♥ Favorited' : '♡ Favorite'} ({lightbox.favorite_count || 0})
            </button>
            <button type="button" className="lpw-ghost-btn" style={{ minHeight: 48, padding: '0 20px' }} onClick={closeAll}>Close</button>
          </div>
        </div>
      )}

      {notice && <div className="lpw-toast">{notice}</div>}
    </div>
  );
}
