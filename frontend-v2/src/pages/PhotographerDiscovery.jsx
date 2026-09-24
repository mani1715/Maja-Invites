import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import * as catalog from '@/api/publicCatalog';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import './BrowseDesigns.css';

// SEO discovery landing pages: /photographers/:a and /photographers/:a/:b,
// resolved server-side by /api/public/discovery. One segment is a city OR a
// service; two segments are both ("hyderabad/candid-photography").
//
// Thin results are marked noindex — the legacy app did the same. A landing
// page with two photographers on it is not something Google should keep.

const THIN_THRESHOLD = 3;

export default function PhotographerDiscovery() {
  const { a, b } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    catalog.discovery(a, b)
      .then((r) => setData(r.data))
      .catch((e) => setError(
        e?.response?.status === 404
          ? 'We do not have a page for that combination yet.'
          : e?.response?.data?.detail || 'Could not load this page.',
      ))
      .finally(() => setLoading(false));
  }, [a, b]);

  useEffect(() => { load(); }, [load]);

  const results = data?.photographers || data?.results || data?.items || [];
  const heading = data?.title || data?.heading
    || [b, a].filter(Boolean).map(pretty).reverse().join(' in ')
    || 'Wedding photographers';

  useSeo({
    title: heading,
    description: data?.meta_description
      || `${heading} using MAJA Invites — portfolios, galleries and AI face match for their couples.`,
    noindex: !loading && results.length < THIN_THRESHOLD,
  });

  return (
    <div className="brw-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora brw-hero">
        <div className="brw-hero-inner">
          <nav className="brw-crumbs" aria-label="Breadcrumb">
            <Link to="/photographers" data-mj-link>All photographers</Link>
            <span aria-hidden="true"> / </span><span>{heading}</span>
          </nav>
          <h1 className="brw-h1">{heading}</h1>
          <p className="brw-sub">
            {data?.intro
              || 'Studios delivering invitations, galleries and face-matched photos through MAJA.'}
          </p>
        </div>
      </header>

      <main id="main-content" className="brw-body">
        {loading && (
          <div className="brw-grid">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="brw-skel" />)}
          </div>
        )}

        {!loading && error && (
          <div className="brw-error" role="alert">
            <p className="brw-error-title">{error}</p>
            <div className="brw-error-actions">
              <button type="button" className="brw-btn brw-btn--primary" onClick={load}>Try again</button>
              <Link className="brw-btn brw-btn--ghost" to="/photographers">Browse everyone</Link>
            </div>
          </div>
        )}

        {!loading && !error && (results.length === 0 ? (
          <p className="brw-empty">
            No studios here yet. Try the{' '}
            <Link to="/photographers" data-mj-link>full directory</Link> — it covers every city we work in.
          </p>
        ) : (
          <>
            {results.length < THIN_THRESHOLD && (
              <p className="brw-empty" style={{ padding: '0 0 20px' }}>
                Only {results.length} studio{results.length === 1 ? '' : 's'} here so far.
                The <Link to="/photographers" data-mj-link>full directory</Link> has more.
              </p>
            )}
            <div className="brw-grid">
              {results.map((p) => {
                const img = p.cover_image || p.hero_image || p.avatar_url;
                return (
                  <Link key={p.id || p.slug} to={`/photographer/${p.slug || p.id}`} className="brw-card">
                    <span className="brw-thumb" style={{ background: 'linear-gradient(135deg,#ede9fe,#a78bfa)' }}>
                      {img && <img src={resolveMediaUrl(img)} alt="" loading="lazy" />}
                    </span>
                    <span className="brw-card-body">
                      <span className="brw-card-name">{p.name || p.studio_name}</span>
                      <span className="brw-card-desc">
                        {[p.city, p.speciality || p.service].filter(Boolean).join(' · ')}
                      </span>
                      {p.tagline && <span className="brw-card-desc">{String(p.tagline).slice(0, 100)}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
          </>
        ))}

        {Array.isArray(data?.related) && data.related.length > 0 && (
          <section style={{ marginTop: 44 }}>
            <h2 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 500, fontSize: 19, margin: '0 0 14px' }}>
              Nearby and related
            </h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {data.related.map((r) => (
                <Link
                  key={r.path || r.slug}
                  to={r.path || `/photographers/${r.slug}`}
                  className="brw-btn brw-btn--ghost"
                  style={{ minHeight: 40, padding: '0 15px', fontSize: 12.5 }}
                >
                  {r.label || pretty(r.slug)}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function pretty(seg) {
  if (!seg) return '';
  return String(seg).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
