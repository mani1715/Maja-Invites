// PixoraPublicProfile (Phase 4) — the public /p/:username page.
// Portfolio + community profile, viewable by anyone. Visitors can browse work,
// posts, reels and awards, but liking / commenting / following / saving requires
// a Pixora account: those actions open a "Login Required" prompt when logged out.
// The backend keeps every interaction endpoint auth-gated, so this is a UX layer
// over a boundary that is already enforced server-side.
import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Loader2, BadgeCheck, Heart, MessageCircle, UserPlus, Bookmark,
  Camera, Film, Award, MapPin, X, LogIn,
} from 'lucide-react';
import '@/styles/luxury.css';
import useSeo from '@/hooks/useSeo';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const isLoggedIn = () => !!localStorage.getItem('admin_token');
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

function LoginRequiredModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="login-required-modal">
      <div className="absolute inset-0" style={{ background: 'rgba(6,4,2,0.72)' }} onClick={onClose} />
      <div className="lux-glass relative w-full max-w-sm p-6 text-center">
        <button onClick={onClose} className="absolute top-3 right-3 opacity-70 hover:opacity-100" aria-label="Close">
          <X className="w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
        </button>
        <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center"
          style={{ background: 'rgba(212,175,55,0.14)' }}>
          <LogIn className="w-5 h-5" style={{ color: '#E8C97A' }} />
        </div>
        <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>Login Required</div>
        <p className="text-sm mb-4" style={{ color: 'var(--lux-text-muted)' }}>
          Create a Pixora account to interact with photographers.
        </p>
        <div className="flex gap-2 justify-center">
          <a href="/studio/login" className="lux-btn lux-btn-ghost text-sm">Log in</a>
          <a href="/studio/signup" className="lux-btn text-sm">Create account</a>
        </div>
      </div>
    </div>
  );
}

const isVideo = (u) => /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u || '');

function MediaTile({ src, poster, label }) {
  if (isVideo(src)) {
    return <video src={src} poster={poster || undefined} controls playsInline
      className="w-full h-full object-cover rounded-lg" style={{ background: '#000' }} />;
  }
  return <img src={src} alt={label || ''} loading="lazy"
    className="w-full h-full object-cover rounded-lg"
    onError={(e) => { e.currentTarget.style.opacity = '0.25'; }} />;
}

export default function PixoraPublicProfile() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState('portfolio');
  const [needLogin, setNeedLogin] = useState(false);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/api/public/p/${encodeURIComponent(username)}`)
      .then(({ data }) => { if (alive) setData(data); })
      .catch(() => { if (alive) setErr(true); });
    // analytics: profile view (public, no auth needed)
    axios.post(`${API_URL}/api/track`, { type: 'profile_view', target_type: 'pixora_profile', target_id: username }).catch(() => {});
    return () => { alive = false; };
  }, [username]);

  // SEO: title/description/OG/Twitter + Person structured data.
  const _st = data?.studio || {};
  useSeo({
    title: data ? `${_st.name || 'Photographer'} — Pixora` : 'Pixora Photographer',
    description: data?.bio || `${_st.name || 'Photographer'} on Pixora — portfolio, reels, awards and reviews.`,
    image: _st.hero_image || _st.avatar,
    type: 'profile',
    jsonLd: data ? {
      '@context': 'https://schema.org', '@type': 'Person', name: _st.name,
      image: _st.avatar || _st.hero_image, description: data.bio,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    } : null,
  });

  // Any interaction while logged out → prompt to log in (auth is enforced server-side).
  const guard = useCallback((fn) => (isLoggedIn() ? fn() : setNeedLogin(true)), []);

  const doFollow = useCallback(() => {
    const sid = data?.studio?.id;
    if (!sid) return;
    axios.post(`${API_URL}/api/pixora/follow/${sid}`, {}, { headers: authHeaders() })
      .then(({ data }) => setFollowing(!!data.following)).catch(() => {});
  }, [data]);

  if (err) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center" style={{ background: 'var(--lux-bg)' }}>
        <div className="lux-glass p-10 text-center">
          <Camera className="w-8 h-8 mx-auto mb-3" style={{ color: '#E8C97A' }} />
          <div className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>Photographer not found</div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="luxe min-h-screen flex items-center justify-center" style={{ background: 'var(--lux-bg)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#E8C97A' }} />
      </div>
    );
  }

  const s = data.studio || {};
  const c = data.counts || {};
  const TABS = [
    { key: 'portfolio', label: 'Portfolio', icon: Camera, n: c.works },
    { key: 'posts', label: 'Posts', icon: MessageCircle, n: c.posts },
    { key: 'reels', label: 'Reels', icon: Film, n: c.reels },
    { key: 'awards', label: 'Awards', icon: Award, n: (data.awards || []).length },
  ];

  return (
    <div className="luxe min-h-screen" style={{ background: 'var(--lux-bg)' }} data-testid="pixora-public-profile">
      {/* hero */}
      <div className="relative h-52 md:h-64 w-full overflow-hidden">
        {s.hero_image
          ? <img src={s.hero_image} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full" style={{ background: 'linear-gradient(135deg,#2a1e0e,#0b0906)' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--lux-bg), transparent)' }} />
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-14 relative">
        {/* identity card */}
        <div className="lux-glass p-5 flex items-start gap-4 flex-wrap">
          <div className="w-20 h-20 rounded-full overflow-hidden shrink-0" style={{ border: '2px solid rgba(212,175,55,0.4)' }}>
            {s.avatar ? <img src={s.avatar} alt={s.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--lux-panel)' }}>
                  <Camera className="w-7 h-7" style={{ color: '#E8C97A' }} /></div>}
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{s.name}</h1>
              {s.verified && <BadgeCheck className="w-5 h-5" style={{ color: '#E8C97A' }}
                title={s.verified_label || 'Verified'} />}
            </div>
            {data.bio && <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>{data.bio}</p>}
            <div className="flex gap-4 mt-2 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              <span><b style={{ color: 'var(--lux-text)' }}>{c.followers || 0}</b> followers</span>
              <span><b style={{ color: 'var(--lux-text)' }}>{c.following || 0}</b> following</span>
              <a href={data.portfolio_path} className="text-gold hover:underline">View full portfolio →</a>
            </div>
          </div>
          {/* interaction cluster — gated for logged-out visitors */}
          <div className="flex items-center gap-2">
            <button onClick={() => guard(doFollow)} data-testid="profile-follow"
              className={following ? 'lux-btn lux-btn-ghost text-sm' : 'lux-btn text-sm'}>
              <UserPlus className="w-4 h-4" /> {following ? 'Following' : 'Follow'}
            </button>
            <button onClick={() => guard(() => {})} className="lux-btn lux-btn-ghost text-sm" data-testid="profile-save" aria-label="Save">
              <Bookmark className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-2 my-5 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const I = t.icon; const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} data-testid={`profile-tab-${t.key}`}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs uppercase tracking-wide ${on ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`}>
                <I className="w-3.5 h-3.5" /> {t.label}{typeof t.n === 'number' ? ` (${t.n})` : ''}
              </button>
            );
          })}
        </div>

        <div className="pb-16">
          {tab === 'portfolio' && (
            (data.works || []).length === 0
              ? <Empty text="No portfolio work yet." />
              : <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.works.map((w) => (
                    <div key={w.id} className="aspect-square" data-testid={`work-${w.id}`}>
                      <MediaTile src={w.video_url || w.image_url} poster={w.thumbnail_url} label={w.title} />
                    </div>
                  ))}
                </div>
          )}
          {tab === 'posts' && (
            (data.posts || []).length === 0
              ? <Empty text="No posts yet." />
              : <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.posts.map((p) => (
                    <button key={p.id} onClick={() => guard(() => {})} className="aspect-square" data-testid={`post-${p.id}`}>
                      <MediaTile src={p.image_url} label={p.title} />
                    </button>
                  ))}
                </div>
          )}
          {tab === 'reels' && (
            (data.reels || []).length === 0
              ? <Empty text="No reels yet." />
              : <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {data.reels.map((r) => (
                    <div key={r.id} className="aspect-[9/16]" data-testid={`reel-${r.id}`}>
                      <MediaTile src={r.url} poster={r.thumbnail_url} label={r.caption} />
                    </div>
                  ))}
                </div>
          )}
          {tab === 'awards' && (
            (data.awards || []).length === 0
              ? <Empty text="No awards yet." />
              : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.awards.map((a) => (
                    <div key={a.key} className="lux-glass p-4 flex items-center gap-3" data-testid={`award-${a.key}`}>
                      <Award className="w-6 h-6 shrink-0" style={{ color: '#E8C97A' }} />
                      <div>
                        <div className="font-display" style={{ color: 'var(--lux-text)' }}>{a.label}</div>
                        <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{a.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
          )}
        </div>
      </div>

      {needLogin && <LoginRequiredModal onClose={() => setNeedLogin(false)} />}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="lux-glass p-10 text-center" style={{ color: 'var(--lux-text-muted)' }}>
      <MapPin className="w-6 h-6 mx-auto mb-2" style={{ color: '#E8C97A' }} />
      <div className="text-sm">{text}</div>
    </div>
  );
}
