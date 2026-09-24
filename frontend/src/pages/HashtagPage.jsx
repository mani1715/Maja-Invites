// HashtagPage — /community/tag/:tag (C2). Every post/reel carrying a hashtag,
// ranked, with a header of real counts. Reuses the community post card so a tag
// page looks and behaves exactly like the feed.
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { Hash, Loader2, ArrowLeft, LogIn } from 'lucide-react';
import { CommunityPostCard } from '@/pages/PublicCommunity';
import '@/styles/luxury.css';
import useSeo from '@/hooks/useSeo';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const hasStudioToken = () => { try { return !!localStorage.getItem('admin_token'); } catch (_) { return false; } };
const authCfg = () => {
  const t = hasStudioToken() ? localStorage.getItem('admin_token') : null;
  return { withCredentials: true, headers: t ? { Authorization: `Bearer ${t}` } : {} };
};

export default function HashtagPage() {
  const { tag } = useParams();
  const [data, setData] = useState(null);
  const [needLogin, setNeedLogin] = useState('');
  const [signedIn, setSignedIn] = useState(hasStudioToken());

  useSeo({
    title: `#${tag} — MAJA Community`,
    description: `Posts and reels tagged #${tag} on MAJA.`,
    type: 'website',
  });

  const load = useCallback(() => {
    setData(null);
    axios.get(`${API_URL}/api/public/pixora/hashtag/${encodeURIComponent(tag)}`, authCfg())
      .then(({ data: d }) => setData(d))
      .catch(() => setData({ tag, posts: [], post_count: 0 }));
  }, [tag]);
  useEffect(() => { load(); }, [load]);

  // Minimal interaction handler — like/save/share/comment against the same endpoints;
  // any 401 opens the sign-in prompt. Optimistic UI mirrors the main feed.
  const interact = async (what, post) => {
    if (what === 'share') {
      const url = `${window.location.origin}${post?.author_url || '/community'}`;
      try {
        if (navigator.share) await navigator.share({ title: post?.title || 'MAJA', url });
        else await navigator.clipboard.writeText(url);
      } catch (_) { /* dismissed */ }
      try { await axios.post(`${API_URL}/api/pixora/posts/${post.id}/share`, { channel: 'link' }, authCfg()); } catch (_) {}
      return;
    }
    if (!signedIn && !hasStudioToken()) { setNeedLogin(what); return; }
    if (what === 'comment') {
      setData((d) => ({ ...d, posts: d.posts.map((p) => (p.id === post.id ? { ...p, comments_open: !p.comments_open } : p)) }));
      return;
    }
    const ep = what === 'save' ? 'save' : 'like';
    try {
      const { data: r } = await axios.post(`${API_URL}/api/pixora/posts/${post.id}/${ep}`, {}, authCfg());
      setData((d) => ({ ...d, posts: d.posts.map((p) => (p.id === post.id
        ? { ...p, viewer_liked: ep === 'like' ? r.liked : p.viewer_liked, like_count: r.like_count ?? p.like_count,
            viewer_saved: ep === 'save' ? r.saved : p.viewer_saved, save_count: r.save_count ?? p.save_count }
        : p)) }));
    } catch (e) {
      if (e?.response?.status === 401) setNeedLogin(what);
    }
  };

  return (
    <div className="luxe min-h-screen" style={{ background: 'var(--lux-bg)' }} data-testid="hashtag-page">
      <div className="mx-auto max-w-[600px] px-3 py-6 lg:px-6">
        <Link to="/community" className="mb-4 inline-flex items-center gap-1.5 text-[12px] no-underline"
          style={{ color: 'var(--lux-text-muted)' }}><ArrowLeft className="h-3.5 w-3.5" /> Back to community</Link>

        <div className="lux-glass mb-5 flex items-center gap-3 p-4" data-testid="hashtag-header">
          <span className="grid h-12 w-12 place-items-center rounded-full"
            style={{ background: 'rgba(124,58,237,0.16)', color: '#C4A6F5' }}><Hash className="h-6 w-6" /></span>
          <div className="min-w-0">
            <div className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>#{data?.tag || tag}</div>
            {data && (
              <div className="text-[12px]" style={{ color: 'var(--lux-text-faint)' }}>
                {data.post_count} {data.post_count === 1 ? 'post' : 'posts'}
                {data.total_views ? ` · ${data.total_views.toLocaleString('en-IN')} views` : ''}
                {data.studio_count ? ` · ${data.studio_count} studios` : ''}
              </div>
            )}
          </div>
        </div>

        {!data ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" style={{ color: '#E8C97A' }} /></div>
        ) : (data.posts || []).length === 0 ? (
          <div className="lux-glass p-8 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            Nothing tagged #{data.tag || tag} yet.
          </div>
        ) : (
          <div className="space-y-3.5">
            {data.posts.map((p) => <CommunityPostCard key={p.id} post={p} onInteract={interact} />)}
          </div>
        )}
      </div>

      {needLogin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="hashtag-login-modal">
          <div className="absolute inset-0" style={{ background: 'rgba(6,4,2,0.72)' }} onClick={() => setNeedLogin('')} />
          <div className="lux-glass relative w-full max-w-sm p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'rgba(212,175,55,0.14)' }}>
              <LogIn className="h-5 w-5" style={{ color: '#E8C97A' }} />
            </div>
            <div className="font-display mb-1 text-xl" style={{ color: 'var(--lux-text)' }}>Sign in to {needLogin}</div>
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
