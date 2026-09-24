import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import axios from 'axios';
import { Camera, MapPin, Crown, Star, ChevronRight, ArrowRight } from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const SITE = 'https://majainvites.com';

/**
 * PhotographerDiscoveryPage — the SEO landing pages behind the pretty URLs:
 *   /photographers/wedding            (category)
 *   /photographers/guntur             (location)
 *   /photographers/guntur/wedding     (combined)
 *
 * It is deliberately a lean, crawler-friendly page (real <a> links to portfolios
 * by slug, server-provided SEO + CollectionPage/ItemList JSON-LD) rather than a
 * clone of the modal-heavy full directory card. The full filterable directory
 * still lives at /photographers; these pages funnel high-intent search traffic
 * ("wedding photographers in Guntur") into individual portfolios.
 *
 * Data + SEO come from GET /api/public/discovery/{a}[/{b}] — the SAME resolver +
 * threshold the sitemap uses, so a page that is `noindex` here is also absent
 * from the sitemap. A 404 from the resolver → a friendly not-found that points
 * back at the directory (never a thin/empty indexable page).
 */
export default function PhotographerDiscoveryPage() {
  const { a, b } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ok | notfound | error

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      try {
        const path = b ? `${encodeURIComponent(a)}/${encodeURIComponent(b)}` : encodeURIComponent(a);
        const res = await axios.get(`${API_URL}/api/public/discovery/${path}`);
        if (!cancelled) { setData(res.data); setStatus('ok'); }
      } catch (e) {
        if (!cancelled) setStatus(e?.response?.status === 404 ? 'notfound' : 'error');
      }
    })();
    return () => { cancelled = true; };
  }, [a, b]);

  const seo = data?.seo;
  const photographers = data?.photographers || [];
  const resolved = data?.resolved || {};
  const real = photographers.filter((p) => !p.is_demo);

  return (
    <div className="luxe luxe-grain luxe-vignette min-h-screen" data-testid="discovery-page">
      {seo && (
        <Helmet>
          <title>{seo.title}</title>
          <meta name="description" content={seo.description} />
          {seo.canonical && <link rel="canonical" href={seo.canonical} />}
          {/* Owner-approved thin-page guard: pages below the threshold render but
              are kept out of the index (and out of the sitemap server-side). */}
          {!data.indexable && <meta name="robots" content="noindex, follow" />}
          <meta property="og:type" content={seo.og_type || 'website'} />
          <meta property="og:title" content={seo.title} />
          <meta property="og:description" content={seo.description} />
          {seo.canonical && <meta property="og:url" content={seo.canonical} />}
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:title" content={seo.title} />
          <meta name="twitter:description" content={seo.description} />
          {data.json_ld && (
            <script type="application/ld+json">{JSON.stringify(data.json_ld)}</script>
          )}
        </Helmet>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-10 py-10 md:py-14">
        {/* Breadcrumb — real anchors (crawlable trail) */}
        <nav className="flex items-center gap-1.5 text-[11px] tracking-[0.15em] uppercase mb-6"
          style={{ color: 'var(--lux-text-faint)' }} aria-label="Breadcrumb" data-testid="discovery-breadcrumb">
          <Link to="/" className="hover:text-gold">Home</Link>
          <ChevronRight className="w-3 h-3" />
          <Link to="/photographers" className="hover:text-gold">Photographers</Link>
          {seo?.heading && (<><ChevronRight className="w-3 h-3" /><span style={{ color: 'var(--lux-text-muted)' }}>{seo.heading}</span></>)}
        </nav>

        {status === 'loading' && (
          <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Loading…</p>
        )}

        {status === 'notfound' && (
          <div className="lux-glass p-12 text-center" data-testid="discovery-notfound">
            <Camera className="w-9 h-9 mx-auto mb-3 text-gold" />
            <h1 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>Page not found</h1>
            <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
              We don't have a photographers page for “{[a, b].filter(Boolean).join(' / ')}”.
            </p>
            <Link to="/photographers" className="lux-btn inline-flex items-center gap-2">
              Browse all photographers <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="lux-glass p-10 text-center" style={{ color: '#FFD7D7' }}>
            Something went wrong loading this page. <Link to="/photographers" className="underline">Browse all photographers</Link>.
          </div>
        )}

        {status === 'ok' && seo && (
          <>
            <header className="mb-8">
              <span className="lux-eyebrow block mb-3">◆ Photographers</span>
              <h1 className="font-display text-[2.2rem] md:text-[3rem] leading-[1.05]" style={{ color: 'var(--lux-text)' }}>
                {seo.heading}
              </h1>
              <p className="mt-4 max-w-2xl text-[0.98rem]" style={{ color: 'var(--lux-text-muted)' }}>
                {seo.description}
              </p>
            </header>

            {real.length === 0 ? (
              <div className="lux-glass p-10 text-center" data-testid="discovery-empty">
                <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                  No photographers listed here yet.
                </p>
                <Link to="/photographers" className="lux-btn lux-btn-ghost mt-4 inline-flex items-center gap-2">
                  Browse all photographers <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="discovery-list">
                {real.map((p) => {
                  const slug = p.slug || p.id;
                  const href = `/photographer/${slug}/portfolio`;
                  return (
                    <a key={slug} href={href} className="lux-glass p-5 relative h-full block hover:opacity-95 transition-opacity"
                      data-testid={`discovery-card-${slug}`}
                      style={p.tier === 'premium'
                        ? { border: '1px solid rgba(212,175,55,0.55)', boxShadow: '0 0 0 1px rgba(212,175,55,0.14), 0 14px 44px -14px rgba(212,175,55,0.4)' }
                        : {}}>
                      {p.tier === 'premium' && (
                        <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold tracking-[0.15em] px-2 py-0.5 rounded-full"
                          style={{ background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06' }}>
                          <Crown className="w-2.5 h-2.5" /> PREMIUM
                        </span>
                      )}
                      <div className="font-display text-xl pr-16 truncate" style={{ color: 'var(--lux-text)' }}>{p.name}</div>
                      {p.service_cities?.length > 0 && (
                        <div className="text-[11px] tracking-wide capitalize inline-flex items-center gap-1 mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                          <MapPin className="w-3 h-3 text-gold" /> {p.service_cities.slice(0, 3).join(' · ')}
                        </div>
                      )}
                      {p.portfolio_images?.length > 0 && (
                        <div className="grid grid-cols-3 gap-1.5 my-3">
                          {p.portfolio_images.slice(0, 3).map((src, i) => (
                            <img key={i} src={src} alt={`${p.name} work ${i + 1}`} loading="lazy" className="w-full h-20 object-cover rounded" />
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        {typeof p.starting_price === 'number' ? (
                          <span className="text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>
                            Starts ₹{p.starting_price.toLocaleString('en-IN')}
                          </span>
                        ) : <span />}
                        {p.rating ? (
                          <span className="inline-flex items-center gap-1 text-[12px]" style={{ color: 'var(--lux-text)' }}>
                            <Star className="w-3.5 h-3.5" style={{ color: '#D4AF37', fill: '#D4AF37' }} />
                            {p.rating} {p.review_count ? `(${p.review_count})` : ''}
                          </span>
                        ) : null}
                      </div>
                      <span className="mt-3 inline-flex items-center gap-1 text-[11px] tracking-[0.2em] uppercase" style={{ color: '#D4AF37' }}>
                        View portfolio <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </a>
                  );
                })}
              </div>
            )}

            {/* Related discovery links (crawlable). Combined pages link up to their
                parent city + service; single pages point back to the directory. */}
            <div className="mt-10 flex flex-wrap gap-3" data-testid="discovery-related">
              {resolved.kind === 'combined' && resolved.city && (
                <Link to={`/photographers/${resolved.city}`} className="lux-btn lux-btn-ghost text-xs">
                  All photographers in {seo.heading.split(' in ').pop()}
                </Link>
              )}
              {resolved.kind === 'combined' && resolved.service && (
                <Link to={`/photographers/${resolved.service}`} className="lux-btn lux-btn-ghost text-xs capitalize">
                  {resolved.service} photographers everywhere
                </Link>
              )}
              <Link to="/photographers" className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5">
                Browse the full directory <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
