import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '@/components/nav/MarketingNav';
import * as publicPortfolio from '@/api/publicPortfolio';
import * as catalog from '@/api/publicCatalog';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import './PhotographerDirectory.css';
import useSeo from '@/lib/useSeo';

// Ported from "MAJA Photographer Directory.dc.html" — the public, filterable
// listing at backend/photographer_directory.py (GET /api/public/photographers).
// Filtering/sorting happens server-side (query_directory already implements
// city/skill/budget matching + facets) — no client-side taxonomy re-implementation.
// ponytail: skipped the legacy account-gate modal + review-submission flow —
// this route's contract is browse + filter + link to portfolio only.
const BUDGET_BANDS = [
  { label: 'Any budget', min: 0, max: 0 },
  { label: 'Under ₹50,000', min: 0, max: 50000 },
  { label: '₹50,000–₹1,00,000', min: 50000, max: 100000 },
  { label: '₹1,00,000–₹2,50,000', min: 100000, max: 250000 },
  { label: '₹2,50,000+', min: 250000, max: 0 },
];

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function PhotographerDirectory() {
  useSeo({ title: 'Wedding photographers', description: 'Browse wedding photographers and studios using MAJA Invites, by city and speciality.' });
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [skill, setSkill] = useState('');
  const [budgetIdx, setBudgetIdx] = useState(0);
  const [state, setState] = useState({ status: 'loading', photographers: [] });
  // Dropdown OPTIONS come from one unfiltered call, fetched once. The backend's
  // `facets` on the filtered endpoint are computed from the post-filter result
  // set (query_directory builds them from `out`, after filters run) — reusing
  // that on every keystroke would shrink other dropdowns' options as you filter,
  // and empty them entirely on a zero-result combo. Legacy avoided this the same
  // way: options are computed from the full list, never the filtered one.
  const [facets, setFacets] = useState({});

  // Live platform counters. GET /api/public/photographer-stats has served
  // these since it was written and had no reader, so the directory could not
  // say how many studios were actually on it.
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let live = true;
    catalog.photographerStats()
      .then(({ data }) => { if (live) setStats(data); })
      .catch(() => { if (live) setStats(null); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    publicPortfolio.directory().then(({ data }) => { if (!cancelled) setFacets(data?.facets || {}); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Debounced server-side query — filters are cheap params on an already
  // server-filtered endpoint, so there's no client-side list to re-derive.
  useEffect(() => {
    let cancelled = false;
    const band = BUDGET_BANDS[budgetIdx];
    const t = setTimeout(() => {
      setState((s) => ({ ...s, status: 'loading' }));
      publicPortfolio.directory({
        q: q.trim(), city, skill,
        min_budget: band.min || 0, max_budget: band.max || 0,
      }).then(({ data }) => {
        if (cancelled) return;
        setState({ status: 'ready', photographers: data?.photographers || [] });
      }).catch(() => { if (!cancelled) setState((s) => ({ ...s, status: 'error' })); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, city, skill, budgetIdx]);

  const { status, photographers } = state;
  const filtersActive = q || city || skill || budgetIdx !== 0;
  const resetFilters = () => { setQ(''); setCity(''); setSkill(''); setBudgetIdx(0); };

  return (
    <div className="mjd-page">
      <MarketingNav />

      <div className="mjd-body">
        <header className="px-aurora mjd-hero">
          <span aria-hidden="true" className="px-petal" style={{ left: '9%', animationDelay: '-2s' }} />
          <span aria-hidden="true" className="px-petal" style={{ left: '34%', width: 10, height: 14, opacity: .4, animationDuration: '18s', animationDelay: '-9s' }} />
          <span aria-hidden="true" className="px-petal" style={{ left: '66%', width: 14, height: 18, opacity: .5, animationDuration: '12s', animationDelay: '-5s' }} />
          <span aria-hidden="true" className="px-petal" style={{ left: '90%', animationDuration: '16s', animationDelay: '-11s' }} />
          <div className="mjd-hero-inner">
            <p className="mjd-eyebrow">Photographer directory</p>
            <h1 className="mjd-h1">Wedding photographers, <span className="mjd-accent">searchable by what they actually shoot.</span></h1>
            <p className="mjd-sub">Filter by city, style and budget. Every studio here holds an active MAJA portfolio plan.</p>
            {/* Only rendered when the server returned a real count — a
                directory that claims "0 studios" to a visitor is worse than
                one that says nothing. */}
            {stats && stats.photographers_total > 0 && (
              <p className="mjd-stats">
                <strong>{stats.photographers_total.toLocaleString('en-IN')}</strong> studios
                {stats.published_total > 0 && (
                  <> · <strong>{stats.published_total.toLocaleString('en-IN')}</strong> invitations published</>
                )}
              </p>
            )}
          </div>
        </header>

        <div className="mjd-filters">
          <input
            className="mjd-search"
            placeholder="Search photographers, studios, services, location…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-mj-field
          />
          <select className="mjd-select" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
            <option value="">All cities</option>
            {(facets.cities || []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="mjd-select" value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Photography style">
            <option value="">All styles</option>
            {(facets.skills || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="mjd-select" value={budgetIdx} onChange={(e) => setBudgetIdx(Number(e.target.value))} aria-label="Budget">
            {BUDGET_BANDS.map((b, i) => <option key={b.label} value={i}>{b.label}</option>)}
          </select>
          {filtersActive && <button className="mjd-reset" onClick={resetFilters}>Reset</button>}
        </div>

        <p className="mjd-count">
          {status === 'loading' ? 'Searching…' : `${photographers.length} ${photographers.length === 1 ? 'photographer' : 'photographers'}`}
        </p>

        {status === 'error' && <p className="mjd-state mjd-state-error">Couldn&rsquo;t load the directory right now. Please refresh.</p>}

        {status === 'ready' && photographers.length === 0 && (
          <div className="mjd-empty">
            <p>{filtersActive ? 'No photographers match these filters.' : 'No photographers listed yet.'}</p>
            {filtersActive && <button className="mjd-reset" onClick={resetFilters}>Clear filters</button>}
          </div>
        )}

        <div data-mj-stagger className="mjd-grid">
          {photographers.map((p) => {
            const avatar = p.portfolio_images?.[0];
            return (
              <Link data-reveal="blur" key={p.id} to={`/photographer/${p.slug || p.id}`} className="mjd-card">
                <div className="mjd-card-media">
                  {avatar ? <img src={resolveMediaUrl(avatar)} alt="" loading="lazy" /> : <span className="mjd-card-initial">{(p.name || '?').charAt(0)}</span>}
                  {p.tier === 'premium' && <span className="mjd-tag mjd-tag-premium">Premium</span>}
                  {p.available_now && <span className="mjd-tag mjd-tag-avail">Available now</span>}
                </div>
                <div className="mjd-card-body">
                  <h3>{p.name}</h3>
                  {p.city && <p className="mjd-card-city">{p.city}</p>}
                  {(p.styles || []).length > 0 && (
                    <div className="mjd-card-tags">
                      {p.styles.slice(0, 3).map((s) => <span key={s}>{s}</span>)}
                    </div>
                  )}
                  <div className="mjd-card-meta">
                    {typeof p.rating === 'number' && <span>★ {p.rating.toFixed(1)}{p.review_count ? ` · ${p.review_count}` : ''}</span>}
                    {typeof p.starting_price === 'number' && <span>From {inr(p.starting_price)}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <footer className="mjd-footer">
        <p>&copy; 2026 MAJA Invites</p>
      </footer>
    </div>
  );
}
