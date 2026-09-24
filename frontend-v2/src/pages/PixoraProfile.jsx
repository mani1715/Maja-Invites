import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { useAuth } from '@/context/AuthContext';
import * as pixora from '@/api/pixora';
import './PixoraProfile.css';

// Ported from legacy frontend/src/pages/PixoraPublicProfile.jsx.
// GET /api/public/p/{username} needs no auth; follow (POST /api/pixora/follow/{id})
// requires a studio Bearer specifically (couples can't follow), so an anonymous
// or couple visitor gets the same auth prompt either way — the backend is the
// enforcement point, this is only the UX layer over it.
const isVideo = (u) => /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u || '');

function MediaTile({ src, poster, label }) {
  if (isVideo(src)) {
    return <video src={src} poster={poster || undefined} controls playsInline className="pxp-tile-media" />;
  }
  return <img src={src} alt={label || ''} loading="lazy" className="pxp-tile-media" />;
}

const TABS = [
  { key: 'portfolio', label: 'Portfolio', countKey: 'works' },
  { key: 'posts', label: 'Posts', countKey: 'posts' },
  { key: 'reels', label: 'Reels', countKey: 'reels' },
  { key: 'awards', label: 'Awards', countKey: null },
];

export default function PixoraProfile() {
  const { username } = useParams();
  const { admin } = useAuth();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState('portfolio');
  const [needAuth, setNeedAuth] = useState('');
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(false);
    pixora.publicProfile(username)
      .then(({ data }) => { if (alive) setData(data); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [username]);

  useEffect(() => {
    document.title = data?.studio?.name ? `${data.studio.name} — Pixora` : 'Pixora Photographer';
  }, [data]);

  const guard = useCallback((what, fn) => (admin ? fn() : setNeedAuth(what)), [admin]);

  const doFollow = useCallback(() => {
    const sid = data?.studio?.id;
    if (!sid) return;
    pixora.toggleFollow(sid)
      .then(({ data }) => setFollowing(!!data.following))
      .catch((e) => { if (e?.response?.status === 401) setNeedAuth('follow'); });
  }, [data]);

  if (err) {
    return (
      <div className="pxp-page">
        <MarketingNav />
        <div className="pxp-notfound">
          <p>Photographer not found.</p>
          <Link to="/community" className="pxp-btn">Back to community</Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="pxp-page">
        <MarketingNav />
        <div className="pxp-loading">Loading…</div>
      </div>
    );
  }

  const s = data.studio || {};
  const c = data.counts || {};

  return (
    <div className="pxp-page" data-testid="pixora-public-profile">
      <MarketingNav />

      <div className="pxp-hero">
        {s.hero_image
          ? <img src={s.hero_image} alt="" className="pxp-hero-img" />
          : <div className="pxp-hero-img pxp-hero-fallback" />}
      </div>

      <div className="pxp-wrap">
        <div className="pxp-identity">
          <div className="pxp-avatar">
            {s.avatar ? <img src={s.avatar} alt={s.name} /> : <span>{(s.name || '?').charAt(0)}</span>}
          </div>
          <div className="pxp-identity-main">
            <div className="pxp-name-row">
              <h1>{s.name}</h1>
              {s.verified && <span className="pxp-verified" title={s.verified_label || 'Verified'}>✓</span>}
            </div>
            {data.bio && <p className="pxp-bio">{data.bio}</p>}
            <div className="pxp-stats">
              <span><b>{c.followers || 0}</b> followers</span>
              <span><b>{c.following || 0}</b> following</span>
              {data.portfolio_path && <Link to={data.portfolio_path} className="pxp-portfolio-link">View full portfolio →</Link>}
            </div>
          </div>
          <div className="pxp-identity-actions">
            <button onClick={() => guard('follow', doFollow)} data-testid="profile-follow"
              className={following ? 'pxp-btn pxp-btn-ghost' : 'pxp-btn'}>
              {following ? 'Following' : 'Follow'}
            </button>
            <button onClick={() => guard('save', () => {})} className="pxp-btn pxp-btn-ghost" data-testid="profile-save" aria-label="Save">
              ⚑
            </button>
          </div>
        </div>

        <div className="pxp-tabs" data-testid="profile-tabs">
          {TABS.map((t) => {
            const n = t.countKey ? c[t.countKey] : (data.awards || []).length;
            return (
              <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'is-on' : ''}
                data-testid={`profile-tab-${t.key}`}>
                {t.label}{typeof n === 'number' ? ` (${n})` : ''}
              </button>
            );
          })}
        </div>

        <div className="pxp-tab-body">
          {tab === 'portfolio' && (
            (data.works || []).length === 0 ? <Empty text="No portfolio work yet." /> : (
              <div className="pxp-grid">
                {data.works.map((w) => (
                  <div key={w.id} className="pxp-tile" data-testid={`work-${w.id}`}>
                    <MediaTile src={w.video_url || w.image_url} poster={w.thumbnail_url} label={w.title} />
                  </div>
                ))}
              </div>
            )
          )}
          {tab === 'posts' && (
            (data.posts || []).length === 0 ? <Empty text="No posts yet." /> : (
              <div className="pxp-grid">
                {data.posts.map((p) => (
                  <button key={p.id} onClick={() => guard('like', () => {})} className="pxp-tile" data-testid={`post-${p.id}`}>
                    <MediaTile src={p.image_url} label={p.title} />
                  </button>
                ))}
              </div>
            )
          )}
          {tab === 'reels' && (
            (data.reels || []).length === 0 ? <Empty text="No reels yet." /> : (
              <div className="pxp-grid pxp-grid-tall">
                {data.reels.map((r) => (
                  <div key={r.id} className="pxp-tile" data-testid={`reel-${r.id}`}>
                    <MediaTile src={r.url} poster={r.thumbnail_url} label={r.caption} />
                  </div>
                ))}
              </div>
            )
          )}
          {tab === 'awards' && (
            (data.awards || []).length === 0 ? <Empty text="No awards yet." /> : (
              <div className="pxp-awards">
                {data.awards.map((a) => (
                  <div key={a.key} className="pxp-award" data-testid={`award-${a.key}`}>
                    <span className="pxp-award-icon">★</span>
                    <div>
                      <div className="pxp-award-label">{a.label}</div>
                      <div className="pxp-award-desc">{a.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {needAuth && (
        <div className="pxp-modal" data-testid="login-required-modal">
          <div className="pxp-modal-backdrop" onClick={() => setNeedAuth('')} />
          <div className="pxp-modal-card">
            <h2>Sign in to {needAuth}</h2>
            <p>Create a Pixora account to interact with photographers.</p>
            <div className="pxp-modal-actions">
              <Link to="/auth" className="pxp-btn pxp-btn-ghost">Log in</Link>
              <Link to="/auth/signup" className="pxp-btn">Create account</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ text }) {
  return <div className="pxp-empty">{text}</div>;
}
