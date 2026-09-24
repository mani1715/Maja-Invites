import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Search, MapPin, Star, BadgeCheck, X, ShoppingBag, Send } from 'lucide-react';
import PublicChrome from '@/components/PublicChrome';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const authHeaders = () => { const t = localStorage.getItem('admin_token'); return t ? { Authorization: `Bearer ${t}` } : {}; };

function VendorDetail({ id, onClose }) {
  const [d, setD] = useState(null);
  const [rv, setRv] = useState({ rating: 5, text: '', kind: 'text', media_url: '' });
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/vendors/${id}`); setD(data); } catch (e) { onClose(); }
  }, [id, onClose]);
  useEffect(() => { load(); }, [load]);
  const submit = async () => {
    if (!localStorage.getItem('admin_token')) { setMsg('Sign in to your studio to leave a review.'); return; }
    try { await axios.post(`${API_URL}/api/pixora/vendors/${id}/reviews`, rv, { headers: authHeaders() }); setMsg('Review submitted.'); setRv({ rating: 5, text: '', kind: 'text', media_url: '' }); load(); }
    catch (e) { setMsg(e?.response?.data?.detail || 'Could not submit'); }
  };
  const v = d?.vendor;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: '#16110C', border: '1px solid var(--lux-gold)' }} onClick={(e) => e.stopPropagation()}>
        {!v ? <div style={{ color: '#FFF8DC' }}>Loading…</div> : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-2xl flex items-center gap-2" style={{ color: '#FFF8DC' }}>{v.business_name}{v.verified_level > 0 && <BadgeCheck className="w-5 h-5" style={{ color: '#E8C97A' }} />}</h2>
                <div className="text-xs mt-1" style={{ color: '#E8C97A' }}>{v.category} · {[v.city, v.state, v.country].filter(Boolean).join(', ')}</div>
              </div>
              <button onClick={onClose}><X className="w-5 h-5" style={{ color: '#FFF8DC' }} /></button>
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm" style={{ color: 'rgba(255,248,220,0.8)' }}>
              {v.rating != null && <span className="flex items-center gap-1"><Star className="w-4 h-4" style={{ color: '#E8C97A', fill: '#E8C97A' }} /> {v.rating} ({v.review_count})</span>}
              {(v.price_min_inr > 0 || v.price_max_inr > 0) && <span>{inr(v.price_min_inr)}{v.price_max_inr ? ` – ${inr(v.price_max_inr)}` : '+'}</span>}
              {v.experience_years > 0 && <span>{v.experience_years}+ yrs</span>}
              <span>{v.availability_status}</span>
            </div>
            {v.description && <p className="text-sm mt-3" style={{ color: 'rgba(255,248,220,0.85)' }}>{v.description}</p>}
            {(v.services || []).length > 0 && <div className="flex flex-wrap gap-1.5 mt-3">{v.services.map((s) => <span key={s} className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{s}</span>)}</div>}
            {v.portfolio_slug && <a href={`/photographer/${v.portfolio_slug}/portfolio`} className="inline-block mt-3 text-xs" style={{ color: '#E8C97A' }}>◆ View full portfolio →</a>}

            <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--lux-border)' }}>
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'rgba(255,248,220,0.6)' }}>Reviews</div>
              {(d.reviews || []).length === 0 ? <div className="text-xs" style={{ color: 'rgba(255,248,220,0.4)' }}>No reviews yet.</div> : (d.reviews || []).map((r) => (
                <div key={r.id} className="mb-3">
                  <div className="text-sm" style={{ color: '#FFF8DC' }}><Star className="w-3.5 h-3.5 inline" style={{ color: '#E8C97A', fill: '#E8C97A' }} /> {r.rating} · {r.author} {r.verified && <span className="text-[10px] px-1.5 rounded-full" style={{ background: 'rgba(62,207,142,0.15)', color: '#3ECf8E' }}>verified</span>}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,248,220,0.8)' }}>{r.text}</div>
                  {r.response && <div className="text-xs mt-1 pl-3" style={{ color: 'rgba(255,248,220,0.55)', borderLeft: '2px solid var(--lux-border)' }}>Vendor: {r.response.text}</div>}
                </div>
              ))}
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <select value={rv.rating} onChange={(e) => setRv({ ...rv, rating: Number(e.target.value) })} className="lux-input text-sm">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}★</option>)}</select>
                <input value={rv.text} onChange={(e) => setRv({ ...rv, text: e.target.value })} placeholder="Write a review…" className="lux-input flex-1 text-sm" />
                <button onClick={submit} className="lux-btn text-sm"><Send className="w-4 h-4" /> Post</button>
              </div>
              {msg && <div className="text-xs mt-2" style={{ color: '#E8C97A' }}>{msg}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VendorMarketplace() {
  const [vendors, setVendors] = useState(null);
  const [facets, setFacets] = useState({});
  const [f, setF] = useState({ category: '', country: '', state: '', q: '', sort: 'rank' });
  const [sel, setSel] = useState(null);
  const load = useCallback(async () => {
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    try { const { data } = await axios.get(`${API_URL}/api/pixora/vendors?${params}`); setVendors(data.vendors || []); setFacets(data.facets || {}); }
    catch (e) { setVendors([]); }
  }, [f]);
  useEffect(() => { load(); }, [load]);
  return (
    <PublicChrome title="Wedding Vendor Marketplace — MAJA" description="Discover verified wedding vendors — photographers, planners, makeup artists, decorators, venues and more. Filter by category, location and rating.">
      <section className="px-6 md:px-16 py-16 max-w-6xl mx-auto">
        <span className="lux-eyebrow block mb-4">◆ Vendor Marketplace</span>
        <h1 className="font-display text-[2.4rem] md:text-[3.4rem] leading-[1.05] mb-6" style={{ color: 'var(--lux-text)' }}>
          Build your <span className="font-script italic text-gold">dream team.</span>
        </h1>
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lux-text-faint)' }} />
            <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search vendors, services…" className="w-full pl-9 pr-3 py-2.5 rounded-full text-sm" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
          </div>
          {[['category', facets.categories], ['country', facets.countries], ['state', facets.states]].map(([k, opts]) => (
            <select key={k} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="rounded-full px-4 py-2 text-sm capitalize" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}>
              <option value="">All {k}</option>
              {(opts || []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          <select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} className="rounded-full px-4 py-2 text-sm" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}>
            <option value="rank">Top ranked</option><option value="rating">Top rated</option><option value="reviews">Most reviewed</option>
          </select>
        </div>
        {vendors === null ? <p style={{ color: 'var(--lux-text-muted)' }}>Loading…</p> : vendors.length === 0 ? (
          <div className="lux-glass p-12 text-center"><ShoppingBag className="w-9 h-9 mx-auto mb-3 text-gold" /><p style={{ color: 'var(--lux-text)' }}>No vendors match yet.</p></div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {vendors.map((v) => (
              <button key={v.id} onClick={() => setSel(v.id)} className="lux-glass p-5 text-left" data-testid={`vendor-card-${v.id}`} style={v.featured ? { border: '1px solid var(--lux-gold)' } : {}}>
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{v.business_name}</span>
                  {v.verified_level > 0 && <BadgeCheck className="w-4 h-4" style={{ color: '#E8C97A' }} />}
                </div>
                <div className="text-xs mt-1" style={{ color: '#E8C97A' }}>{v.category}</div>
                <div className="text-[11px] mt-1 flex items-center gap-2" style={{ color: 'var(--lux-text-muted)' }}>
                  <MapPin className="w-3 h-3" /> {[v.city, v.state].filter(Boolean).join(', ') || v.country}
                  {v.rating != null && <span className="flex items-center gap-0.5"><Star className="w-3 h-3" style={{ color: '#E8C97A', fill: '#E8C97A' }} /> {v.rating} ({v.review_count})</span>}
                </div>
                {(v.price_min_inr > 0) && <div className="text-[11px] mt-1 text-gold">From {inr(v.price_min_inr)}</div>}
              </button>
            ))}
          </div>
        )}
      </section>
      {sel && <VendorDetail id={sel} onClose={() => { setSel(null); load(); }} />}
    </PublicChrome>
  );
}
