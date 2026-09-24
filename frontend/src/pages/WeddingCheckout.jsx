/**
 * WeddingCheckout.jsx — unified pricing 5-step checkout.
 * Route: /checkout  (used only when `new_pricing_enabled` is ON; the legacy cart
 * remains the default until cutover).
 *
 * Steps: Design → Feature Pack → Link Duration → Coupon/Campaign → Checkout.
 * All prices come from the ONE resolver (/api/pricing/quote) — this page never
 * computes a total itself.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Check, ChevronRight, ChevronLeft } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';

const STEPS = ['Design', 'Feature Pack', 'Link Duration', 'Review', 'Checkout'];

export default function WeddingCheckout() {
  const [catalog, setCatalog] = useState({ designs: [], categories: [], feature_packs: [], link_durations: [] });
  const [banner, setBanner] = useState(null);
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState({ design_id: '', feature_pack_key: '', duration_id: '' });
  const [quote, setQuote] = useState(null);
  const [err, setErr] = useState('');
  // Task 2 — public design merchandising (client-side over the full catalog payload).
  const [dCat, setDCat] = useState('');        // category_id filter ('' = all)
  const [dFlag, setDFlag] = useState('all');   // all|featured|trending|best_seller|new_arrival
  const [dSort, setDSort] = useState('featured');

  useEffect(() => {
    axios.get(`${API}/api/pricing/catalog`).then((r) => setCatalog(r.data)).catch(() => setErr('Could not load the catalog.'));
    axios.get(`${API}/api/campaigns/active`).then((r) => setBanner((r.data.campaigns || [])[0] || null)).catch(() => {});
  }, []);

  // live quote whenever a full selection exists
  useEffect(() => {
    if (sel.design_id && sel.feature_pack_key && sel.duration_id) {
      axios.post(`${API}/api/pricing/quote`, sel)
        .then((r) => { setQuote(r.data); setErr(''); })
        .catch((e) => { setQuote(null); setErr(e?.response?.data?.detail || 'Could not price this selection.'); });
    } else setQuote(null);
  }, [sel]);

  // Merchandising badges from the catalog flags (same flags the admin hub edits).
  const BADGE_DEFS = [
    { key: 'featured',    label: 'Featured',    cls: 'border-amber-400/40 text-amber-200 bg-amber-500/10' },
    { key: 'trending',    label: 'Trending',    cls: 'border-rose-400/40 text-rose-200 bg-rose-500/10' },
    { key: 'best_seller', label: 'Best Seller', cls: 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10' },
    { key: 'new_arrival', label: 'New',         cls: 'border-sky-400/40 text-sky-200 bg-sky-500/10' },
  ];
  const badgesFor = (d) => BADGE_DEFS.filter((b) => d[b.key]);

  const FLAG_FILTERS = [
    { key: 'all', label: 'All' },
    ...BADGE_DEFS.map((b) => ({ key: b.key, label: b.label })),
  ];
  const SORTS = [
    { key: 'featured', label: 'Featured' },
    { key: 'trending', label: 'Trending' },
    { key: 'best_seller', label: 'Best Seller' },
    { key: 'newest', label: 'Newest' },
    { key: 'price_asc', label: 'Price: Low → High' },
    { key: 'price_desc', label: 'Price: High → Low' },
  ];

  const visibleDesigns = useMemo(() => {
    let rows = (catalog.designs || []).slice();
    if (dCat) rows = rows.filter((d) => d.category_id === dCat);
    if (dFlag !== 'all') rows = rows.filter((d) => !!d[dFlag]);
    const priceOf = (d) => (d.final_price != null ? d.final_price : (d.base_price || 0));
    const ts = (d) => {
      const v = d.created_at || d.updated_at;
      const t = v ? Date.parse(v) : NaN;
      return Number.isNaN(t) ? 0 : t;
    };
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
    rows.sort((a, b) => {
      switch (dSort) {
        case 'price_asc':  return priceOf(a) - priceOf(b) || byName(a, b);
        case 'price_desc': return priceOf(b) - priceOf(a) || byName(a, b);
        case 'newest':     return ts(b) - ts(a) || (b.new_arrival ? 1 : 0) - (a.new_arrival ? 1 : 0) || byName(a, b);
        case 'trending':   return (b.trending ? 1 : 0) - (a.trending ? 1 : 0) || byName(a, b);
        case 'best_seller':return (b.best_seller ? 1 : 0) - (a.best_seller ? 1 : 0) || byName(a, b);
        case 'featured':
        default:           return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || byName(a, b);
      }
    });
    return rows;
  }, [catalog.designs, dCat, dFlag, dSort]);

  const canNext = useMemo(() => {
    if (step === 0) return !!sel.design_id;
    if (step === 1) return !!sel.feature_pack_key;
    if (step === 2) return !!sel.duration_id;
    return true;
  }, [step, sel]);

  const Card = ({ active, onClick, title, sub, price, badges }) => (
    <button type="button" onClick={onClick}
      className={`text-left border rounded-xl p-4 transition ${active ? 'border-amber-400 bg-amber-500/10' : 'border-white/10 bg-white/[.03] hover:border-white/25'}`}>
      <div className="flex items-center justify-between">
        <div className="text-white font-medium">{title}</div>
        {active && <Check size={16} className="text-amber-300" />}
      </div>
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {badges.map((b) => (
            <span key={b.key} className={`text-[10px] leading-none px-1.5 py-1 rounded-full border ${b.cls}`}>{b.label}</span>
          ))}
        </div>
      )}
      {sub && <div className="text-white/40 text-xs mt-0.5">{sub}</div>}
      {price != null && <div className="text-amber-200 mt-2 tabular-nums">₹{price}</div>}
    </button>
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {banner && (
        <div className="bg-gradient-to-r from-amber-500/20 to-rose-500/20 text-amber-100 text-center py-2 text-sm border-b border-amber-400/20">
          🎉 {banner.banner_text || banner.name}
        </div>
      )}
      <div className="max-w-4xl mx-auto p-6">
        {/* stepper */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 text-sm ${i === step ? 'text-amber-300' : i < step ? 'text-white/60' : 'text-white/30'}`}>
                <span className={`w-6 h-6 rounded-full grid place-items-center text-xs border ${i <= step ? 'border-amber-400 bg-amber-500/20' : 'border-white/20'}`}>{i < step ? <Check size={12} /> : i + 1}</span>
                <span className="hidden sm:inline">{s}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-white/20" />}
            </div>
          ))}
        </div>

        {err && <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded p-2">{err}</div>}

        {/* step body */}
        {step === 0 && (
          <div>
            {/* Merchandising controls — category + flag filters + sort */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(catalog.categories || []).length > 0 && (
                <select value={dCat} onChange={(e) => setDCat(e.target.value)}
                  className="bg-white/[.04] border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white/80"
                  data-testid="design-category-filter">
                  <option value="">All categories</option>
                  {catalog.categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-neutral-900">{c.name}</option>
                  ))}
                </select>
              )}
              <div className="flex flex-wrap gap-1.5">
                {FLAG_FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setDFlag(f.key)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition ${dFlag === f.key ? 'border-amber-400 bg-amber-500/15 text-amber-200' : 'border-white/12 text-white/55 hover:border-white/30'}`}
                    data-testid={`design-flag-${f.key}`}>{f.label}</button>
                ))}
              </div>
              <select value={dSort} onChange={(e) => setDSort(e.target.value)}
                className="ml-auto bg-white/[.04] border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white/80"
                data-testid="design-sort">
                {SORTS.map((s) => <option key={s.key} value={s.key} className="bg-neutral-900">Sort: {s.label}</option>)}
              </select>
            </div>

            {visibleDesigns.length === 0 ? (
              <div className="text-white/40 text-sm py-10 text-center border border-white/10 rounded-xl">
                No designs match this filter.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleDesigns.map((d) => (
                  <Card key={d.design_id} active={sel.design_id === d.design_id}
                    onClick={() => setSel({ ...sel, design_id: d.design_id })}
                    title={d.name} sub={d.category_id} price={d.final_price}
                    badges={badgesFor(d)} />
                ))}
              </div>
            )}
          </div>
        )}
        {step === 1 && (
          <div className="grid sm:grid-cols-3 gap-3">
            {catalog.feature_packs.map((p) => (
              <Card key={p.key} active={sel.feature_pack_key === p.key}
                onClick={() => setSel({ ...sel, feature_pack_key: p.key })}
                title={p.name} sub={`${(p.features || []).length} features`} price={p.price} />
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {catalog.link_durations.map((d) => (
              <Card key={d.id} active={sel.duration_id === d.id}
                onClick={() => setSel({ ...sel, duration_id: d.id })}
                title={d.name} sub={d.lifetime ? 'Never expires' : `${d.duration_days} days`}
                price={d.price} />
            ))}
          </div>
        )}
        {(step === 3 || step === 4) && quote && (
          <div className="border border-white/10 rounded-xl p-5 max-w-md mx-auto space-y-2 text-sm">
            <div className="flex justify-between text-white/70"><span>{quote.design?.name}</span><span className="tabular-nums">₹{quote.design_price}</span></div>
            <div className="flex justify-between text-white/70"><span>{quote.feature_pack?.name} pack</span><span className="tabular-nums">₹{quote.feature_pack_price}</span></div>
            <div className="flex justify-between text-white/70"><span>{quote.link_duration?.name}</span><span className="tabular-nums">₹{quote.link_duration_price}</span></div>
            <div className="flex justify-between text-white/50 border-t border-white/10 pt-2"><span>Subtotal</span><span className="tabular-nums">₹{quote.subtotal}</span></div>
            {quote.discount > 0 && <div className="flex justify-between text-emerald-300"><span>Discount{quote.campaign ? ` · ${quote.campaign.name}` : ''}</span><span className="tabular-nums">−₹{quote.discount}</span></div>}
            <div className="flex justify-between text-amber-200 text-xl font-semibold border-t border-white/10 pt-2"><span>Total</span><span className="tabular-nums">₹{quote.total}</span></div>
            {step === 4 && (
              <button type="button" className="w-full mt-3 bg-amber-500 text-black rounded-lg py-2.5 font-medium"
                onClick={() => { /* wired to /api/store/order/create with feature_pack_key + duration_id */ }}>
                Pay ₹{quote.total} & continue
              </button>
            )}
          </div>
        )}

        {/* nav */}
        <div className="flex justify-between mt-8">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-white/15 text-white/70 disabled:opacity-30">
            <ChevronLeft size={16} />Back
          </button>
          {step < STEPS.length - 1 && (
            <button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1 px-5 py-2 rounded-lg bg-amber-500 text-black font-medium disabled:opacity-30">
              Next<ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
