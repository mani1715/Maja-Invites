/**
 * SuperAdminFeatureWishes — the owner's inbox of "I want a feature you don't sell".
 *
 * Each row is a person waiting for a phone call, so the PHONE NUMBER is the
 * loudest thing on the card and is a tel: link — one tap to dial from a phone.
 * New requests are highlighted and stay highlighted until the owner moves them
 * off "new", so an unread lead cannot quietly disappear behind a filter.
 *
 * Backed by feature_wishes.py: GET /api/admin/feature-wishes[/summary],
 * PATCH /api/admin/feature-wishes/{id}.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Phone, Bell, Check, Loader2, IndianRupee, MessageSquare,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const STATUS_LABEL = {
  new: 'New', contacted: 'Called', quoted: 'Quoted',
  agreed: 'Agreed', declined: 'Declined', closed: 'Closed',
};

const when = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
    return d.toLocaleDateString();
  } catch (_e) { return iso; }
};

export default function SuperAdminFeatureWishes() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [summary, setSummary] = useState({ new: 0, open: 0, total: 0 });
  const [filter, setFilter] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [drafts, setDrafts] = useState({});   // id -> {admin_note, quoted_price_inr}

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      if (onlyNew) params.set('only_new', 'true');
      const [list, sum] = await Promise.all([
        axios.get(`${API_URL}/api/admin/feature-wishes?${params}`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/admin/feature-wishes/summary`, { headers: authHeaders() })
          .catch(() => ({ data: {} })),
      ]);
      setItems(list.data?.items || []);
      setStatuses(list.data?.statuses || []);
      setSummary(sum.data || {});
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load feature requests.');
    }
    setLoading(false);
  }, [filter, onlyNew]);
  useEffect(() => { load(); }, [load]);

  const patch = async (id, body) => {
    setSavingId(id);
    try {
      await axios.patch(`${API_URL}/api/admin/feature-wishes/${id}`, body,
        { headers: authHeaders() });
      await load();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not save.');
    }
    setSavingId('');
  };

  const draft = (id, k, v) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [k]: v } }));

  return (
    <div className="luxe min-h-screen relative" data-testid="wishes-page">
      <div className="lux-orbit" style={{ width: 700, height: 700, top: -240, right: -240 }} />
      <div className="relative z-10 max-w-5xl mx-auto p-6 md:p-12">
        <button onClick={() => navigate('/super-admin/dashboard')}
          className="lux-btn lux-btn-ghost text-xs mb-6 inline-flex items-center gap-2"
          data-testid="wishes-back">
          <ArrowLeft className="w-4 h-4" /> Back to console
        </button>

        <span className="lux-eyebrow block mb-3">◆ Custom feature requests</span>
        <h1 className="font-display text-[2.2rem] md:text-[3.2rem] leading-tight"
          style={{ color: 'var(--lux-text)' }}>
          People waiting for <span className="font-script italic text-gold">your call</span>
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
          Each one asked for something we don’t sell yet and left a number. Call them, agree the
          feature and the price, then record it here.
        </p>

        {/* counters */}
        <div className="grid grid-cols-3 gap-3 mt-6 mb-6">
          {[['New to call', summary.new, true], ['Open', summary.open, false],
            ['All time', summary.total, false]].map(([label, n, hot]) => (
            <div key={label} className="lux-glass p-4 text-center"
              style={hot && n > 0 ? { border: '1px solid rgba(212,175,55,0.5)' } : undefined}
              data-testid={`wishes-count-${String(label).toLowerCase().replace(/\s+/g, '-')}`}>
              <div className="font-display text-2xl" style={{ color: hot && n > 0 ? '#E8C766' : 'var(--lux-text)' }}>
                {n ?? 0}
              </div>
              <div className="text-[10px] tracking-[0.2em] uppercase mt-1"
                style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <button onClick={() => { setFilter(''); setOnlyNew(false); }}
            className={`lux-chip ${!filter && !onlyNew ? 'is-active' : ''}`} data-testid="wishes-filter-all">
            All
          </button>
          <button onClick={() => { setOnlyNew(true); setFilter(''); }}
            className={`lux-chip ${onlyNew ? 'is-active' : ''}`} data-testid="wishes-filter-new">
            Needs a call
          </button>
          {statuses.map((s) => (
            <button key={s} onClick={() => { setFilter(s); setOnlyNew(false); }}
              className={`lux-chip ${filter === s ? 'is-active' : ''}`} data-testid={`wishes-filter-${s}`}>
              {STATUS_LABEL[s] || s}
            </button>
          ))}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg text-sm mb-4" data-testid="wishes-error"
            style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(139,0,0,0.5)', color: '#FFD7C9' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="lux-glass p-8 flex items-center justify-center gap-2 text-sm"
            style={{ color: 'var(--lux-text-muted)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="lux-glass p-10 text-center" data-testid="wishes-empty">
            <p className="text-sm" style={{ color: 'var(--lux-text)' }}>No requests here yet.</p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--lux-text-muted)' }}>
              When a buyer asks for a feature we don’t sell, it lands here with their number.
            </p>
          </div>
        ) : items.map((w) => {
          const d = drafts[w.id] || {};
          const hot = !!w.is_new;
          return (
            <div key={w.id} className="lux-glass p-5 mb-3"
              style={hot ? { border: '1px solid rgba(212,175,55,0.55)', background: 'rgba(212,175,55,0.05)' } : undefined}
              data-testid={`wish-${w.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {hot && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] tracking-wide uppercase"
                        style={{ background: 'rgba(212,175,55,0.18)', color: '#E8C766', border: '1px solid rgba(212,175,55,0.5)' }}
                        data-testid={`wish-new-${w.id}`}>
                        <Bell className="w-3 h-3" /> Needs a call
                      </span>
                    )}
                    <span className="text-sm" style={{ color: 'var(--lux-text)' }}>
                      {w.name || 'Someone'}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--lux-text-faint, var(--lux-text-muted))' }}>
                      · {w.source || 'cart'} · {when(w.created_at)}
                    </span>
                  </div>
                  {/* The number is the point of the whole feature — make it big and dialable. */}
                  <a href={`tel:${w.phone}`} data-testid={`wish-phone-${w.id}`}
                    className="mt-2 inline-flex items-center gap-2 font-display text-xl no-underline"
                    style={{ color: '#E8C766' }}>
                    <Phone className="w-4 h-4" /> {w.phone}
                  </a>
                  {w.email && (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>{w.email}</div>
                  )}
                </div>
                <span className="text-[11px] px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}>
                  {STATUS_LABEL[w.status] || w.status}
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap"
                style={{ color: 'var(--lux-text)' }} data-testid={`wish-text-${w.id}`}>
                {w.text}
              </p>
              {w.design_id && (
                <div className="mt-1.5 text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
                  Looking at design <span className="font-mono">{w.design_id}</span>
                </div>
              )}

              {/* call notes + agreed price */}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 mt-4">
                <div className="flex items-center gap-2 px-3 rounded-lg"
                  style={{ border: '1px solid var(--lux-border)' }}>
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--lux-text-muted)' }} />
                  <input
                    value={d.admin_note ?? w.admin_note ?? ''}
                    onChange={(e) => draft(w.id, 'admin_note', e.target.value)}
                    placeholder="What you agreed on the call"
                    data-testid={`wish-note-${w.id}`}
                    className="w-full py-2.5 bg-transparent outline-none text-sm"
                    style={{ color: 'var(--lux-text)' }} />
                </div>
                <div className="flex items-center gap-1.5 px-3 rounded-lg"
                  style={{ border: '1px solid var(--lux-border)' }}>
                  <IndianRupee className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--lux-text-muted)' }} />
                  <input
                    type="number" min="0"
                    value={d.quoted_price_inr ?? (w.quoted_price_inr ?? '')}
                    onChange={(e) => draft(w.id, 'quoted_price_inr', e.target.value)}
                    placeholder="Price quoted"
                    data-testid={`wish-price-${w.id}`}
                    className="w-28 py-2.5 bg-transparent outline-none text-sm"
                    style={{ color: 'var(--lux-text)' }} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  onClick={() => patch(w.id, {
                    admin_note: d.admin_note ?? w.admin_note ?? '',
                    ...(d.quoted_price_inr !== undefined && d.quoted_price_inr !== ''
                      ? { quoted_price_inr: Number(d.quoted_price_inr) } : {}),
                  })}
                  disabled={savingId === w.id}
                  className="lux-btn lux-btn-ghost text-[11px]" data-testid={`wish-save-${w.id}`}>
                  {savingId === w.id ? 'Saving…' : 'Save notes'}
                </button>
                {(statuses.length ? statuses : Object.keys(STATUS_LABEL))
                  .filter((s) => s !== w.status)
                  .map((s) => (
                    <button key={s} onClick={() => patch(w.id, { status: s })}
                      disabled={savingId === w.id}
                      className="lux-btn lux-btn-ghost text-[11px]"
                      data-testid={`wish-status-${s}-${w.id}`}>
                      {s === 'contacted' ? <Check className="w-3 h-3 mr-1 inline" /> : null}
                      Mark {STATUS_LABEL[s] || s}
                    </button>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
