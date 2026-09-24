// PublicCommunity — the logged-out community at /community.
//
// Two doors, as the owner asked: "About the community" (the explainer) and the
// feed itself — Posts and Reels — laid out like Instagram: a narrow single column
// of compact cards, each with the photographer's avatar + name at the top, tags,
// and Like / Comment / Share underneath. Viewing is free; every interaction asks
// the visitor to sign in first (photographer OR couple account).
//
// Tapping the byline opens that photographer's public profile (/p/:slug), where
// their posts, reels and full portfolio live.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, Camera, Heart, MessageCircle, Share2, Loader2, LogIn, Sparkles,
  Info, Play, Users, Bookmark, X, Compass, Film, LayoutGrid, Building2,
  Flame, ShoppingBag, Settings, Layers, TrendingUp, Hash, AtSign, MapPin,
} from 'lucide-react';
import '@/styles/luxury.css';
import useSeo from '@/hooks/useSeo';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// The couple's session cookie is httpOnly (user_auth.py sets httponly=True), so
// `document.cookie` can NEVER see it — the old check here made every signed-in
// couple look logged out and pushed them into the "Sign in" modal. The server
// tells us instead: /api/public/pixora/feed returns `viewer.signed_in`, resolved
// from the cookie it can actually read. A photographer's token is in
// localStorage, so that half stays a local check.
const hasStudioToken = () => {
  try { return !!localStorage.getItem('admin_token'); } catch (_) { return false; }
};
// Send the cookie on same-site and cross-origin calls alike (the API is on a
// different origin in dev), and attach the studio bearer when there is one.
const authCfg = () => {
  const t = hasStudioToken() ? localStorage.getItem('admin_token') : null;
  return { withCredentials: true, headers: t ? { Authorization: `Bearer ${t}` } : {} };
};

/** Comment thread for one public post. Reading is open to everyone; posting
 *  goes through the same auth gate as Like. */
function PublicComments({ post, onInteract }) {
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/posts/${post.id}/comments`, authCfg())
      .then(({ data }) => setRows(data.comments || []))
      .catch(() => setRows([]));
  }, [post.id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/pixora/posts/${post.id}/comment`, { body }, authCfg());
      setText('');
      load();
    } catch (e) {
      if (e?.response?.status === 401) onInteract('signin', post);
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--lux-border)' }}
      data-testid={`pub-comments-${post.id}`}>
      {rows === null ? (
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--lux-text-faint)' }} />
      ) : rows.length === 0 ? (
        <p className="text-[12px]" style={{ color: 'var(--lux-text-faint)' }}>No comments yet.</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1.5">
          {rows.map((c) => (
            <li key={c.id} className="text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>
              <span className="mr-1.5" style={{ color: '#E8C97A' }}>{c.author}</span>
              {c.body}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Add a comment"
          className="min-h-[44px] flex-1 rounded-lg px-2.5 text-[13px]"
          style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
          data-testid={`pub-comment-input-${post.id}`} />
        <button onClick={send} disabled={busy || !text.trim()}
          className="lux-btn min-h-[44px] !px-3 !text-[11px] disabled:opacity-50"
          data-testid={`pub-comment-send-${post.id}`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Post'}
        </button>
      </div>
    </div>
  );
}

/** Compact Instagram-style card — avatar + name header, media, actions, tags. */
export function CommunityPostCard({ post, onInteract }) {
  const isReel = post.kind === 'reel' || !!post.video_url;
  const initials = (post.author || '?').trim().charAt(0).toUpperCase();
  return (
    <article className="lux-glass overflow-hidden" data-testid={`pub-post-${post.id}`}>
      {/* byline — who posted it (tap to open their profile) */}
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <Link to={post.author_url || '#'} className="shrink-0" data-testid={`pub-author-${post.id}`}>
          {post.author_avatar ? (
            <img src={post.author_avatar} alt="" loading="lazy"
              className="h-9 w-9 rounded-full object-cover"
              style={{ border: '1px solid rgba(212,175,55,0.5)' }} />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full text-sm"
              style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A', border: '1px solid rgba(212,175,55,0.4)' }}>
              {initials}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1 leading-tight">
          <Link to={post.author_url || '#'} className="block truncate text-sm no-underline"
            style={{ color: 'var(--lux-text)' }}>
            {post.author}
          </Link>
          {post.author_city && (
            <span className="block truncate text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
              {post.author_city}
            </span>
          )}
        </div>
        {isReel && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.18em]"
            style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A' }}>Reel</span>
        )}
      </header>

      {/* media — capped so a tall photo can never take over the page */}
      {isReel && post.video_url ? (
        <video src={post.video_url} poster={post.image_url || undefined} controls playsInline preload="none"
          className="w-full bg-black" style={{ maxHeight: 420, objectFit: 'contain' }} />
      ) : (post.images || []).length > 1 ? (
        <div className="flex snap-x snap-mandatory gap-1 overflow-x-auto"
          data-testid={`pub-carousel-${post.id}`}>
          {post.images.map((u, i) => (
            <img key={u + i} src={u} alt="" loading="lazy"
              className="w-full shrink-0 snap-center object-cover" style={{ maxHeight: 420 }} />
          ))}
        </div>
      ) : post.image_url ? (
        <img src={post.image_url} alt={post.title || ''} loading="lazy"
          className="w-full object-cover" style={{ maxHeight: 420 }} />
      ) : null}

      <div className="px-3 py-2.5">
        <div className="flex items-center gap-5 text-[13px]" style={{ color: 'var(--lux-text-muted)' }}>
          <button onClick={() => onInteract('like', post)} className="flex items-center gap-1.5"
            aria-pressed={!!post.viewer_liked}
            aria-label={post.viewer_liked ? 'Unlike' : 'Like'}
            style={post.viewer_liked ? { color: '#E8697A' } : undefined}
            data-testid={`pub-like-${post.id}`}>
            <Heart className="h-[18px] w-[18px]"
              fill={post.viewer_liked ? 'currentColor' : 'none'} /> {post.like_count}
          </button>
          <button onClick={() => onInteract('comment', post)} className="flex items-center gap-1.5"
            data-testid={`pub-comment-${post.id}`}>
            <MessageCircle className="h-[18px] w-[18px]" /> {post.comment_count}
          </button>
          <button onClick={() => onInteract('save', post)} className="flex items-center gap-1.5"
            aria-pressed={!!post.viewer_saved}
            aria-label={post.viewer_saved ? 'Remove from saved' : 'Save'}
            style={post.viewer_saved ? { color: '#E8C97A' } : undefined}
            data-testid={`pub-save-${post.id}`}>
            <Bookmark className="h-[18px] w-[18px]" fill={post.viewer_saved ? 'currentColor' : 'none'} /> {post.save_count ?? 0}
          </button>
          <button onClick={() => onInteract('share', post)} className="flex items-center gap-1.5"
            data-testid={`pub-share-${post.id}`}>
            <Share2 className="h-[18px] w-[18px]" /> {post.share_count ?? 0}
          </button>
        </div>

        {post.comments_open && (
          <PublicComments post={post} onInteract={onInteract} />
        )}

        {(post.title || post.body) && (
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--lux-text)' }}>
            {post.title && <span className="mr-1.5" style={{ color: '#E8C97A' }}>{post.title}</span>}
            <span style={{ color: 'var(--lux-text-muted)' }}>{post.body}</span>
          </p>
        )}

        {(post.category || post.location || post.camera || post.lens) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]"
            style={{ color: 'var(--lux-text-faint)' }} data-testid={`pub-meta-${post.id}`}>
            {post.category && (
              <span className="rounded-full px-2 py-0.5 uppercase tracking-[0.14em]"
                style={{ background: 'rgba(212,175,55,0.14)', color: '#E8C97A' }}>{post.category}</span>
            )}
            {post.location && <span>{post.location}</span>}
            {post.camera && <span>{post.camera}</span>}
            {post.lens && <span>{post.lens}</span>}
          </div>
        )}

        {(post.tags || []).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid={`pub-tags-${post.id}`}>
            {post.tags.map((t) => (
              <Link key={t} to={`/community/tag/${encodeURIComponent(t)}`} className="text-[11px] no-underline hover:underline"
                style={{ color: '#9CC0E8' }}>#{t}</Link>
            ))}
          </div>
        )}

        {(post.mentions || []).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
            {post.mentions.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-0.5">
                <AtSign className="h-3 w-3" style={{ color: '#E8C97A' }} />{m.label || m.ref}
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/** A clearly-labelled marketplace card injected into the For You feed (C6). Never
 *  disguised as an organic post — it carries its own "From the marketplace" chip. */
export function MarketplaceCard({ card }) {
  return (
    <article className="lux-glass overflow-hidden" data-testid={`pub-listing-${card.id}`}
      style={{ border: '1px solid rgba(212,175,55,0.35)' }}>
      <div className="flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-[0.16em]"
        style={{ background: 'rgba(212,175,55,0.1)', color: '#E8C97A' }}>
        <span className="inline-flex items-center gap-1"><ShoppingBag className="h-3 w-3" /> {card.label || 'From the marketplace'}</span>
        {card.listing_kind && <span>{card.listing_kind}</span>}
      </div>
      {card.preview_url && (
        <img src={card.preview_url} alt={card.title || ''} loading="lazy"
          className="w-full object-cover" style={{ maxHeight: 300 }} />
      )}
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm" style={{ color: 'var(--lux-text)' }}>{card.title}</div>
          <div className="truncate text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>by {card.seller}</div>
        </div>
        <div className="flex items-center gap-2">
          {card.price_inr > 0
            ? <span className="text-sm" style={{ color: '#E8C97A' }}>₹{Number(card.price_inr).toLocaleString('en-IN')}</span>
            : <span className="text-[11px]" style={{ color: '#7BD88F' }}>Free</span>}
          <Link to="/studio/community" className="lux-btn !px-3 !py-1.5 !text-[11px] no-underline">View</Link>
        </div>
      </div>
    </article>
  );
}

const isVideo0 = (u) => /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u || '');

// "Seen" state for story rings (Instagram grey-ring behaviour), remembered per
// browser. Maps studio_id -> the created_at of the newest story the viewer opened;
// a newer story re-golds the ring.
const SEEN_KEY = 'pixora_stories_seen_v1';
const loadSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch (_) { return {}; } };
const saveSeen = (s) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (_) {} };
const newestOf = (g) => (g.stories && g.stories.length ? g.stories[g.stories.length - 1].created_at || '' : '');

/** Full-screen story viewer — one photographer's stories, auto-advancing with a
 *  progress bar per story; tap right/left to move, and it rolls on to the next
 *  photographer when the current one finishes. */
function StoryViewer({ groups, start, onClose }) {
  const [gi, setGi] = useState(start);       // group (photographer) index
  const [si, setSi] = useState(0);           // story index within the group
  const [progress, setProgress] = useState(0);
  const [polls, setPolls] = useState({});    // story_id -> {votes,total,voted}
  const group = groups[gi];
  const story = group && group.stories[si];
  const stype = story && (story.type || (story.is_video || isVideo0(story.url) ? 'video' : 'photo'));
  const isVideo = stype === 'video';

  const votePoll = useCallback(async (opt) => {
    if (!story || polls[story.id]?.voted) return;
    // optimistic
    setPolls((p) => ({ ...p, [story.id]: { ...(p[story.id] || {}), voted: true } }));
    try {
      const { data } = await axios.post(`${API_URL}/api/public/pixora/stories/${story.id}/vote`,
        { option: opt }, authCfg());
      setPolls((p) => ({ ...p, [story.id]: { votes: data.votes, total: data.total, voted: true } }));
    } catch (_) { /* already voted / ended — keep the optimistic 'voted' */ }
  }, [story, polls]);

  const next = useCallback(() => {
    setProgress(0);
    if (group && si < group.stories.length - 1) { setSi((v) => v + 1); return; }
    if (gi < groups.length - 1) { setGi((v) => v + 1); setSi(0); return; }
    onClose();
  }, [group, si, gi, groups.length, onClose]);

  const prev = useCallback(() => {
    setProgress(0);
    if (si > 0) { setSi((v) => v - 1); return; }
    if (gi > 0) { const g = groups[gi - 1]; setGi(gi - 1); setSi(Math.max(0, g.stories.length - 1)); }
  }, [si, gi, groups]);

  // Auto-advance photos/text after ~5s; videos advance on their own `ended` event;
  // polls wait for the viewer (no auto-advance).
  useEffect(() => {
    if (!story || isVideo || stype === 'poll') return undefined;
    setProgress(0);
    const started = Date.now();
    const iv = setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / 5000);
      setProgress(p);
      if (p >= 1) { clearInterval(iv); next(); }
    }, 50);
    return () => clearInterval(iv);
  }, [story, isVideo, next]);

  if (!group || !story) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black" data-testid="story-viewer">
      {/* progress bars */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 p-2">
        {group.stories.map((s, i) => (
          <span key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.3)' }}>
            <span className="block h-full bg-white" style={{ width: i < si ? '100%' : i === si ? `${progress * 100}%` : '0%' }} />
          </span>
        ))}
      </div>
      {/* byline */}
      <Link to={group.url || '/community'} className="absolute left-3 top-4 z-20 flex items-center gap-2 no-underline">
        {group.avatar ? (
          <img src={group.avatar} alt="" className="h-8 w-8 rounded-full object-cover" style={{ border: '1px solid rgba(232,201,122,0.7)' }} />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-full text-xs"
            style={{ background: 'rgba(212,175,55,0.25)', color: '#F3E4B8' }}>{(group.name || '?').charAt(0)}</span>
        )}
        <span className="text-sm font-medium text-white">{group.name}</span>
      </Link>
      <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full"
        style={{ background: 'rgba(0,0,0,0.4)' }} data-testid="story-close">
        <X className="h-5 w-5 text-white" />
      </button>

      {/* media — photo/video, or a rendered text / poll card */}
      {isVideo ? (
        <video src={story.url} autoPlay playsInline className="max-h-full max-w-full" onEnded={next}
          onClick={(e) => { const v = e.currentTarget; v.paused ? v.play() : v.pause(); }} />
      ) : stype === 'text' ? (
        <div className="flex h-full w-full max-w-md items-center justify-center px-8 text-center"
          style={{ background: story.bg || 'linear-gradient(135deg,#2A2016,#0E0A06)' }} data-testid="story-text">
          <p className="font-display text-2xl leading-snug text-white">{story.text}</p>
        </div>
      ) : stype === 'poll' ? (
        <div className="relative z-30 flex h-full w-full max-w-md flex-col items-center justify-center gap-3 px-8"
          style={{ background: story.bg || 'linear-gradient(135deg,#241B2E,#0E0A06)' }} data-testid="story-poll">
          <p className="mb-2 text-center font-display text-xl text-white">{story.question}</p>
          {(story.options || []).map((opt, i) => {
            const st = polls[story.id];
            const votes = (st?.votes || story.votes || {});
            const total = st?.total ?? story.total_votes ?? 0;
            const c = Number(votes[String(i)] || 0);
            const pct = total > 0 ? Math.round((c / total) * 100) : 0;
            return (
              <button key={i} onClick={() => votePoll(i)} disabled={st?.voted}
                className="relative w-full overflow-hidden rounded-xl px-4 py-3 text-left text-sm text-white"
                style={{ border: '1px solid rgba(255,255,255,0.3)' }} data-testid={`story-poll-opt-${i}`}>
                {st?.voted && <span className="absolute inset-y-0 left-0 z-0" style={{ width: `${pct}%`, background: 'rgba(232,201,122,0.3)' }} />}
                <span className="relative z-10 flex justify-between"><span>{opt}</span>{st?.voted && <span>{pct}%</span>}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <img src={story.url} alt={story.caption || ''} className="max-h-full max-w-full object-contain" />
      )}
      {story.caption && (
        <p className="absolute inset-x-0 bottom-8 z-20 px-8 text-center text-sm text-white/90">{story.caption}</p>
      )}

      {/* tap zones */}
      <button aria-label="Previous" onClick={prev} className="absolute inset-y-0 left-0 z-10 w-1/3" />
      <button aria-label="Next" onClick={next} className="absolute inset-y-0 right-0 z-10 w-1/3" />
    </div>
  );
}

/** The Instagram-style stories rail on Home: a photographer's avatar ring per
 *  active story-set; tap to open the viewer. Renders nothing when no one has an
 *  active story, so Home stays clean until studios post. */
function StoriesRail() {
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(-1);
  const [seen, setSeen] = useState(loadSeen());

  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/api/public/pixora/stories`)
      .then(({ data }) => { if (alive) setGroups(data.groups || []); })
      .catch(() => { if (alive) setGroups([]); });
    return () => { alive = false; };
  }, []);

  if (!groups || groups.length === 0) return null;

  const isSeen = (g) => { const n = newestOf(g); return !!n && (seen[g.studio_id] || '') >= n; };
  const openGroup = (i) => {
    const g = groups[i];
    const nx = { ...seen, [g.studio_id]: newestOf(g) };
    setSeen(nx); saveSeen(nx); setOpen(i);
  };

  return (
    <>
      <div className="mb-4 flex gap-3 overflow-x-auto pb-1" data-testid="stories-rail">
        {groups.map((g, i) => (
          <button key={g.studio_id} onClick={() => openGroup(i)} className="flex w-16 shrink-0 flex-col items-center gap-1"
            data-testid={`story-ring-${g.studio_id}`}>
            <span className="grid h-16 w-16 place-items-center rounded-full p-[2px]"
              style={isSeen(g)
                ? { background: 'var(--lux-border)' }
                : { background: 'linear-gradient(135deg,#E8C97A,#D4AF37,#B8860B)' }}>
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full" style={{ background: 'var(--lux-bg)' }}>
                {g.avatar ? (
                  <img src={g.avatar} alt="" className="h-[58px] w-[58px] rounded-full object-cover" />
                ) : (
                  <span className="text-lg" style={{ color: '#E8C97A' }}>{(g.name || '?').charAt(0)}</span>
                )}
              </span>
            </span>
            <span className="w-full truncate text-center text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{g.name}</span>
          </button>
        ))}
      </div>
      {open >= 0 && <StoryViewer groups={groups} start={open} onClose={() => setOpen(-1)} />}
    </>
  );
}

// Left-sidebar navigation. Each item's `on` receives the setters/navigate it needs,
// so the same list drives the desktop rail and the mobile shortcut chips.
const SIDEBAR_ITEMS = [
  { k: 'discover', label: 'Discover', Icon: Compass, on: ({ setView }) => setView('discover') },
  { k: 'stories', label: 'Stories', Icon: Sparkles, on: ({ setView, setFeedTab }) => { setView('discover'); setFeedTab('foryou'); } },
  { k: 'reels', label: 'Reels', Icon: Film, on: ({ navigate }) => navigate('/community/reels') },
  { k: 'posts', label: 'Posts', Icon: LayoutGrid, on: ({ setView }) => setView('posts') },
  { k: 'photographers', label: 'Photographers', Icon: Camera, on: ({ navigate }) => navigate('/photographers') },
  { k: 'studios', label: 'Studios', Icon: Building2, on: ({ navigate }) => navigate('/photographers') },
  { k: 'trending', label: 'Trending', Icon: Flame, on: ({ setView, setFeedTab }) => { setView('discover'); setFeedTab('trending'); } },
  { k: 'marketplace', label: 'Marketplace', Icon: ShoppingBag, on: ({ navigate }) => navigate('/studio/community') },
  { k: 'saved', label: 'Saved', Icon: Bookmark, on: ({ setView }) => setView('saved') },
  { k: 'liked', label: 'Liked', Icon: Heart, on: ({ setView }) => setView('liked') },
  { k: 'collections', label: 'Collections', Icon: Layers, on: ({ setView }) => setView('collections') },
  { k: 'settings', label: 'Settings', Icon: Settings, on: ({ navigate }) => navigate('/studio/community') },
];

export default function PublicCommunity() {
  useSeo({
    title: 'MAJA Community — Photographers, Posts & Reels',
    description: 'Browse photographers, their posts and reels. Create an account to like, comment and share.',
    type: 'website',
    jsonLd: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'MAJA Community' },
  });
  // Left-sidebar section. `feedTab` is the centre feed source shown in Discover.
  const [view, setView] = useState('discover');       // discover | posts | search | saved | liked | collections
  const [feedTab, setFeedTab] = useState('foryou');   // foryou | following | trending | nearby
  const [feed, setFeed] = useState(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [needLogin, setNeedLogin] = useState('');
  // Resolved by the server from the httpOnly cookie — a couple's session is
  // invisible to JS, so this cannot be decided client-side.
  const [signedIn, setSignedIn] = useState(hasStudioToken());
  // Pixora is an after-login experience: until we KNOW whether the visitor is
  // signed in (photographer token is instant; a couple's cookie is resolved by
  // the first feed response), we hold the render, then either show the community
  // or a "log in to explore" gate.
  const [authKnown, setAuthKnown] = useState(hasStudioToken());
  const [toast, setToast] = useState('');
  const [creators, setCreators] = useState([]);       // right rail: top photographers
  const [trendingTags, setTrendingTags] = useState([]);
  // Nearby (C2): the viewer's chosen city + the picker options, resolved from the server.
  const [nearCity, setNearCity] = useState('');
  const [nearNeedsCity, setNearNeedsCity] = useState(false);
  const [nearCities, setNearCities] = useState([]);
  const timer = useRef(null);
  const navigate = useNavigate();

  // Which endpoint the centre feed pulls from depends on the section + feed tab.
  // For You = the personalised blend (C3, with marketplace cards); Following = your
  // graph (auth); Trending = the ranked window; Nearby = city-based (C2); Posts =
  // photo posts only. Every response normalises to a `feed` array of cards.
  const load = useCallback(() => {
    if (view === 'search' || ['saved', 'liked', 'collections'].includes(view)) { setFeed(null); return; }
    if (view === 'discover' && feedTab === 'following' && !signedIn && !hasStudioToken()) { setFeed([]); return; }
    setFeed(null);
    let url = `${API_URL}/api/public/pixora/feed`;
    let params = {};
    if (view === 'posts') params = { kind: 'post' };
    else if (view === 'discover' && feedTab === 'foryou') url = `${API_URL}/api/public/pixora/foryou`;
    else if (view === 'discover' && feedTab === 'trending') { url = `${API_URL}/api/pixora/trending`; params = { window: '7d' }; }
    else if (view === 'discover' && feedTab === 'following') url = `${API_URL}/api/pixora/following`;
    else if (view === 'discover' && feedTab === 'nearby') { url = `${API_URL}/api/public/pixora/nearby`; if (nearCity) params = { city: nearCity }; }
    axios.get(url, { params, ...authCfg() })
      .then(({ data }) => {
        if (feedTab === 'nearby' && view === 'discover') {
          setNearNeedsCity(!!data.needs_city);
          if (data.cities) setNearCities(data.cities);
          if (data.city) setNearCity(data.city);
        }
        setFeed(data.feed || data.posts || []);
        setSignedIn(!!data?.viewer?.signed_in || hasStudioToken());
        setAuthKnown(true);
      })
      .catch(() => { setFeed([]); setAuthKnown(true); });
  }, [view, feedTab, nearCity, signedIn]);
  useEffect(() => { load(); }, [load]);

  // Right rail — top photographers (public featured creators). Loaded once.
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/creators/featured`, { params: { limit: 6 } })
      .then(({ data }) => setCreators(data.creators || [])).catch(() => setCreators([]));
  }, []);

  // Trending hashtags (C2) — real network-wide usage from the hashtag index, not just
  // whatever the current feed happens to show. Loaded once.
  useEffect(() => {
    axios.get(`${API_URL}/api/public/pixora/hashtags/trending`, { params: { window: '7d', limit: 10 } })
      .then(({ data }) => setTrendingTags((data.tags || []).map((t) => t.tag)))
      .catch(() => setTrendingTags([]));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (!query) { setRes(null); return undefined; }
    timer.current = setTimeout(() => {
      axios.get(`${API_URL}/api/public/pixora/search`, { params: { q: query } })
        .then(({ data }) => setRes(data)).catch(() => setRes({ results: {}, total: 0 }));
    }, 300);
    return () => timer.current && clearTimeout(timer.current);
  }, [q]);

  // Like / comment / share. These used to call NOTHING — they just redirected to
  // /studio/community (photographer-only), so no like or comment ever persisted.
  // They now hit the real endpoints, which accept a photographer OR a couple.
  const interact = async (what, post) => {
    if (what === 'share') {
      const url = `${window.location.origin}${post?.author_url || '/community'}`;
      try {
        if (navigator.share) await navigator.share({ title: post?.title || 'MAJA Community', url });
        else { await navigator.clipboard.writeText(url); setToast('Link copied'); }
      } catch (_) { /* user dismissed the share sheet */ }
      // Shares are the heaviest ranking signal, and most happen logged-out —
      // so this records without requiring an account.
      try {
        const { data } = await axios.post(`${API_URL}/api/pixora/posts/${post.id}/share`,
          { channel: 'link' }, authCfg());
        setFeed((f) => (f || []).map((x) => (x.id === post.id ? { ...x, share_count: data.share_count } : x)));
      } catch (_) { /* recording a share must never block the share itself */ }
      return;
    }
    if (what === 'signin') { setNeedLogin('like'); return; }
    if (!signedIn) { setNeedLogin(what); return; }

    if (what === 'comment') {
      setFeed((f) => (f || []).map((p) => (p.id === post.id ? { ...p, comments_open: !p.comments_open } : p)));
      return;
    }
    if (what === 'save') {
      setFeed((f) => (f || []).map((p) => (p.id === post.id
        ? { ...p, viewer_saved: !p.viewer_saved, save_count: (p.save_count || 0) + (p.viewer_saved ? -1 : 1) }
        : p)));
      try {
        const { data } = await axios.post(`${API_URL}/api/pixora/posts/${post.id}/save`, {}, authCfg());
        setFeed((f) => (f || []).map((p) => (p.id === post.id
          ? { ...p, viewer_saved: data.saved, save_count: data.save_count } : p)));
      } catch (e) {
        setFeed((f) => (f || []).map((p) => (p.id === post.id
          ? { ...p, viewer_saved: post.viewer_saved, save_count: post.save_count } : p)));
        if (e?.response?.status === 401) setNeedLogin('save');
      }
      return;
    }
    // Optimistic like, reconciled with the server's authoritative count.
    setFeed((f) => (f || []).map((p) => (p.id === post.id
      ? { ...p, viewer_liked: !p.viewer_liked, like_count: p.like_count + (p.viewer_liked ? -1 : 1) }
      : p)));
    try {
      const { data } = await axios.post(`${API_URL}/api/pixora/posts/${post.id}/like`, {}, authCfg());
      setFeed((f) => (f || []).map((p) => (p.id === post.id
        ? { ...p, viewer_liked: data.liked, like_count: data.like_count } : p)));
    } catch (e) {
      // roll the optimistic update back, then explain why
      setFeed((f) => (f || []).map((p) => (p.id === post.id
        ? { ...p, viewer_liked: post.viewer_liked, like_count: post.like_count } : p)));
      if (e?.response?.status === 401) setNeedLogin('like');
    }
  };

  // Pixora is an after-login experience. Hold the render until auth is known,
  // then gate logged-out visitors to a "log in to explore" screen.
  if (!authKnown) {
    return (
      <div className="luxe min-h-screen grid place-items-center" style={{ background: 'var(--lux-bg)' }} data-testid="community-auth-loading">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#E8C97A' }} />
      </div>
    );
  }
  if (!signedIn && !hasStudioToken()) {
    // Teaser gate — a blurred wall of real work + featured photographers behind
    // the login prompt, so a logged-out visitor SEES what they're joining.
    const previews = (Array.isArray(feed) ? feed : []).filter((p) => p.image_url).slice(0, 9);
    return (
      <div className="luxe relative min-h-screen overflow-hidden" style={{ background: 'var(--lux-bg)' }} data-testid="community-login-gate">
        {previews.length > 0 && (
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 gap-1 opacity-40" style={{ filter: 'blur(7px)' }} aria-hidden="true">
            {previews.map((p) => <img key={p.id} src={p.image_url} alt="" className="h-full w-full object-cover" />)}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true"
          style={{ background: 'linear-gradient(180deg, rgba(6,4,2,0.55), rgba(6,4,2,0.85))' }} />
        <div className="relative z-10 flex min-h-screen items-center justify-center px-5">
          <div className="lux-glass w-full max-w-md p-8 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8" style={{ color: '#E8C97A' }} />
            <h1 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>Pixora Community</h1>
            <p className="mx-auto mb-4 mt-2 max-w-xs text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              Reels, stories and posts from wedding photographers. Log in to explore, follow and join in.
            </p>
            {creators.length > 0 && (
              <div className="mb-5 flex items-center justify-center -space-x-2" data-testid="gate-creator-avatars">
                {creators.slice(0, 6).map((c) => (
                  c.avatar
                    ? <img key={c.studio_id} src={c.avatar} alt="" className="h-9 w-9 rounded-full object-cover" style={{ border: '2px solid var(--lux-bg)' }} />
                    : <span key={c.studio_id} className="grid h-9 w-9 place-items-center rounded-full text-xs"
                        style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A', border: '2px solid var(--lux-bg)' }}>{(c.name || '?').charAt(0)}</span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <a href="/studio/login" className="lux-btn text-sm no-underline">I&apos;m a photographer</a>
              <a href="/?signin=1&return=/community" className="lux-btn lux-btn-ghost text-sm no-underline">I&apos;m a couple / guest</a>
            </div>
            <a href="/community/about" className="mt-4 inline-block text-[12px] no-underline" style={{ color: 'var(--lux-text-faint)' }}>About Pixora →</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="luxe min-h-screen" style={{ background: 'var(--lux-bg)' }} data-testid="public-community">
      <div className="mx-auto max-w-7xl px-3 lg:px-6 py-6" data-testid="community-shell">
        {/* header */}
        <div className="mb-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" style={{ color: '#E8C97A' }} />
            <h1 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>Pixora Community</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView('search')} className="lux-btn lux-btn-ghost !px-3 !py-1.5 text-[11px]" data-testid="community-search-btn">
              <Search className="h-3.5 w-3.5" /> Search
            </button>
            <Link to="/community/about" className="lux-btn lux-btn-ghost !px-3 !py-1.5 text-[11px] no-underline" data-testid="community-about-link">
              <Info className="h-3.5 w-3.5" /> About Pixora
            </Link>
          </div>
        </div>

        {/* mobile shortcut chips (the left sidebar collapses to this below lg) */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden" data-testid="community-mobile-chips">
          {SIDEBAR_ITEMS.map((it) => (
            <button key={it.k} onClick={() => it.on({ setView, setFeedTab, navigate })}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] whitespace-nowrap"
              style={{ border: '1px solid var(--lux-border)', color: 'var(--lux-text-muted)' }}>
              <it.Icon className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} />{it.label}
            </button>
          ))}
        </div>

        <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)_290px] lg:gap-6">
          {/* LEFT SIDEBAR */}
          <aside className="hidden lg:block" data-testid="community-left-rail">
            <nav className="sticky top-24 flex flex-col gap-0.5">
              {SIDEBAR_ITEMS.map((it) => {
                const active = it.k === (view === 'discover' ? (feedTab === 'trending' ? 'trending' : 'discover') : view);
                return (
                  <button key={it.k} onClick={() => it.on({ setView, setFeedTab, navigate })} data-testid={`sidebar-${it.k}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors"
                    style={active
                      ? { background: 'rgba(212,175,55,0.14)', color: '#F3E4B8', fontWeight: 600 }
                      : { color: 'var(--lux-text-muted)' }}>
                    <it.Icon className="h-[18px] w-[18px]" style={{ color: active ? '#E8C97A' : 'var(--lux-text-muted)' }} />
                    {it.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* CENTER */}
          <main className="mx-auto w-full max-w-[560px]">
            {/* feed selector — only in Discover */}
            {view === 'discover' && (
              <>
                {feedTab === 'foryou' && <StoriesRail />}
                <div className="mb-4 grid grid-cols-4 gap-1.5" data-testid="community-feed-tabs">
                  {[['foryou', 'For You'], ['following', 'Following'], ['trending', 'Trending'], ['nearby', 'Nearby']].map(([k, label]) => (
                    <button key={k} onClick={() => setFeedTab(k)} data-testid={`feedtab-${k}`}
                      className="rounded-xl px-2 py-2 text-[11px] uppercase tracking-[0.12em]"
                      style={feedTab === k
                        ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06', fontWeight: 600 }
                        : { border: '1px solid var(--lux-border)', color: 'var(--lux-text-muted)' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {view === 'search' ? (
              <div className="lux-glass p-3" data-testid="community-search-view">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--lux-text-muted)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="public-search-input" autoFocus
                placeholder="Search photographers, posts…"
                className="w-full rounded-lg bg-transparent py-2 pl-10 pr-3 text-sm outline-none"
                style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
            </div>
            {res && res.total > 0 && (
              <div className="mt-2.5 space-y-2.5">
                {(res.results.photographers || []).length > 0 && (
                  <div className="space-y-1">
                    <div className="px-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--lux-text-faint)' }}>Photographers</div>
                    {res.results.photographers.map((p) => (
                      <Link key={p.id} to={p.url} className="flex items-center justify-between rounded-lg px-3 py-2 no-underline"
                        style={{ background: 'var(--lux-panel)' }} data-testid={`pub-ph-${p.id}`}>
                        <span className="text-sm" style={{ color: 'var(--lux-text)' }}>
                          <Camera className="mr-1 inline h-3.5 w-3.5" style={{ color: '#E8C97A' }} />{p.name}
                        </span>
                        {p.city && <span className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>{p.city}</span>}
                      </Link>
                    ))}
                  </div>
                )}
                {(res.results.posts || []).length > 0 && (
                  <div className="space-y-1">
                    <div className="px-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'var(--lux-text-faint)' }}>Posts &amp; reels</div>
                    {res.results.posts.map((p) => {
                      const to = p.kind === 'reel'
                        ? `/community/reels?start=${encodeURIComponent(p.id)}`
                        : (p.author_url || '/community');
                      return (
                        <Link key={p.id} to={to} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 no-underline"
                          style={{ background: 'var(--lux-panel)' }} data-testid={`pub-post-hit-${p.id}`}>
                          {p.image_url ? (
                            <img src={p.image_url} alt="" loading="lazy" className="h-9 w-9 shrink-0 rounded object-cover" />
                          ) : (
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded"
                              style={{ background: 'rgba(212,175,55,0.14)' }}>
                              {p.kind === 'reel' ? <Play className="h-4 w-4" style={{ color: '#E8C97A' }} />
                                : <Camera className="h-4 w-4" style={{ color: '#E8C97A' }} />}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate text-[13px]" style={{ color: 'var(--lux-text)' }}>{p.title || (p.kind === 'reel' ? 'Reel' : 'Post')}</span>
                            <span className="block truncate text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>{p.author}</span>
                          </span>
                          {p.kind === 'reel' && (
                            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]"
                              style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A' }}>Reel</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {res && res.total === 0 && (
              <div className="py-2.5 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>No results for “{q}”.</div>
            )}
            {!res && (
              <div className="py-4 text-center text-[13px]" style={{ color: 'var(--lux-text-faint)' }}>
                Search photographers by name or city.
              </div>
            )}
          </div>
        ) : ['saved', 'liked', 'collections'].includes(view) ? (
          <div className="lux-glass p-8 text-center" data-testid={`community-${view}`}>
            <Bookmark className="mx-auto mb-3 h-7 w-7" style={{ color: '#E8C97A' }} />
            <div className="font-display text-lg capitalize" style={{ color: 'var(--lux-text)' }}>Your {view}</div>
            <p className="mx-auto mt-1 max-w-xs text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              {signedIn ? 'Nothing here yet — save posts and reels to find them here.' : 'Sign in to see the content you save, like and collect.'}
            </p>
            {!signedIn && <button onClick={() => setNeedLogin(view)} className="lux-btn mt-3 text-sm">Sign in</button>}
          </div>
        ) : (view === 'discover' && feedTab === 'nearby' && nearNeedsCity) ? (
          <div className="lux-glass p-8 text-center" data-testid="community-nearby-picker">
            <MapPin className="mx-auto mb-3 h-7 w-7" style={{ color: '#E8C97A' }} />
            <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Photographers near you</div>
            <p className="mx-auto mt-1 mb-3 max-w-xs text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              Pick a city to see posts and reels from studios there.
            </p>
            {nearCities.length > 0 ? (
              <select value={nearCity} onChange={(e) => { setNearNeedsCity(false); setNearCity(e.target.value); }}
                className="mx-auto block rounded-lg px-3 py-2 text-sm" data-testid="nearby-city-select"
                style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}>
                <option value="">Choose a city…</option>
                {nearCities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <p className="text-[12px]" style={{ color: 'var(--lux-text-faint)' }}>No cities with content yet.</p>
            )}
          </div>
        ) : (view === 'discover' && feedTab === 'following' && !signedIn) ? (
          <div className="lux-glass p-8 text-center" data-testid="community-following-gate">
            <Users className="mx-auto mb-3 h-7 w-7" style={{ color: '#E8C97A' }} />
            <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Follow your favourites</div>
            <p className="mx-auto mt-1 max-w-xs text-sm" style={{ color: 'var(--lux-text-muted)' }}>Sign in to see posts from the studios you follow.</p>
            <button onClick={() => setNeedLogin('follow')} className="lux-btn mt-3 text-sm">Sign in</button>
          </div>
        ) : !feed ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: '#E8C97A' }} /></div>
        ) : feed.length === 0 ? (
          <div className="lux-glass p-8 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            {view === 'posts' ? 'No posts yet.' : 'Nothing here yet — check back soon.'}
          </div>
        ) : (
          <div className="space-y-3.5">
            {view === 'discover' && feedTab === 'nearby' && nearCity && (
              <div className="flex items-center justify-between text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} /> Near {nearCity}</span>
                <button onClick={() => { setNearNeedsCity(true); setNearCity(''); }} className="underline">Change</button>
              </div>
            )}
            {feed.map((p) => (p.type === 'listing'
              ? <MarketplaceCard key={p.id} card={p} />
              : <CommunityPostCard key={p.id} post={p} onInteract={interact} />))}
          </div>
        )}
          </main>

          {/* RIGHT SIDEBAR */}
          <aside className="hidden lg:block" data-testid="community-right-rail">
            <div className="sticky top-24 space-y-4">
              {trendingTags.length > 0 && (
                <div className="lux-glass p-4" data-testid="rail-trending-tags">
                  <div className="mb-2.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--lux-text-faint)' }}>
                    <TrendingUp className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} /> Trending tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {trendingTags.map((t) => (
                      <Link key={t} to={`/community/tag/${encodeURIComponent(t)}`}
                        className="inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] no-underline"
                        style={{ background: 'rgba(124,58,237,0.14)', color: '#C4A6F5' }}><Hash className="h-3 w-3" />{t}</Link>
                    ))}
                  </div>
                </div>
              )}

              {creators.length > 0 && (
                <div className="lux-glass p-4" data-testid="rail-top-photographers">
                  <div className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em]" style={{ color: 'var(--lux-text-faint)' }}>
                    <Users className="h-3.5 w-3.5" style={{ color: '#E8C97A' }} /> Top photographers
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {creators.map((c) => (
                      <Link key={c.studio_id} to={c.url || '/community'} className="flex items-center gap-2.5 no-underline" data-testid={`rail-creator-${c.studio_id}`}>
                        {c.avatar ? (
                          <img src={c.avatar} alt="" className="h-8 w-8 rounded-full object-cover" style={{ border: '1px solid rgba(212,175,55,0.4)' }} />
                        ) : (
                          <span className="grid h-8 w-8 place-items-center rounded-full text-xs" style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A' }}>{(c.name || '?').charAt(0)}</span>
                        )}
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-[13px]" style={{ color: 'var(--lux-text)' }}>{c.name}</span>
                          {c.city && <span className="block truncate text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>{c.city}</span>}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="lux-glass p-4 text-center">
                <div className="font-display text-base" style={{ color: 'var(--lux-text)' }}>Are you a photographer?</div>
                <p className="mt-1 text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>Post reels, grow your studio, get discovered.</p>
                <a href="/studio/signup" className="lux-btn mt-3 inline-flex text-sm no-underline">Join Pixora</a>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4" role="status"
          data-testid="public-community-toast">
          <span className="lux-glass px-4 py-2 text-[13px]" style={{ color: 'var(--lux-text)' }}>{toast}</span>
        </div>
      )}

      {needLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="public-login-modal">
          <div className="absolute inset-0" style={{ background: 'rgba(6,4,2,0.72)' }} onClick={() => setNeedLogin('')} />
          <div className="lux-glass relative w-full max-w-sm p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: 'rgba(212,175,55,0.14)' }}>
              <LogIn className="h-5 w-5" style={{ color: '#E8C97A' }} />
            </div>
            <div className="font-display mb-1 text-xl" style={{ color: 'var(--lux-text)' }}>Sign in to {needLogin}</div>
            <p className="mb-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              Liking, commenting and sharing need an account — it keeps the community real.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a href="/?signin=1&return=/community" className="lux-btn text-sm">I’m a couple / guest</a>
              <a href="/studio/login" className="lux-btn lux-btn-ghost text-sm">I’m a photographer</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
