import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Camera, MapPin, Circle, Star, Quote, X, Send, MessageSquarePlus, Play, Clapperboard, SlidersHorizontal, IndianRupee, Crown, BadgeCheck, Search } from 'lucide-react';
import PublicChrome from '@/components/PublicChrome';
import TiltCard from '@/motion/TiltCard';
import {
  PHOTOGRAPHY_TYPES, SERVICE_OPTIONS, EXPERIENCE_BANDS, BUDGET_BANDS,
  taxonMatches, mergeTaxonOptions,
  AVAILABILITY_OPTIONS, PORTFOLIO_TYPE_OPTIONS, RATING_BANDS,
} from '@/data/photographyOptions';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/** Star rating row (0–5). Renders nothing if no numeric rating is provided. */
function Stars({ value = 0, count }) {
  if (typeof value !== 'number' || value <= 0) return null;
  const full = Math.round(value);
  return (
    <div className="inline-flex items-center gap-1" data-testid="ph-rating">
      <span className="inline-flex">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="w-3.5 h-3.5"
            style={{ color: '#D4AF37', fill: i < full ? '#D4AF37' : 'transparent' }} />
        ))}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
        {value.toFixed(1)}{count ? ` · ${count} reviews` : ''}
      </span>
    </div>
  );
}

/** Modal for a past client to leave feedback for a photographer. */
function ReviewModal({ photographer, onClose, onDone }) {
  const [author, setAuthor] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (text.trim().length < 3) { setErr('Please write a few words.'); return; }
    setBusy(true); setErr('');
    try {
      await axios.post(`${API_URL}/api/public/photographers/${photographer.id}/reviews`, {
        author: author.trim(), rating, text: text.trim(),
      });
      onDone();
    } catch (_e) {
      setErr('Could not submit right now. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4"
      style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(4px)' }}
      onClick={onClose} data-testid="review-modal-backdrop">
      <div className="w-full max-w-md rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: '#16110C', border: '1px solid var(--lux-border-strong)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}
        role="dialog" aria-modal="true" data-testid="review-modal">
        <header className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--lux-border)' }}>
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase text-gold">Leave feedback</div>
            <div className="font-display text-lg" style={{ color: '#FFF8DC' }}>{photographer.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: 'rgba(212,175,55,0.14)', color: '#FFF8DC' }}>
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5 space-y-4">
          {/* star picker */}
          <div>
            <div className="text-[11px] tracking-wide uppercase mb-2" style={{ color: 'rgba(255,248,220,0.7)' }}>Your rating</div>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} star`} data-testid={`review-star-${n}`}>
                  <Star className="w-7 h-7 transition-transform active:scale-90"
                    style={{ color: '#D4AF37', fill: n <= rating ? '#D4AF37' : 'transparent' }} />
                </button>
              ))}
            </div>
          </div>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name (optional)"
            className="w-full px-3 py-2.5 rounded-md text-sm outline-none" data-testid="review-author"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#FFF8DC', border: '1px solid var(--lux-border)' }} />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder="How was your experience with this photographer?"
            className="w-full px-3 py-2.5 rounded-md text-sm outline-none" data-testid="review-text"
            style={{ background: 'rgba(255,255,255,0.04)', color: '#FFF8DC', border: '1px solid var(--lux-border)', resize: 'vertical' }} />
          {err && <div className="text-[12px]" style={{ color: '#e0816f' }} data-testid="review-error">{err}</div>}
          <button onClick={submit} disabled={busy} className="lux-btn w-full justify-center" data-testid="review-submit">
            {busy ? 'Submitting…' : <>Submit feedback <Send className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lightbox player for a portfolio sample film. */
function VideoModal({ video, onClose }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4"
      style={{ background: 'rgba(0,0,0,0.74)', backdropFilter: 'blur(4px)' }}
      onClick={onClose} data-testid="video-modal-backdrop">
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ background: '#000', border: '1px solid var(--lux-border-strong)' }} data-testid="video-modal">
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#16110C' }}>
          <div className="text-[12px] tracking-wide inline-flex items-center gap-2" style={{ color: '#FFF8DC' }}>
            <Clapperboard className="w-4 h-4 text-gold" /> {video.label || 'Sample film'}
            {video.event && <span className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'rgba(255,248,220,0.55)' }}>· {video.event}</span>}
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full grid place-items-center"
            style={{ background: 'rgba(212,175,55,0.14)', color: '#FFF8DC' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <video controls autoPlay playsInline poster={video.poster}
          className="w-full" style={{ display: 'block', background: '#000', aspectRatio: '16 / 9' }} data-testid="video-player">
          <source src={video.url} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}

/**
 * Public photographer portfolio — MAJA as the bridge between couples and the
 * studios who shoot their day. Browse subscribed photographers by city, see who
 * is available now, view their portfolio and read past-client feedback.
 */
export default function PhotographersPage() {
  const navigate = useNavigate();
  const [allList, setAllList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewFor, setReviewFor] = useState(null); // photographer being reviewed
  const [thanks, setThanks] = useState(false);
  const [videoFor, setVideoFor] = useState(null); // sample film being played
  // filters (applied client-side over the full list). Options come from the
  // shared canonical taxonomy so every dropdown is complete + matches what
  // photographers actually select in their panel.
  const [city, setCity] = useState('');
  const [minRating, setMinRating] = useState(0);      // rating band min
  const [budgetIdx, setBudgetIdx] = useState(-1);     // index into BUDGET_BANDS, -1 = any
  const [availOnly, setAvailOnly] = useState(false);  // real-time "available now" toggle
  const [availStatus, setAvailStatus] = useState(''); // Available / Limited Slots / Fully Booked
  const [portfolioType, setPortfolioType] = useState(''); // studio / individual
  const [premiumF, setPremiumF] = useState('');       // '' | premium | verified
  const [sortBy, setSortBy] = useState('featured');
  const [q, setQ] = useState('');
  const [countryF, setCountryF] = useState('');
  const [stateF, setStateF] = useState('');
  const [categoryF, setCategoryF] = useState('');     // service
  const [skillF, setSkillF] = useState('');           // photography type
  const [expIdx, setExpIdx] = useState(-1);           // index into EXPERIENCE_BANDS, -1 = any
  // Account gate: anyone may BROWSE the directory (discovery + SEO), but filtering
  // or searching for a photographer needs an account, so a real person is behind
  // the enquiry the studio receives.
  const [needAccount, setNeedAccount] = useState(false);
  const signedIn = (() => {
    try {
      return !!localStorage.getItem('admin_token') || document.cookie.includes('user_session_token');
    } catch (_) { return false; }
  })();
  const guardFilters = (e) => {
    if (signedIn) return;
    e.preventDefault(); e.stopPropagation();
    setNeedAccount(true);
  };
  const guardSearch = (e) => {
    if (signedIn) return;
    e.target.blur();
    setNeedAccount(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_URL}/api/public/photographers`);
      setAllList(data?.photographers || []);
    } catch (_e) { setAllList([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // distinct cities for the dropdown
  const cities = useMemo(() => {
    const s = new Set();
    allList.forEach((p) => (p.service_cities || []).forEach((c) => c && s.add(c)));
    return Array.from(s).sort();
  }, [allList]);
  const countries = useMemo(() => Array.from(new Set(allList.map((p) => p.country).filter(Boolean))).sort(), [allList]);
  const states = useMemo(() => Array.from(new Set(allList.map((p) => p.state).filter(Boolean))).sort(), [allList]);

  // Offer the canonical taxonomy PLUS whatever photographers have really saved.
  // Live data holds services like "Reception Coverage" that are not in the canonical
  // list at all — without this they exist in profiles but are unselectable, so that
  // inventory is invisible to couples.
  const serviceOptions = useMemo(
    () => mergeTaxonOptions(SERVICE_OPTIONS, allList.flatMap((p) => p.services || [])),
    [allList],
  );
  const skillOptions = useMemo(
    () => mergeTaxonOptions(PHOTOGRAPHY_TYPES, allList.flatMap((p) => p.styles || [])),
    [allList],
  );

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const expB = expIdx >= 0 ? EXPERIENCE_BANDS[expIdx] : null;
    const budB = budgetIdx >= 0 ? BUDGET_BANDS[budgetIdx] : null;
    let out = allList.filter((p) => {
      if (city && !(p.service_cities || []).includes(city)) return false;
      if (countryF && (p.country || '').toLowerCase() !== countryF.toLowerCase()) return false;
      if (stateF && (p.state || '').toLowerCase() !== stateF.toLowerCase()) return false;
      // Match on MEANING, not spelling: profiles store "Candid" while the dropdown
      // offers "Candid Photography". Exact equality here returned an empty page for
      // every category search — see taxonMatches() for the rules.
      if (categoryF && !(p.services || []).some((s) => taxonMatches(s, categoryF))) return false;
      if (skillF && !(p.styles || []).some((s) => taxonMatches(s, skillF))) return false;
      if (expB) { const y = p.experience_years || 0; if (y < expB.min || y > expB.max) return false; }
      if (portfolioType && (p.portfolio_type || 'studio') !== portfolioType) return false;
      if (availStatus && (p.availability_status || 'Available') !== availStatus) return false;
      if (premiumF === 'premium' && p.tier !== 'premium') return false;
      if (premiumF === 'verified' && !(p.verified_level > 0)) return false;
      if (availOnly && !p.available_now) return false;
      if (minRating && !(typeof p.rating === 'number' && p.rating >= minRating)) return false;
      if (budB) {
        // Only price-known studios can match a budget band (unknown price is
        // excluded when a band is chosen, so "Budget Friendly" means what it says).
        const price = typeof p.starting_price === 'number' ? p.starting_price : null;
        if (price === null || price < budB.min || price >= budB.max) return false;
      }
      if (ql) {
        const hay = [p.name, p.studio_name, (p.service_cities || []).join(' '), (p.services || []).join(' '), (p.styles || []).join(' '), p.state].join(' ').toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
    if (sortBy === 'rating') out = [...out].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sortBy === 'experience') out = [...out].sort((a, b) => (b.experience_years || 0) - (a.experience_years || 0));
    else if (sortBy === 'price_low') out = [...out].sort((a, b) => (a.starting_price || Infinity) - (b.starting_price || Infinity));
    else if (sortBy === 'price_high') out = [...out].sort((a, b) => (b.starting_price || 0) - (a.starting_price || 0));
    return out; // 'featured' keeps backend order (premium/verified/available first)
  }, [allList, city, countryF, stateF, categoryF, skillF, expIdx, portfolioType, availStatus, premiumF, availOnly, minRating, budgetIdx, sortBy, q]);

  const filtersActive = city || countryF || stateF || categoryF || skillF || expIdx >= 0 || portfolioType || availStatus || premiumF || minRating || budgetIdx >= 0 || availOnly || q || sortBy !== 'featured';
  const resetFilters = () => { setCity(''); setCountryF(''); setStateF(''); setCategoryF(''); setSkillF(''); setExpIdx(-1); setPortfolioType(''); setAvailStatus(''); setPremiumF(''); setMinRating(0); setBudgetIdx(-1); setAvailOnly(false); setSortBy('featured'); setQ(''); };

  return (
    <PublicChrome
      title="Photographers Portfolio — MAJA"
      description="The portfolios of MAJA's subscribed wedding photographers — browse by city, see who is available now, view their work and read past-client feedback."
    >
      <section className="px-6 md:px-16 py-16 max-w-6xl mx-auto">
        <span className="lux-eyebrow block mb-4">◆ Photographers Portfolio</span>
        <h1 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-3" style={{ color: 'var(--lux-text)' }}>
          Studios who get <span className="font-script italic text-gold">your day.</span>
        </h1>
        <p className="text-sm md:text-base max-w-2xl mb-8" style={{ color: 'var(--lux-text-muted)' }}>
          MAJA is the bridge between you and the studio. Browse our subscribed photographers' portfolios,
          read <span className="text-gold">past-client feedback</span>, and see who's available right now to shoot your wedding.
        </p>

        {/* filters */}
        <style>{`
          .ph-select { background: rgba(255,255,255,0.04); color: var(--lux-text); border: 1px solid var(--lux-border);
            border-radius: 999px; padding: 0.5rem 0.9rem; font-size: 0.8rem; outline: none; cursor: pointer; }
          .ph-select option { background: #16110C; color: #FFF8DC; }
        `}</style>
        {/* search */}
        <div className="relative mb-3 max-w-xl" data-testid="ph-search-wrap">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lux-text-faint)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={guardSearch}
            placeholder="Search photographers, studios, services, location…"
            data-testid="ph-search" className="w-full pl-9 pr-3 py-2.5 rounded-full text-sm outline-none"
            style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
        </div>
        {!signedIn && (
          <p className="mb-3 text-[12px]" style={{ color: 'var(--lux-text-faint)' }} data-testid="ph-gate-hint">
            Browsing is open to everyone — <span className="text-gold">create a free account</span> to filter by
            service, style, city or budget and to contact a studio.
          </p>
        )}
        {/* Filtering is the "find me a photographer for X" action — owner's call that
            it needs an account. Click-capture keeps ONE guard for the whole row
            instead of wrapping a dozen individual handlers. */}
        <div className="flex flex-wrap items-center gap-3 mb-4" data-testid="ph-filters"
          onClickCapture={guardFilters}>
          <span className="inline-flex items-center gap-1.5 text-[11px] tracking-wide uppercase" style={{ color: 'var(--lux-text-faint)' }}>
            <SlidersHorizontal className="w-3.5 h-3.5 text-gold" /> Filter
          </span>
          {countries.length > 1 && (
            <select value={countryF} onChange={(e) => setCountryF(e.target.value)} className="ph-select capitalize" data-testid="ph-country" aria-label="Country">
              <option value="">All countries</option>
              {countries.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </select>
          )}
          {states.length > 0 && (
            <select value={stateF} onChange={(e) => setStateF(e.target.value)} className="ph-select capitalize" data-testid="ph-state" aria-label="State">
              <option value="">All states</option>
              {states.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          )}
          <select value={city} onChange={(e) => setCity(e.target.value)} className="ph-select capitalize" data-testid="ph-city" aria-label="City">
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
          <select value={categoryF} onChange={(e) => setCategoryF(e.target.value)} className="ph-select" data-testid="ph-category" aria-label="Services offered">
            <option value="">All services</option>
            {serviceOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={skillF} onChange={(e) => setSkillF(e.target.value)} className="ph-select" data-testid="ph-skill" aria-label="Photography type">
            <option value="">All skills</option>
            {skillOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={expIdx} onChange={(e) => setExpIdx(Number(e.target.value))} className="ph-select" data-testid="ph-experience" aria-label="Experience">
            <option value={-1}>Any experience</option>
            {EXPERIENCE_BANDS.map((b, i) => <option key={b.label} value={i}>{b.label}</option>)}
          </select>
          <select value={portfolioType} onChange={(e) => setPortfolioType(e.target.value)} className="ph-select" data-testid="ph-portfolio-type" aria-label="Portfolio type">
            <option value="">Studio &amp; Freelance</option>
            {PORTFOLIO_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="ph-select" data-testid="ph-rating" aria-label="Minimum rating">
            <option value={0}>Any rating</option>
            {RATING_BANDS.map((b) => <option key={b.label} value={b.min}>{b.label}</option>)}
          </select>
          <select value={budgetIdx} onChange={(e) => setBudgetIdx(Number(e.target.value))} className="ph-select" data-testid="ph-budget" aria-label="Budget">
            <option value={-1}>Any budget</option>
            {BUDGET_BANDS.map((b, i) => <option key={b.label} value={i}>{b.label}</option>)}
          </select>
          <select value={availStatus} onChange={(e) => setAvailStatus(e.target.value)} className="ph-select" data-testid="ph-availability" aria-label="Availability">
            <option value="">Any availability</option>
            {AVAILABILITY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={premiumF} onChange={(e) => setPremiumF(e.target.value)} className="ph-select" data-testid="ph-premium" aria-label="Premium filters">
            <option value="">All photographers</option>
            <option value="premium">Premium Portfolio</option>
            <option value="verified">Verified Photographer</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ph-select" data-testid="ph-sort" aria-label="Sort by">
            <option value="featured">Sort: Featured</option>
            <option value="rating">Sort: Top rated</option>
            <option value="experience">Sort: Most experienced</option>
            <option value="price_low">Sort: Price low → high</option>
            <option value="price_high">Sort: Price high → low</option>
          </select>
          <button onClick={() => setAvailOnly((v) => !v)} data-testid="ph-available-toggle"
            className="px-4 py-2 rounded-full text-xs inline-flex items-center gap-2 transition-all"
            style={{ border: `1px solid ${availOnly ? 'var(--lux-gold)' : 'var(--lux-border)'}`, background: availOnly ? 'rgba(212,175,55,0.12)' : 'transparent', color: 'var(--lux-text)' }}>
            <Circle className="w-2.5 h-2.5" style={{ color: '#43d17a', fill: '#43d17a' }} /> Available now
          </button>
          {filtersActive && (
            <button onClick={resetFilters} className="text-[11px] underline" style={{ color: 'var(--lux-text-muted)' }} data-testid="ph-reset">Reset</button>
          )}
        </div>
        <div className="text-[12px] mb-8" style={{ color: 'var(--lux-text-faint)' }} data-testid="ph-result-count">
          {loading ? '' : `${filtered.length} ${filtered.length === 1 ? 'studio' : 'studios'}`}
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="lux-glass p-12 text-center">
            <Camera className="w-9 h-9 mx-auto mb-3 text-gold" />
            <p className="text-sm" style={{ color: 'var(--lux-text)' }}>
              {filtersActive ? 'No photographers match these filters.' : 'No photographers listed yet.'}
            </p>
            {filtersActive && (
              <button onClick={resetFilters} className="lux-btn lux-btn-ghost mt-4" data-testid="ph-empty-reset">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="ph-list">
            {/* ponytail: tilt is cheap here only because this list is short.
                The API returns up to 5000 studios and this grid renders every
                match with no pagination, so the per-card spring rig scales
                linearly with studio count — profiling /designs (180 cards)
                showed tilt costing 5.3x ScriptDuration. If the directory ever
                grows past a screenful or two, paginate/virtualise this list
                first, or drop TiltCard here. */}
            {filtered.map((p) => (
              <TiltCard key={p.id} className="block w-full h-full">
              <div className="lux-glass p-5 relative h-full" data-testid={`ph-card-${p.id}`}
                style={p.tier === 'premium'
                  ? { border: '1px solid rgba(212,175,55,0.55)', boxShadow: '0 0 0 1px rgba(212,175,55,0.14), 0 14px 44px -14px rgba(212,175,55,0.4)' }
                  : {}}>
                {p.tier === 'premium' && (
                  <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-bold tracking-[0.15em] px-2 py-0.5 rounded-full"
                    style={{ background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06' }} data-testid={`ph-premium-${p.id}`}>
                    <Crown className="w-2.5 h-2.5" /> PREMIUM
                  </span>
                )}
                <div className="flex items-center justify-between mb-3 pr-20">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* Real anchor (by slug) → crawlable directory→portfolio link
                        for SEO, while still doing SPA client-side navigation. */}
                    <Link to={`/photographer/${p.slug || p.id}/portfolio`}
                      className="font-display text-xl text-left hover:text-gold transition-colors truncate"
                      style={{ color: 'var(--lux-text)' }} data-testid={`ph-open-portfolio-${p.id}`}>{p.name}</Link>
                    {p.verified_level > 0 && (() => {
                      const vc = { 1: '#4FA3FF', 2: '#3ECf8E', 3: '#E8C97A', 4: '#C08CFF' };
                      const vl = { 1: 'Verified Photographer', 2: 'Verified Studio', 3: 'Premium Studio', 4: 'Elite Pixora Professional' };
                      return <BadgeCheck className="w-4 h-4 shrink-0" style={{ color: vc[p.verified_level] }} title={vl[p.verified_level]} data-testid={`ph-verified-${p.id}`} />;
                    })()}
                  </div>
                  {p.available_now && (
                    <span className="text-[10px] tracking-wider uppercase inline-flex items-center gap-1 px-2 py-1 rounded-full"
                      style={{ background: 'rgba(67,209,122,0.14)', color: '#7fe0a3' }}>
                      <Circle className="w-2 h-2" style={{ fill: '#43d17a', color: '#43d17a' }} /> Available
                    </span>
                  )}
                </div>
                {typeof p.starting_price === 'number' && (
                  <div className="inline-flex items-center gap-1 text-[12px] mb-3 px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}>
                    <IndianRupee className="w-3 h-3 text-gold" /> Starts ₹{p.starting_price.toLocaleString('en-IN')}
                  </div>
                )}
                {p.portfolio_images?.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    {p.portfolio_images.slice(0, 3).map((src, i) => (
                      <img key={i} src={src} alt="" loading="lazy" className="w-full h-20 object-cover rounded" />
                    ))}
                  </div>
                )}
                {p.portfolio_videos?.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[10px] tracking-[0.2em] uppercase mb-1.5 inline-flex items-center gap-1.5" style={{ color: 'var(--lux-text-muted)' }}>
                      <Clapperboard className="w-3 h-3 text-gold" /> Sample films
                    </div>
                    <div className="flex gap-2">
                      {p.portfolio_videos.slice(0, 3).map((v, i) => (
                        <button key={i} onClick={() => setVideoFor(v)} title={v.label}
                          data-testid={`ph-video-${p.id}-${i}`}
                          className="relative flex-1 rounded overflow-hidden" style={{ height: 56 }}>
                          <img src={v.poster} alt={v.label || ''} loading="lazy" className="w-full h-full object-cover" />
                          <span className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(0,0,0,0.35)' }}>
                            <Play className="w-5 h-5" style={{ color: '#fff', fill: '#fff' }} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {p.bio && <p className="text-xs mb-2" style={{ color: 'var(--lux-text-muted)' }}>{p.bio}</p>}
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  {p.service_cities?.length > 0 && (
                    <div className="text-[11px] tracking-wide capitalize inline-flex items-center gap-1" style={{ color: 'var(--lux-text-muted)' }}>
                      <MapPin className="w-3 h-3 text-gold" /> {p.service_cities.join(' · ')}
                    </div>
                  )}
                  <Stars value={p.rating} count={p.review_count} />
                </div>

                {/* Past-client feedback — bridge between couples & studios.
                    Renders real reviews when the API provides them; otherwise a
                    tasteful placeholder until the feedback feature ships. */}
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--lux-border)' }}>
                  {Array.isArray(p.reviews) && p.reviews.length > 0 ? (
                    <div className="space-y-2.5" data-testid={`ph-reviews-${p.id}`}>
                      {p.reviews.slice(0, 2).map((r, i) => (
                        <div key={i} className="flex gap-2">
                          <Quote className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: '#D4AF37' }} />
                          <div>
                            <p className="text-[12px] italic leading-snug" style={{ color: 'var(--lux-text)' }}>
                              "{r.text || r.comment}"
                            </p>
                            <div className="text-[10px] tracking-[0.2em] uppercase mt-1" style={{ color: 'var(--lux-text-faint)' }}>
                              — {r.author || r.name || 'Verified client'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] inline-flex items-center gap-1.5" style={{ color: 'var(--lux-text-faint)' }}>
                      <Quote className="w-3 h-3" style={{ color: 'rgba(212,175,55,0.6)' }} /> Client reviews coming soon
                    </div>
                  )}
                </div>
                <button onClick={() => setReviewFor(p)} data-testid={`ph-leave-review-${p.id}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-[11px] tracking-[0.2em] uppercase hover:opacity-80 transition-opacity"
                  style={{ color: '#D4AF37' }}>
                  <MessageSquarePlus className="w-3.5 h-3.5" /> Leave feedback
                </button>
              </div>
              </TiltCard>
            ))}
          </div>
        )}
      </section>

      {reviewFor && (
        <ReviewModal
          photographer={reviewFor}
          onClose={() => setReviewFor(null)}
          onDone={() => { setReviewFor(null); setThanks(true); load(); setTimeout(() => setThanks(false), 3500); }}
        />
      )}
      {videoFor && <VideoModal video={videoFor} onClose={() => setVideoFor(null)} />}
      {needAccount && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" data-testid="ph-account-modal">
          <div className="absolute inset-0" style={{ background: 'rgba(6,4,2,0.75)' }} onClick={() => setNeedAccount(false)} />
          <div className="lux-glass relative w-full max-w-sm p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: 'rgba(212,175,55,0.14)' }}>
              <Search className="h-5 w-5" style={{ color: '#E8C97A' }} />
            </div>
            <div className="font-display mb-1 text-xl" style={{ color: 'var(--lux-text)' }}>Create a free account</div>
            <p className="mb-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              Sign in to filter photographers by service, style, city, experience and budget —
              and to save the studios you like.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <a href="/?signin=1&return=/photographers" className="lux-btn text-sm">Sign up / Sign in</a>
              <a href="/studio/login" className="lux-btn lux-btn-ghost text-sm">I’m a photographer</a>
            </div>
            <button onClick={() => setNeedAccount(false)} className="mt-3 text-[11px] underline"
              style={{ color: 'var(--lux-text-faint)' }}>Keep browsing without filters</button>
          </div>
        </div>
      )}
      {thanks && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] px-5 py-3 rounded-full text-sm"
          style={{ background: '#16110C', color: '#FFF8DC', border: '1px solid var(--lux-gold)' }} data-testid="review-thanks">
          ✓ Thank you — your feedback is live.
        </div>
      )}
    </PublicChrome>
  );
}
