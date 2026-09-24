import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { useAuth } from '@/context/AuthContext';
import * as pixora from '@/api/pixora';
import * as catalog from '@/api/publicCatalog';
import StoriesRail from '@/components/community/StoriesRail';
import './Community.css';
import useSeo from '@/lib/useSeo';

// Ported from legacy frontend/src/pages/PublicCommunity.jsx, simplified to what
// the brief asks for: the feed itself is public and read-only for anonymous
// visitors (GET /api/public/pixora/feed needs no auth); only the interaction
// endpoints (like/save/comment) are actor-gated and prompt sign-in on 401.
function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// `key` maps to a DIFFERENT endpoint per tab, which is the point: "For You"
// was labelled that while calling the same flat feed as everything else, so the
// ranking in /api/public/pixora/foryou was computed for nobody. Same for
// /nearby, which had no reader at all.
const TABS = [
  { key: '', label: 'For You' },
  { key: 'post', label: 'Posts' },
  { key: 'trending', label: 'Trending' },
  { key: 'nearby', label: 'Near you' },
];

function Comments({ post, onNeedAuth }) {
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    pixora.comments(post.id).then(({ data }) => setRows(data.comments || [])).catch(() => setRows([]));
  }, [post.id]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await pixora.addComment(post.id, body);
      setText('');
      load();
    } catch (e) {
      if (e?.response?.status === 401) onNeedAuth('comment');
    }
    setBusy(false);
  };

  return (
    <div className="pxc-comments">
      {rows === null ? (
        <p className="pxc-comments-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="pxc-comments-empty">No comments yet.</p>
      ) : (
        <ul className="pxc-comments-list">
          {rows.map((c) => (
            <li key={c.id}><span className="pxc-comment-author">{c.author}</span>{c.body}</li>
          ))}
        </ul>
      )}
      <div className="pxc-comment-row">
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Add a comment" />
        <button onClick={send} disabled={busy || !text.trim()}>Post</button>
      </div>
    </div>
  );
}

function PostCard({ post, onLike, onSave, onShare, onToggleComments, onNeedAuth }) {
  const isReel = post.kind === 'reel' || !!post.video_url;
  const initials = (post.author || '?').trim().charAt(0).toUpperCase();
  return (
    <article className="pxc-card" data-testid={`community-post-${post.id}`}>
      <header className="pxc-card-head">
        <Link to={post.author_url || '/community'} className="pxc-avatar">
          {post.author_avatar
            ? <img src={post.author_avatar} alt="" loading="lazy" />
            : <span>{initials}</span>}
        </Link>
        <div className="pxc-card-byline">
          <Link to={post.author_url || '/community'}>{post.author}</Link>
          <span className="pxc-card-meta">{post.author_city ? `${post.author_city} · ` : ''}{timeAgo(post.created_at)}</span>
        </div>
        {isReel && <span className="pxc-chip">Reel</span>}
      </header>

      {isReel && post.video_url ? (
        <video className="pxc-media" src={post.video_url} poster={post.image_url || undefined}
          controls playsInline preload="none" />
      ) : (post.images || []).length > 1 ? (
        <div className="pxc-carousel">
          {post.images.map((u, i) => <img key={u + i} src={u} alt="" loading="lazy" />)}
        </div>
      ) : post.image_url ? (
        <img className="pxc-media" src={post.image_url} alt={post.title || ''} loading="lazy" />
      ) : null}

      <div className="pxc-card-body">
        {(post.title || post.body) && (
          <p className="pxc-card-text">
            {post.title && <span className="pxc-card-title">{post.title} </span>}
            {post.body}
          </p>
        )}

        {(post.tags || []).length > 0 && (
          <div className="pxc-tags">
            {post.tags.map((t) => <Link key={t} to={`/community?tag=${encodeURIComponent(t)}`}>#{t}</Link>)}
          </div>
        )}

        <div className="pxc-actions">
          <button onClick={() => onLike(post)} aria-pressed={!!post.viewer_liked}
            className={post.viewer_liked ? 'is-on' : ''} data-testid={`community-like-${post.id}`}>
            ♥ {post.like_count}
          </button>
          <button onClick={() => onToggleComments(post)} data-testid={`community-comment-${post.id}`}>
            ✎ {post.comment_count}
          </button>
          <button onClick={() => onSave(post)} aria-pressed={!!post.viewer_saved}
            className={post.viewer_saved ? 'is-on' : ''} data-testid={`community-save-${post.id}`}>
            ⚑ {post.save_count ?? 0}
          </button>
          <button onClick={() => onShare(post)} data-testid={`community-share-${post.id}`}>
            ↗ {post.share_count ?? 0}
          </button>
        </div>

        {post.commentsOpen && <Comments post={post} onNeedAuth={onNeedAuth} />}
      </div>
    </article>
  );
}

export default function Community() {
  useSeo({ title: 'Community', description: 'Work, reels and stories from the photographers and studios building on MAJA Invites.' });
  const { admin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag') || '';
  const kind = params.get('kind') || '';

  const [feedState, setFeedState] = useState({ status: 'loading', posts: [], viewer: null });
  const [creators, setCreators] = useState([]);
  const [tags, setTags] = useState([]);
  const [needAuth, setNeedAuth] = useState('');
  const [city, setCity] = useState(() => params.get('city') || '');
  const [toast, setToast] = useState('');

  const signedIn = !!admin || !!feedState.viewer?.signed_in;

  const load = useCallback(() => {
    setFeedState((s) => ({ ...s, status: 'loading' }));
    let req;
    if (kind === 'trending') req = pixora.trending();
    else if (kind === 'nearby') {
      // No city yet means nothing to scope to — don't fire a request that
      // would just return the unfiltered feed under a "Near you" heading.
      if (!city) { setFeedState({ status: 'ready', posts: [], viewer: null }); return; }
      req = catalog.nearby(city);
    } else if (kind === '') req = catalog.forYou();
    else req = pixora.feed({ kind });
    req.then(({ data }) => setFeedState({
      status: 'ready',
      // /foryou and /nearby return `feed`; /feed and /trending return `posts`.
      posts: data.posts || data.feed || [],
      viewer: data.viewer || null,
    })).catch(() => setFeedState({ status: 'error', posts: [], viewer: null }));
  }, [kind, city]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    pixora.featuredCreators(6).then(({ data }) => setCreators(data.creators || [])).catch(() => setCreators([]));
    // publicCatalog, not pixora — api/pixora.js has no trendingHashtags, so
    // this threw TypeError on mount and took the whole page to the error
    // boundary. /community rendered nothing at all for every visitor.
    catalog.trendingHashtags().then(({ data }) => setTags((data.tags || []).map((x) => x.tag || x))).catch(() => setTags([]));
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(id);
  }, [toast]);

  const visible = useMemo(
    () => (tag ? feedState.posts.filter((p) => (p.tags || []).includes(tag)) : feedState.posts),
    [feedState.posts, tag],
  );

  const setPost = (id, patch) =>
    setFeedState((s) => ({ ...s, posts: s.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  const like = async (post) => {
    if (!signedIn) { setNeedAuth('like'); return; }
    setPost(post.id, { viewer_liked: !post.viewer_liked, like_count: post.like_count + (post.viewer_liked ? -1 : 1) });
    try {
      const { data } = await pixora.likePost(post.id);
      setPost(post.id, { viewer_liked: data.liked, like_count: data.like_count });
    } catch (e) {
      setPost(post.id, { viewer_liked: post.viewer_liked, like_count: post.like_count });
      if (e?.response?.status === 401) setNeedAuth('like');
    }
  };

  const save = async (post) => {
    if (!signedIn) { setNeedAuth('save'); return; }
    setPost(post.id, { viewer_saved: !post.viewer_saved, save_count: (post.save_count || 0) + (post.viewer_saved ? -1 : 1) });
    try {
      const { data } = await pixora.savePost(post.id);
      setPost(post.id, { viewer_saved: data.saved, save_count: data.save_count });
    } catch (e) {
      setPost(post.id, { viewer_saved: post.viewer_saved, save_count: post.save_count });
      if (e?.response?.status === 401) setNeedAuth('save');
    }
  };

  const share = async (post) => {
    const url = `${window.location.origin}${post.author_url || '/community'}`;
    try {
      if (navigator.share) await navigator.share({ title: post.title || 'MAJA Community', url });
      else { await navigator.clipboard.writeText(url); setToast('Link copied'); }
    } catch (_e) { /* visitor dismissed the share sheet */ }
    try {
      const { data } = await pixora.sharePost(post.id);
      setPost(post.id, { share_count: data.share_count });
    } catch (_e) { /* recording a share must never block the share itself */ }
  };

  const toggleComments = (post) => {
    if (!signedIn) { setNeedAuth('comment'); return; }
    setPost(post.id, { commentsOpen: !post.commentsOpen });
  };

  const clearTag = () => { const p = new URLSearchParams(params); p.delete('tag'); setParams(p); };
  const setKind = (k) => { const p = new URLSearchParams(params); if (k) p.set('kind', k); else p.delete('kind'); setParams(p); };

  return (
    <div className="pxc-page">
      <MarketingNav />

      <header className="px-aurora pxc-hero">
        <span aria-hidden="true" className="px-petal" style={{ left: '8%', animationDelay: '-2s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '30%', width: 10, height: 14, opacity: .4, animationDuration: '18s', animationDelay: '-9s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '58%', width: 14, height: 18, opacity: .5, animationDuration: '12s', animationDelay: '-5s' }} />
        <span aria-hidden="true" className="px-petal" style={{ left: '86%', animationDuration: '16s', animationDelay: '-11s' }} />
        <div className="pxc-hero-inner">
          <p className="pxc-eyebrow">Welcome to Pixora ✦</p>
          <h1 className="pxc-h1">Where photographers<br /><span>connect, create &amp; grow</span></h1>
          <p className="pxc-sub">Reels, posts and portfolios from wedding photographers and studios. Browse freely — sign in to like, comment and follow.</p>
          <div className="pxc-hero-cta">
            <Link to="/auth/signup" className="pxc-btn">Join as a photographer</Link>
            <Link to="/community/reels" className="pxc-btn pxc-btn-ghost">Watch reels</Link>
          </div>
        </div>
      </header>

      <div className="pxc-shell">
        <main id="main-content" className="pxc-main">
          <div className="pxc-tabs" data-testid="community-tabs">
            {TABS.map((t) => (
              <button key={t.key || 'foryou'} className={kind === t.key ? 'is-on' : ''} onClick={() => setKind(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Studio stories. Renders nothing when no studio has an unexpired
              one, so the rail never appears as an empty strip. */}
          <StoriesRail />

          {kind === 'nearby' && (
            <div className="pxc-tag-filter">
              <label htmlFor="pxc-city">Show work from</label>
              <input
                id="pxc-city"
                className="pxc-city-input"
                value={city}
                onChange={(e) => {
                  const v = e.target.value;
                  setCity(v);
                  const next = new URLSearchParams(params);
                  if (v) next.set('city', v); else next.delete('city');
                  setParams(next, { replace: true });
                }}
                placeholder="Guntur, Hyderabad, Kochi…"
                data-testid="community-city"
              />
            </div>
          )}

          {/* composer teaser — auth-gated, always visible, hands off to the studio panel */}
          <div className="pxc-composer" data-testid="community-composer">
            <textarea rows={2} placeholder="Share a frame, a lesson, or a question…" readOnly
              onFocus={() => (signedIn ? navigate('/studio/community') : setNeedAuth('post'))} />
            <div className="pxc-composer-row">
              <Link to={signedIn ? '/studio/community' : '/auth'} className="pxc-btn pxc-btn-ghost">Add photos</Link>
              <Link to={signedIn ? '/studio/community' : '/auth'} className="pxc-btn">Post</Link>
            </div>
          </div>

          {tag && (
            <div className="pxc-tag-filter">
              <span>Filtering by <b>#{tag}</b></span>
              <button onClick={clearTag}>Clear</button>
            </div>
          )}

          {feedState.status === 'loading' && <p className="pxc-state">Loading the feed…</p>}
          {feedState.status === 'error' && <p className="pxc-state">Couldn&rsquo;t load the community feed. Please refresh.</p>}
          {feedState.status === 'ready' && visible.length === 0 && (
            <p className="pxc-state">
              {tag ? `No posts tagged #${tag} yet.`
                : kind === 'nearby'
                  ? (city ? `No work posted from ${city} yet.` : 'Type a city to see work shot there.')
                  : 'Nothing here yet — check back soon.'}
            </p>
          )}
          {feedState.status === 'ready' && visible.length > 0 && (
            <div className="pxc-feed">
              {visible.map((p) => (
                <PostCard key={p.id} post={p} onLike={like} onSave={save} onShare={share}
                  onToggleComments={toggleComments} onNeedAuth={setNeedAuth} />
              ))}
            </div>
          )}
        </main>

        <aside className="pxc-rail">
          {tags.length > 0 && (
            <div className="pxc-rail-card" data-testid="community-trending-tags">
              <p className="pxc-rail-title">Trending tags</p>
              <div className="pxc-tags">
                {tags.map((t) => <Link key={t} to={`/community?tag=${encodeURIComponent(t)}`}>#{t}</Link>)}
              </div>
            </div>
          )}
          {creators.length > 0 && (
            <div className="pxc-rail-card" data-testid="community-top-creators">
              <p className="pxc-rail-title">Top photographers</p>
              <div className="pxc-creators">
                {creators.map((c) => (
                  <Link key={c.studio_id} to={c.url || '/community'} className="pxc-creator">
                    {c.avatar ? <img src={c.avatar} alt="" loading="lazy" decoding="async" /> : <span>{(c.name || '?').charAt(0)}</span>}
                    <span className="pxc-creator-name">{c.name}{c.city ? <em>{c.city}</em> : null}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="pxc-rail-card pxc-rail-cta">
            <p className="pxc-rail-title">Are you a photographer?</p>
            <p className="pxc-rail-sub">Post reels, grow your studio, get discovered.</p>
            <Link to="/auth/signup" className="pxc-btn">Join Pixora</Link>
          </div>
        </aside>
      </div>

      {toast && <div className="pxc-toast" role="status">{toast}</div>}

      {needAuth && (
        <div className="pxc-modal" data-testid="community-auth-modal">
          <div className="pxc-modal-backdrop" onClick={() => setNeedAuth('')} />
          <div className="pxc-modal-card">
            <h2>Sign in to {needAuth}</h2>
            <p>Liking, commenting, saving and posting need an account — it keeps the community real.</p>
            <div className="pxc-modal-actions">
              <Link to="/auth" className="pxc-btn">Sign in</Link>
              <Link to="/auth/signup" className="pxc-btn pxc-btn-ghost">Create account</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
