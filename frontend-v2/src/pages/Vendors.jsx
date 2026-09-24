import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import { NAV_LINKS, LINK } from '@/lib/marketingLinks';
import useSeo from '@/lib/useSeo';
import * as catalog from '@/api/publicCatalog';
import { designImage } from '@/lib/designAssets';
import './BrowseDesigns.css';

// Vendor marketplace. Reuses the browse-funnel layout deliberately: it is the
// same interaction (filter a catalogue, open one entry), and a second visual
// language for it would be noise.
//
// Ratings come from real reviews only. If a vendor has none, the card says so
// rather than showing an empty five-star row that reads as zero.

export default function Vendors() {
  useSeo({
    title: 'Wedding vendors',
    description: 'Decorators, caterers, makeup artists and venues recommended by the photographers on MAJA Invites.',
  });

  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    catalog.vendors({ limit: 200 })
      .then(({ data }) => setRows(data?.vendors || data?.items || (Array.isArray(data) ? data : [])))
      .catch((e) => setError(e?.response?.data?.detail || 'Could not load the vendor list.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => {
    const s = new Set((rows || []).map((v) => v.category).filter(Boolean));
    return ['all', ...[...s].sort()];
  }, [rows]);

  const shown = useMemo(() => {
    let out = rows || [];
    if (cat !== 'all') out = out.filter((v) => v.category === cat);
    const needle = q.trim().toLowerCase();
    if (needle) {
      out = out.filter((v) => [v.name, v.city, v.category, v.description]
        .filter(Boolean).some((x) => String(x).toLowerCase().includes(needle)));
    }
    return out;
  }, [rows, cat, q]);

  return (
    <div className="brw-page">
      <MarketingNav links={NAV_LINKS} cta={{ label: 'Begin', to: LINK.signUp }} />

      <header className="px-aurora brw-hero">
        <div className="brw-hero-inner">
          <h1 className="brw-h1">Wedding <span className="brw-hl">vendors</span></h1>
          <p className="brw-sub">
            Decorators, caterers, makeup artists and venues that the studios on
            MAJA have actually worked with. We do not take a fee for a listing,
            and we do not rank by who paid.
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
            </div>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="brw-toolbar">
              <input
                className="brw-search"
                data-mj-field
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search vendors, cities…"
                aria-label="Search vendors"
              />
              <span className="brw-count">{shown.length} vendor{shown.length === 1 ? '' : 's'}</span>
            </div>

            {categories.length > 2 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`brw-btn ${cat === c ? 'brw-btn--primary' : 'brw-btn--ghost'}`}
                    style={{ minHeight: 40, padding: '0 15px', fontSize: 12.5, textTransform: 'capitalize' }}
                    onClick={() => setCat(c)}
                  >
                    {c === 'all' ? 'All' : String(c).replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            )}

            {(rows || []).length === 0 ? (
              <p className="brw-empty">
                No vendors are listed yet. Studios add the people they trust as
                they work with them, so this fills in over time. If you are a
                vendor, ask a studio you have worked with to add you.
              </p>
            ) : shown.length === 0 ? (
              <p className="brw-empty">Nothing matches that search.</p>
            ) : (
              <div className="brw-grid">
                {shown.map((v) => {
                  const img = designImage(v);
                  const reviews = v.review_count ?? v.reviews ?? 0;
                  return (
                    <article key={v.id || v.vendor_id} className="brw-card" style={{ cursor: 'default' }}>
                      <span className="brw-thumb" style={{ background: 'linear-gradient(135deg,#ede9fe,#a78bfa)' }}>
                        {img
                          ? <img src={img} alt="" loading="lazy" />
                          : <span className="brw-thumb-label" style={{ textTransform: 'capitalize' }}>{v.category || 'Vendor'}</span>}
                      </span>
                      <span className="brw-card-body">
                        <span className="brw-card-name">{v.name}</span>
                        <span className="brw-card-desc">
                          {[v.category, v.city].filter(Boolean).join(' · ') || 'Wedding services'}
                        </span>
                        {v.description && <span className="brw-card-desc">{String(v.description).slice(0, 120)}</span>}
                        <span className="brw-tag">
                          {reviews > 0
                            ? `${Number(v.rating || 0).toFixed(1)} from ${reviews} review${reviews === 1 ? '' : 's'}`
                            : 'No reviews yet'}
                        </span>
                      </span>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        <section className="brw-cta">
          <h2 className="brw-cta-title">Work with couples on MAJA?</h2>
          <p className="brw-cta-body">
            Vendors are added by the studios who have worked with them, which is
            the only recommendation worth anything. Ask yours to list you.
          </p>
          <div className="brw-cta-actions">
            <Link className="brw-btn brw-btn--primary" to="/photographers">Find a photographer</Link>
            <Link className="brw-btn brw-btn--ghost" to="/support">Ask us about listing</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
