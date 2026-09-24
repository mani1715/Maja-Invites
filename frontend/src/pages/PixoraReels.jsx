// PixoraReels — the full-screen, swipeable, interest-personalised Reels player.
//
// This is the Instagram/TikTok-style Reels experience the owner asked for: one reel
// per screen, vertical scroll-snap, autoplay the reel in view, and a feed that ADAPTS
// to what the viewer watches ("watch candid → get more candid").
//
// HOW THE ALGORITHM WORKS (client half):
//   • Every reel the feed returns carries its `topics` (candid, wedding, haldi, …).
//   • The viewer's taste is a small { topic: weight } vector kept in localStorage, so
//     it works with NO login (most viewers are couples/guests) and survives refreshes.
//   • Watching a reel (a short dwell) bumps its topics; liking bumps them harder.
//   • When we fetch the next page we POST that vector, so the server re-ranks and the
//     feed sharpens toward what this person actually enjoys. Signed-in viewers also
//     get the vector persisted server-side (the /view endpoint), so it follows them.
//
// The backend (`POST /api/public/pixora/reels/feed`) does the ranking; this file is
// the player + the local interest bookkeeping + the standard like/comment/save/share.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, Play,
  ChevronLeft, Loader2, LogIn, Sparkles, X, Send,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const INTEREST_KEY = 'pixora_reels_interest_v1';
const INTEREST_MAX = 20;          // mirror of the server cap, so client + server agree
const PAGE = 8;

// ---- local interest vector (browser-persisted; no login needed) --------------
const loadVec = () => {
  try { return JSON.parse(localStorage.getItem(INTEREST_KEY)) || {}; }
  catch (_) { return {}; }
};
const saveVec = (v) => { try { localStorage.setItem(INTEREST_KEY, JSON.stringify(v)); } catch (_) {} };
const bumpVec = (vec, topics, amount) => {
  const out = { ...vec };
  (topics || []).forEach((t) => {
    const k = String(t || '').toLowerCase();
    if (!k) return;
    out[k] = Math.min(INTEREST_MAX, (out[k] || 0) + amount);
  });
  return out;
};

// A photographer's token rides in localStorage; a couple's session is an httpOnly
// cookie (invisible to JS) — send both so an interaction is attributed correctly.
const hasStudioToken = () => { try { return !!localStorage.getItem('admin_token'); } catch (_) { return false; } };
const authCfg = () => {
  const t = hasStudioToken() ? localStorage.getItem('admin_token') : null;
  return { withCredentials: true, headers: t ? { Authorization: `Bearer ${t}` } : {} };
};

/** One full-screen reel. Owns its own <video>: plays when `active`, pauses/rewinds
 *  otherwise, and fires onWatch once after a short dwell so a scroll-by doesn't count
 *  as interest. */
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
      // Count a "watch" (and sharpen interest) only after a real dwell.
      dwellRef.current = setTimeout(() => onWatch(reel), 2200);
    } else {
      v.pause();
      if (dwellRef.current) clearTimeout(dwellRef.current);
    }
    return () => { if (dwellRef.current) clearTimeout(dwellRef.current); };
  }, [active, reel, onWatch]);

  const src = reel.video_url || reel.url;
  const initials = (reel.author || '?').trim().charAt(0).toUpperCase();

  return (
    <section
      ref={(el) => registerEl(reel.id, el)}
      className="relative h-[100dvh] w-full snap-start snap-always shrink-0 overflow-hidden bg-black"
      data-testid={`reel-${reel.id}`}
    >
      {src ? (
        <video
          ref={videoRef} src={src} poster={reel.image_url || undefined}
          loop muted={muted} playsInline preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          onClick={(e) => { const v = e.currentTarget; v.paused ? v.play().catch(() => {}) : v.pause(); }}
        />
      ) : reel.image_url ? (
        <img src={reel.image_url} alt={reel.title || ''} className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <Sparkles className="h-8 w-8" style={{ color: 'rgba(212,175,55,0.5)' }} />
        </div>
      )}

      {/* readability gradients top + bottom */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)' }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)' }} />

      {/* right action rail */}
      <div className="absolute bottom-28 right-3 z-10 flex flex-col items-center gap-5 text-white">
        <RailButton icon={Heart} label={reel.like_count ?? 0}
          active={reel.viewer_liked} activeColor="#F0607A"
          onClick={() => onInteract('like', reel)} testid={`reel-like-${reel.id}`} />
        <RailButton icon={MessageCircle} label={reel.comment_count ?? 0}
          onClick={() => onInteract('comment', reel)} testid={`reel-comment-${reel.id}`} />
        <RailButton icon={Bookmark} label={reel.save_count ?? 0}
          active={reel.viewer_saved} activeColor="#E8C97A"
          onClick={() => onInteract('save', reel)} testid={`reel-save-${reel.id}`} />
        <RailButton icon={Share2} label={reel.share_count ?? 0}
          onClick={() => onInteract('share', reel)} testid={`reel-share-${reel.id}`} />
        <RailButton icon={muted ? VolumeX : Volume2} onClick={onToggleMute} testid="reel-mute" />
      </div>

      {/* byline + caption */}
      <div className="absolute inset-x-0 bottom-6 z-10 px-4 pr-16 text-white">
        <Link to={reel.author_url || '/community'} className="mb-2 inline-flex items-center gap-2.5 no-underline"
          data-testid={`reel-author-${reel.id}`}>
          {reel.author_avatar ? (
            <img src={reel.author_avatar} alt="" className="h-9 w-9 rounded-full object-cover"
              style={{ border: '1.5px solid rgba(232,201,122,0.8)' }} />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full text-sm"
              style={{ background: 'rgba(212,175,55,0.25)', color: '#F3E4B8', border: '1.5px solid rgba(232,201,122,0.7)' }}>
              {initials}
            </span>
          )}
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-white">{reel.author}</span>
            {reel.author_city && <span className="block text-[11px] text-white/70">{reel.author_city}</span>}
          </span>
        </Link>
        {(reel.title || reel.body) && (
          <p className="max-w-lg text-[13px] leading-relaxed text-white/90 line-clamp-3">
            {reel.title && <span className="mr-1.5 font-medium" style={{ color: '#F3E4B8' }}>{reel.title}</span>}
            {reel.body}
          </p>
        )}
        {(reel.topics || []).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {reel.topics.slice(0, 4).map((t) => (
              <span key={t} className="text-[11px] text-white/70">#{t}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function RailButton({ icon: Icon, label, onClick, active, activeColor, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className="flex flex-col items-center gap-1 transition-transform active:scale-90">
      <span className="grid h-11 w-11 place-items-center rounded-full"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}>
        <Icon className="h-6 w-6" style={active ? { color: activeColor } : { color: '#fff' }}
          fill={active ? 'currentColor' : 'none'} />
      </span>
      {(label !== undefined && label !== null) && (
        <span className="text-[11px] font-medium text-white/90">{label}</span>
      )}
    </button>
  );
}

/** Bottom-sheet comment thread. Reading is open; posting goes through the auth gate. */
function CommentSheet({ reel, onClose, onNeedLogin }) {
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/posts/${reel.id}/comments`, authCfg())
      .then(({ data }) => setRows(data.comments || [])).catch(() => setRows([]));
  }, [reel.id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/pixora/posts/${reel.id}/comment`, { body }, authCfg());
      setText(''); load();
    } catch (e) {
      if (e?.response?.status === 401) onNeedLogin();
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center" data-testid="reel-comment-sheet">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div className="lux-glass relative max-h-[70dvh] w-full max-w-[480px] rounded-t-2xl p-4"
        style={{ background: 'var(--lux-bg)' }}>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold" style={{ color: 'var(--lux-text)' }}>Comments</span>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" style={{ color: 'var(--lux-text-muted)' }} /></button>
        </div>
        <div className="mb-3 max-h-[45dvh] overflow-y-auto">
          {rows === null ? (
            <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--lux-text-faint)' }} />
          ) : rows.length === 0 ? (
            <p className="py-4 text-center text-[13px]" style={{ color: 'var(--lux-text-faint)' }}>No comments yet. Say something kind.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((c) => (
                <li key={c.id} className="text-[13px]" style={{ color: 'var(--lux-text-muted)' }}>
                  <span className="mr-1.5" style={{ color: '#E8C97A' }}>{c.author}</span>{c.body}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }} placeholder="Add a comment"
            className="min-h-[44px] flex-1 rounded-lg px-3 text-[13px]"
            style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
            data-testid="reel-comment-input" />
          <button onClick={send} disabled={busy || !text.trim()}
            className="lux-btn min-h-[44px] !px-3 disabled:opacity-50" data-testid="reel-comment-send">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PixoraReels() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pinRef = useRef(searchParams.get('start') || null);   // deep-linked reel to lead with
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
  const elsRef = useRef(new Map());           // reel id -> DOM node (for the observer)
  const observerRef = useRef(null);
  const fetchingRef = useRef(false);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };

  // Pull the next ranked page. Sends the *current* interest vector, so each page is
  // re-ranked against what the viewer has watched so far.
  const fetchMore = useCallback(async () => {
    if (fetchingRef.current || exhausted) return;
    fetchingRef.current = true;
    try {
      const firstPage = seenRef.current.size === 0;
      const { data } = await axios.post(`${API_URL}/api/public/pixora/reels/feed`, {
        interests: vecRef.current,
        exclude: Array.from(seenRef.current),
        limit: PAGE,
        // Pin the tapped reel to the top, but only on the very first page.
        pin: firstPage ? pinRef.current : undefined,
      }, authCfg());
      const incoming = (data.reels || []).filter((r) => !seenRef.current.has(r.id));
      incoming.forEach((r) => seenRef.current.add(r.id));
      if (incoming.length === 0) {
        // The server wraps around once everything's been seen; if it still returns
        // nothing, there simply are no reels — stop asking.
        if ((data.reels || []).length === 0) setExhausted(true);
      } else {
        setReels((prev) => {
          const next = [...prev, ...incoming];
          if (!activeId && next.length) setActiveId(next[0].id);
          return next;
        });
      }
    } catch (_) {
      /* leave whatever we have; the empty state covers a first-load failure */
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [activeId, exhausted]);

  useEffect(() => { fetchMore(); /* first page */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // One IntersectionObserver decides which reel is "active" (the one ≥60% on screen).
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

  // (Re)observe nodes whenever the list grows, and prefetch as the viewer nears the end.
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

  // A real watch → sharpen local interest by this reel's topics, and record the view
  // (which also counts the view server-side and, for signed-in viewers, persists taste).
  const onWatch = useCallback((reel) => {
    vecRef.current = bumpVec(vecRef.current, reel.topics, 1);
    saveVec(vecRef.current);
    axios.post(`${API_URL}/api/public/pixora/reels/${reel.id}/view`,
      { event: 'watch', topics: reel.topics || [] }, authCfg()).catch(() => {});
  }, []);

  const patch = (id, fields) => setReels((rs) => rs.map((r) => (r.id === id ? { ...r, ...fields } : r)));

  // Plain function (not useCallback): it is only called from event handlers, never
  // from a child effect's dependency list, so its identity changing per render is
  // harmless — and it keeps the hooks-deps lint clean (it closes over `flash`/`patch`).
  const onInteract = async (what, reel) => {
    if (what === 'share') {
      const url = `${window.location.origin}${reel.author_url || '/community'}`;
      try {
        if (navigator.share) await navigator.share({ title: reel.title || 'MAJA Reels', url });
        else { await navigator.clipboard.writeText(url); flash('Link copied'); }
      } catch (_) { /* dismissed */ }
      try {
        const { data } = await axios.post(`${API_URL}/api/pixora/posts/${reel.id}/share`, { channel: 'link' }, authCfg());
        patch(reel.id, { share_count: data.share_count });
      } catch (_) {}
      return;
    }
    if (what === 'comment') { setCommentFor(reel); return; }

    if (what === 'like') {
      // Liking is the strongest taste signal — bump interest hard, locally + (server-side
      // for signed-in viewers) via the view endpoint's `like` event.
      vecRef.current = bumpVec(vecRef.current, reel.topics, 2);
      saveVec(vecRef.current);
      const liked = !reel.viewer_liked;
      patch(reel.id, { viewer_liked: liked, like_count: (reel.like_count || 0) + (liked ? 1 : -1) });
      try {
        const { data } = await axios.post(`${API_URL}/api/pixora/posts/${reel.id}/like`, {}, authCfg());
        patch(reel.id, { viewer_liked: data.liked, like_count: data.like_count });
        if (liked) axios.post(`${API_URL}/api/public/pixora/reels/${reel.id}/view`,
          { event: 'like', topics: reel.topics || [] }, authCfg()).catch(() => {});
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
        const { data } = await axios.post(`${API_URL}/api/pixora/posts/${reel.id}/save`, {}, authCfg());
        patch(reel.id, { viewer_saved: data.saved, save_count: data.save_count });
      } catch (e) {
        patch(reel.id, { viewer_saved: reel.viewer_saved, save_count: reel.save_count });
        if (e?.response?.status === 401) setNeedLogin(true);
      }
    }
  };

  return (
    <div className="relative bg-black" data-testid="pixora-reels">
      {/* back to community */}
      <button onClick={() => navigate('/community')} aria-label="Back to community"
        className="fixed left-3 top-3 z-[60] grid h-10 w-10 place-items-center rounded-full"
        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} data-testid="reels-back">
        <ChevronLeft className="h-6 w-6 text-white" />
      </button>
      <span className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 text-sm font-semibold tracking-wide text-white/90">
        Reels
      </span>

      {loading ? (
        <div className="flex h-[100dvh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin" style={{ color: '#E8C97A' }} />
        </div>
      ) : reels.length === 0 ? (
        <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 px-8 text-center">
          <Play className="h-9 w-9" style={{ color: '#E8C97A' }} />
          <p className="text-white/80">No reels yet — check back soon.</p>
          <Link to="/community" className="lux-btn mt-2 text-sm">Back to community</Link>
        </div>
      ) : (
        <div className="h-[100dvh] snap-y snap-mandatory overflow-y-scroll" data-testid="reels-scroller">
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

      {toast && (
        <div className="fixed inset-x-0 bottom-24 z-[130] flex justify-center px-4" role="status">
          <span className="rounded-full px-4 py-2 text-[13px] text-white"
            style={{ background: 'rgba(0,0,0,0.7)' }}>{toast}</span>
        </div>
      )}

      {needLogin && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" data-testid="reels-login-modal">
          <div className="absolute inset-0" style={{ background: 'rgba(6,4,2,0.78)' }} onClick={() => setNeedLogin(false)} />
          <div className="lux-glass relative w-full max-w-sm p-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full"
              style={{ background: 'rgba(212,175,55,0.14)' }}>
              <LogIn className="h-5 w-5" style={{ color: '#E8C97A' }} />
            </div>
            <div className="font-display mb-1 text-xl" style={{ color: 'var(--lux-text)' }}>Sign in to react</div>
            <p className="mb-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              Liking, commenting and saving need an account — it keeps the community real.
              You can keep watching without one.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a href="/?signin=1&return=/community/reels" className="lux-btn text-sm">I’m a couple / guest</a>
              <a href="/studio/login" className="lux-btn lux-btn-ghost text-sm">I’m a photographer</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
