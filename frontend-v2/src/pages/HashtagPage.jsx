import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import * as catalog from '@/api/publicCatalog';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import './BrowseDesigns.css';

// Clickable hashtag page for the community feed. Hashtags render as links
// inside posts, so without this route every one of them 404'd.

export default function HashtagPage() {
  const { tag } = useParams();
  const clean = String(tag || '').replace(/^#/, '');

  useSeo({
    title: `#${clean}`,
    description: `Wedding photography tagged #${clean} on the MAJA community.`,
  });

  const [posts, setPosts] = useState(null);
  const [trending, setTrending] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      catalog.hashtagFeed(clean, { limit: 60 }),
      catalog.trendingHashtags().catch(() => ({ data: null })),
    ])
      .then(([feed, tr]) => {
        const d = feed.data;
        // Only ever accept an ARRAY. The old fallback chain reached
        // `d.results`, which the search endpoint returns as an object, and the
        // page then called .map on it — a hard crash on every tag page.
        const rows = [d?.posts, d?.items, Array.isArray(d) ? d : null]
          .find((x) => Array.isArray(x)) || [];
        setPosts(rows);
        const t = tr.data;
        setTrending(t?.hashtags || t?.trending || (Array.isArray(t) ? t : []));
      })
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load this tag.'))
      .finally(() => setLoading(false));
  }, [clean]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="brw-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora brw-hero">
        <div className="brw-hero-inner">
          <nav className="brw-crumbs" aria-label="Breadcrumb">
            <Link to="/community" data-mj-link>Community</Link>
            <span aria-hidden="true"> / </span><span>#{clean}</span>
          </nav>
          <h1 className="brw-h1">#<span className="brw-hl">{clean}</span></h1>
          <p className="brw-sub">
            {posts ? `${posts.length} post${posts.length === 1 ? '' : 's'} tagged this.` : 'Loading posts…'}
          </p>
        </div>
      </header>

      <main id="main-content" className="brw-body">
        {trending.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            {trending.slice(0, 12).map((t) => {
              const name = String(t.tag || t.name || t).replace(/^#/, '');
              const on = name.toLowerCase() === clean.toLowerCase();
              return (
                <Link
                  key={name}
                  to={`/community/tag/${encodeURIComponent(name)}`}
                  className={`brw-btn ${on ? 'brw-btn--primary' : 'brw-btn--ghost'}`}
                  style={{ minHeight: 38, padding: '0 14px', fontSize: 12.5 }}
                >
                  #{name}
                </Link>
              );
            })}
          </div>
        )}

        {loading && (
          <div className="brw-grid">
            {Array.from({ length: 9 }).map((_, i) => <div key={i} className="brw-skel" />)}
          </div>
        )}

        {!loading && error && (
          <div className="brw-error" role="alert">
            <p className="brw-error-title">{error}</p>
            <div className="brw-error-actions">
              <button type="button" className="brw-btn brw-btn--primary" onClick={load}>Try again</button>
              <Link className="brw-btn brw-btn--ghost" to="/community">Back to community</Link>
            </div>
          </div>
        )}

        {!loading && !error && (posts.length === 0 ? (
          <p className="brw-empty">
            Nothing tagged #{clean} yet. Browse the <Link to="/community" data-mj-link>full community feed</Link> instead.
          </p>
        ) : (
          <div className="brw-grid">
            {posts.map((p) => {
              const media = p.media?.[0]?.url || p.media_url || p.thumbnail || p.image_url;
              return (
                <article key={p.id} className="brw-card" style={{ cursor: 'default' }}>
                  <span className="brw-thumb brw-thumb--tall" style={{ background: 'linear-gradient(135deg,#ede9fe,#a78bfa)' }}>
                    {media && <img src={resolveMediaUrl(media)} alt={p.caption ? String(p.caption).slice(0, 80) : ''} loading="lazy" />}
                  </span>
                  <span className="brw-card-body">
                    <span className="brw-card-name">{p.studio_name || p.author_name || 'A studio'}</span>
                    {p.caption && <span className="brw-card-desc">{String(p.caption).slice(0, 110)}</span>}
                    {p.username && (
                      <Link to={`/p/${p.username}`} className="brw-tag" style={{ textDecoration: 'none' }}>
                        @{p.username}
                      </Link>
                    )}
                  </span>
                </article>
              );
            })}
          </div>
        ))}
      </main>
    </div>
  );
}
