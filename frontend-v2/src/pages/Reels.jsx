// Public Reels player — /community/reels. Full-screen vertical swipe/scroll on
// mobile, centered column (TikTok-in-a-frame) on desktop, per "MAJA Pixora
// Spotlight.dc.html" isReels visual language (violet/glass chrome) ported onto
// the legacy full-screen player UX. Business logic ported verbatim from
// frontend/src/pages/PixoraReels.jsx (adaptive feed, interest vector, dwell
// tracking, like/save/share/comment) — see that file for the algorithm notes.
//
// TODO: lane W4 owns src/api/pixora.js. It did not exist at the time this page
// was written, so the 3 calls below go straight through the shared `client`.
// Swap to `import * as pixoraApi from '@/api/pixora'` once it lands.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '@/api/client';
import { LINK } from '@/lib/marketingLinks';
import './Reels.css';
import useSeo from '@/lib/useSeo';

const INTEREST_KEY = 'pixora_reels_interest_v1';
const INTEREST_MAX = 20;   // mirrors the server cap so client + server agree
const PAGE = 8;

const loadVec = () => {
  try { return JSON.parse(localStorage.getItem(INTEREST_KEY)) || {}; }
  catch (_e) { return {}; }
};
const saveVec = (v) => { try { localStorage.setItem(INTEREST_KEY, JSON.stringify(v)); } catch (_e) { /* private mode */ } };
const bumpVec = (vec, topics, amount) => {
  const out = { ...vec };
  (topics || []).forEach((t) => {
    const k = String(t || '').toLowerCase();
    if (k) out[k] = Math.min(INTEREST_MAX, (out[k] || 0) + amount);
  });
  return out;
};

// Small stroke-icon set (no icon library in frontend-v2 — see package.json).
function Icon({ name, filled }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'heart': return <svg {...common}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" /></svg>;
    case 'comment': return <svg {...common}><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-5.5a8.5 8.5 0 1 1 17-3Z" /></svg>;
    case 'save': return <svg {...common}><path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" /></svg>;
    case 'share': return <svg {...common}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-3.9M8.6 13.5l6.8 3.9" /></svg>;
    case 'mute': return <svg {...common}><path d="M11 5 6 9H2v6h4l5 4Z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>;
    case 'unmute': return <svg {...common}><path d="M11 5 6 9H2v6h4l5 4Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>;
    case 'back': return <svg {...common}><path d="m15 18-6-6 6-6" /></svg>;
    case 'close': return <svg {...common}><path d="M18 6 6 18M6 6l12 12" /></svg>;
    case 'send': return <svg {...common}><path d="m22 2-7 20-4-9-9-4Z" /></svg>;
    case 'play': return <svg {...common}><path d="M6 3v18l15-9Z" /></svg>;
    default: return null;
  }
}

/** One full-screen reel. Owns its own <video>: plays when active, pauses/rewinds
 * otherwise, and fires onWatch once after a real dwell (a scroll-by doesn't count). */
function ReelCard({ reel, active, muted, registerEl, onWatch, onInteract, onToggleMute }) {
  const videoRef = useRef(null);
  const dwellRef = useRef(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    if (active) {
      v.currentTime = 0;
      const p = v.play();
      if (p && p.catch) p.catch(() => { /* autoplay can be blocked until a tap */ });
      dwellRef.current = setTimeout(() => onWatch(reel), 2200);
    } else {
      v.pause();
      if (dwellRef.current) clearTimeout(dwellRef.current);
    }
    return () => { if (dwellRef.current) clearTimeout(dwellRef.current); };
  }, [active, reel, onWatch]);

  const src = reel.video_url;
  const initials = (reel.author || '?').trim().charAt(0).toUpperCase();

  return (
    <section
      ref={(el) => registerEl(reel.id, el)}
      className="mjr-card"
      data-testid={`reel-${reel.id}`}
    >
      {src ? (
        <video
          ref={videoRef} src={src} poster={reel.image_url || undefined}
          loop muted={muted} playsInline preload="metadata"
          className="mjr-video"
          onClick={(e) => { const v = e.currentTarget; v.paused ? v.play().catch(() => {}) : v.pause(); }}
        />
      ) : reel.image_url ? (
        <img src={reel.image_url} alt={reel.title || ''} className="mjr-video" loading="lazy" decoding="async" />
      ) : (
        <div className="mjr-empty-frame"><Icon name="play" /></div>
      )}

      <div className="mjr-fade-top" />
      <div className="mjr-fade-bottom" />

      <div className="mjr-rail">
        <button className="mjr-rail-btn" data-testid={`reel-like-${reel.id}`} onClick={() => onInteract('like', reel)}>
          <span className={`mjr-rail-icon${reel.viewer_liked ? ' is-liked' : ''}`}><Icon name="heart" filled={reel.viewer_liked} /></span>
          <span className="mjr-rail-label">{reel.like_count ?? 0}</span>
        </button>
        <button className="mjr-rail-btn" data-testid={`reel-comment-${reel.id}`} onClick={() => onInteract('comment', reel)}>
          <span className="mjr-rail-icon"><Icon name="comment" /></span>
          <span className="mjr-rail-label">{reel.comment_count ?? 0}</span>
        </button>
        <button className="mjr-rail-btn" data-testid={`reel-save-${reel.id}`} onClick={() => onInteract('save', reel)}>
          <span className={`mjr-rail-icon${reel.viewer_saved ? ' is-saved' : ''}`}><Icon name="save" filled={reel.viewer_saved} /></span>
          <span className="mjr-rail-label">{reel.save_count ?? 0}</span>
        </button>
        <button className="mjr-rail-btn" data-testid={`reel-share-${reel.id}`} onClick={() => onInteract('share', reel)}>
          <span className="mjr-rail-icon"><Icon name="share" /></span>
          <span className="mjr-rail-label">{reel.share_count ?? 0}</span>
        </button>
        <button className="mjr-rail-btn" data-testid="reel-mute" onClick={onToggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
          <span className="mjr-rail-icon"><Icon name={muted ? 'mute' : 'unmute'} /></span>
        </button>
      </div>

      <div className="mjr-byline">
        <Link to={reel.author_url || '/community'} className="mjr-author" data-testid={`reel-author-${reel.id}`}>
          {reel.author_avatar ? (
            <img src={reel.author_avatar} alt="" className="mjr-avatar" loading="lazy" decoding="async" />
          ) : (
            <span className="mjr-avatar mjr-avatar-fallback">{initials}</span>
          )}
          <span className="mjr-author-text">
            <span className="mjr-author-name">{reel.author}</span>
            {reel.author_city && <span className="mjr-author-city">{reel.author_city}</span>}
          </span>
        </Link>
        {(reel.title || reel.body) && (
          <p className="mjr-caption">
            {reel.title && <span className="mjr-caption-title">{reel.title}</span>}
            {reel.body}
          </p>
        )}
        {(reel.topics || []).length > 0 && (
          <div className="mjr-tags">
            {reel.topics.slice(0, 4).map((t) => <span key={t}>#{t}</span>)}
          </div>
        )}
      </div>
    </section>
  );
}

/** Bottom-sheet comment thread. Reading is open; posting goes through the auth gate. */
function CommentSheet({ reel, onClose, onNeedLogin }) {
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    client.get(`/api/pixora/posts/${reel.id}/comments`)
      .then(({ data }) => setRows(data.comments || [])).catch(() => setRows([]));
  }, [reel.id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await client.post(`/api/pixora/posts/${reel.id}/comment`, { body });
      setText(''); load();
    } catch (e) {
      if (e?.response?.status === 401) onNeedLogin();
    }
    setBusy(false);
  };

  return (
    <div className="mjr-sheet-wrap" data-testid="reel-comment-sheet">
      <div className="mjr-sheet-scrim" onClick={onClose} />
      <div className="mjr-sheet">
        <div className="mjr-sheet-head">
          <span>Comments</span>
          <button onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="mjr-sheet-body">
          {rows === null ? (
            <div className="mjr-spinner" />
          ) : rows.length === 0 ? (
            <p className="mjr-sheet-empty">No comments yet. Say something kind.</p>
          ) : (
            <ul className="mjr-comment-list">
              {rows.map((c) => (
                <li key={c.id}><span>{c.author}</span>{c.body}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="mjr-sheet-input">
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Add a comment"
            data-testid="reel-comment-input" />
          <button onClick={send} disabled={busy || !text.trim()} data-testid="reel-comment-send">
            <Icon name="send" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Reels() {
  useSeo({ title: 'Reels', description: 'Short-form wedding films and behind-the-scenes reels from MAJA studios.' });
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pinRef = useRef(searchParams.get('start') || null);
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [muted, setMuted] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [commentFor, setCommentFor] = useState(null);
  const [toast, setToast] = useState('');
  const [exhausted, setExhausted] = useState(false);

  const vecRef = useRef(loadVec());
  const seenRef = useRef(new Set());          // reel ids already fetched (feed `exclude`)
  const viewedRef = useRef(new Set());         // reel ids already view-tracked this session
  const elsRef = useRef(new Map());            // reel id -> DOM node
  const observerRef = useRef(null);
  const fetchingRef = useRef(false);
  const scrollerRef = useRef(null);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  const fetchMore = useCallback(async () => {
    if (fetchingRef.current || exhausted) return;
    fetchingRef.current = true;
    try {
      const firstPage = seenRef.current.size === 0;
      const { data } = await client.post('/api/public/pixora/reels/feed', {
        interests: vecRef.current,
        exclude: Array.from(seenRef.current),
        limit: PAGE,
        pin: firstPage ? pinRef.current : undefined,
      });
      const incoming = (data.reels || []).filter((r) => !seenRef.current.has(r.id));
      incoming.forEach((r) => seenRef.current.add(r.id));
      if (incoming.length === 0) {
        if ((data.reels || []).length === 0) setExhausted(true);
      } else {
        setReels((prev) => {
          const next = [...prev, ...incoming];
          if (!activeId && next.length) setActiveId(next[0].id);
          return next;
        });
      }
    } catch (_e) {
      /* leave whatever we have; the empty state covers a first-load failure */
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [activeId, exhausted]);

  useEffect(() => { fetchMore(); /* first page */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // One IntersectionObserver decides which reel is "active" (>=60% on screen).
  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) {
          const id = e.target.getAttribute('data-reel-id');
          if (id) setActiveId(id);
        }
      });
    }, { threshold: [0, 0.6, 1] });
    return () => observerRef.current && observerRef.current.disconnect();
  }, []);

  useEffect(() => {
    const obs = observerRef.current;
    if (!obs) return;
    elsRef.current.forEach((el) => el && obs.observe(el));
    const idx = reels.findIndex((r) => r.id === activeId);
    if (idx >= 0 && idx >= reels.length - 2) fetchMore();
  }, [reels, activeId, fetchMore]);

  const registerEl = useCallback((id, el) => {
    if (!el) { elsRef.current.delete(id); return; }
    el.setAttribute('data-reel-id', id);
    elsRef.current.set(id, el);
    if (observerRef.current) observerRef.current.observe(el);
  }, []);

  // Keyboard up/down (desktop): step to the adjacent reel.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const idx = reels.findIndex((r) => r.id === activeId);
      const next = reels[idx + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) elsRef.current.get(next.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reels, activeId]);

  // A real watch -> sharpen local interest, and record the view once per reel/session.
  const onWatch = useCallback((reel) => {
    vecRef.current = bumpVec(vecRef.current, reel.topics, 1);
    saveVec(vecRef.current);
    if (viewedRef.current.has(reel.id)) return;
    viewedRef.current.add(reel.id);
    client.post(`/api/public/pixora/reels/${reel.id}/view`,
      { event: 'watch', topics: reel.topics || [] }).catch(() => {});
  }, []);

  const patch = (id, fields) => setReels((rs) => rs.map((r) => (r.id === id ? { ...r, ...fields } : r)));

  const onInteract = async (what, reel) => {
    if (what === 'share') {
      const url = `${window.location.origin}${reel.author_url || '/community'}`;
      try {
        if (navigator.share) await navigator.share({ title: reel.title || 'MAJA Reels', url });
        else { await navigator.clipboard.writeText(url); flash('Link copied'); }
      } catch (_e) { /* dismissed */ }
      try {
        const { data } = await client.post(`/api/pixora/posts/${reel.id}/share`, { channel: 'link' });
        patch(reel.id, { share_count: data.share_count });
      } catch (_e) { /* best-effort */ }
      return;
    }
    if (what === 'comment') { setCommentFor(reel); return; }

    if (what === 'like') {
      vecRef.current = bumpVec(vecRef.current, reel.topics, 2);
      saveVec(vecRef.current);
      const liked = !reel.viewer_liked;
      patch(reel.id, { viewer_liked: liked, like_count: (reel.like_count || 0) + (liked ? 1 : -1) });
      try {
        const { data } = await client.post(`/api/pixora/posts/${reel.id}/like`, {});
        patch(reel.id, { viewer_liked: data.liked, like_count: data.like_count });
        if (liked) client.post(`/api/public/pixora/reels/${reel.id}/view`,
          { event: 'like', topics: reel.topics || [] }).catch(() => {});
      } catch (e) {
        patch(reel.id, { viewer_liked: reel.viewer_liked, like_count: reel.like_count });
        if (e?.response?.status === 401) setNeedLogin(true);
      }
      return;
    }
    if (what === 'save') {
      const saved = !reel.viewer_saved;
      patch(reel.id, { viewer_saved: saved, save_count: (reel.save_count || 0) + (saved ? 1 : -1) });
      try {
        const { data } = await client.post(`/api/pixora/posts/${reel.id}/save`, {});
        patch(reel.id, { viewer_saved: data.saved, save_count: data.save_count });
      } catch (e) {
        patch(reel.id, { viewer_saved: reel.viewer_saved, save_count: reel.save_count });
        if (e?.response?.status === 401) setNeedLogin(true);
      }
    }
  };

  return (
    <div className="mjr-page" data-testid="pixora-reels">
      <button onClick={() => navigate('/community')} aria-label="Back to community" className="mjr-back" data-testid="reels-back">
        <Icon name="back" />
      </button>
      <span className="mjr-title">Reels</span>

      {loading ? (
        <div className="mjr-state"><div className="mjr-spinner" /></div>
      ) : reels.length === 0 ? (
        <div className="mjr-state mjr-empty">
          <Icon name="play" />
          <p>No reels yet — check back soon.</p>
          <Link to="/community" className="mjr-btn">Back to community</Link>
        </div>
      ) : (
        <div className="mjr-scroller" ref={scrollerRef} data-testid="reels-scroller">
          {reels.map((reel) => (
            <ReelCard key={reel.id} reel={reel} active={reel.id === activeId} muted={muted}
              registerEl={registerEl} onWatch={onWatch} onInteract={onInteract}
              onToggleMute={() => setMuted((m) => !m)} />
          ))}
        </div>
      )}

      {commentFor && (
        <CommentSheet reel={commentFor} onClose={() => setCommentFor(null)}
          onNeedLogin={() => { setCommentFor(null); setNeedLogin(true); }} />
      )}

      {toast && <div className="mjr-toast" role="status">{toast}</div>}

      {needLogin && (
        <div className="mjr-auth-wrap" data-testid="reels-login-modal">
          <div className="mjr-sheet-scrim" onClick={() => setNeedLogin(false)} />
          <div className="mjr-auth-panel">
            <div className="mjr-auth-icon"><Icon name="heart" /></div>
            <div className="mjr-auth-title">Sign in to react</div>
            <p className="mjr-auth-copy">
              Liking, commenting and saving need an account — it keeps the community real.
              You can keep watching without one.
            </p>
            <div className="mjr-auth-actions">
              <Link to={LINK.signIn} className="mjr-btn">Sign in</Link>
              <Link to={LINK.signUp} className="mjr-btn mjr-btn-ghost">Create an account</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
