import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import PanelTabs from '@/components/PanelTabs';
import { IndianRupee, RefreshCw, TrendingUp, TrendingDown, CalendarCheck } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * StudioEarnings — a photographer's consolidated earnings, surfaced as a
 * dedicated page (was buried in the Community tab). Reads /api/studio/earnings.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function StudioEarnings() {
  const [days, setDays] = useState(90);
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setM((await axios.get(`${API_URL}/api/studio/earnings`, { params: { days } })).data); } catch (_) {}
    setLoading(false);
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const t = m?.totals, w = m?.window;
  const maxMonth = m ? Math.max(1, ...m.monthly.map((x) => Math.max(x.income, x.expense))) : 1;
  const maxCat = m ? Math.max(1, ...m.income_by_category.map((x) => x.inr)) : 1;

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 960, margin: '0 auto' }}>
        <PanelTabs active="/studio/earnings" />
        <div className="flex items-center gap-3 mb-6">
          <IndianRupee style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Earnings</h1>
          <div className="ml-auto flex items-center gap-2">
            <select className="lux-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={30}>30d</option><option value={90}>90d</option><option value={365}>365d</option>
            </select>
            <button onClick={load} className="lux-btn lux-btn-ghost !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>

        {loading && !m ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : m && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Kpi label="Net earnings" value={inr(t.net_inr)} accent />
              <Kpi label="Income" value={inr(t.income_inr)} icon={TrendingUp} color="#7BD88F" />
              <Kpi label="Expenses" value={inr(t.expense_inr)} icon={TrendingDown} color="#ff9a9a" />
              <Kpi label="Bookings" value={m.bookings.total} icon={CalendarCheck} />
            </div>

            <div className="lux-glass p-3 mb-6 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              Last {m.window_days}d: income {inr(w.income_inr)} · expenses {inr(w.expense_inr)} · net <span style={{ color: '#E8C97A' }}>{inr(w.net_inr)}</span>.
              These come from your Finance ledger — add income/expense entries in the Community → Finance tab.
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="lux-glass p-5">
                <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Income vs expense / month</h2>
                {m.monthly.length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>No entries yet.</div>
                  : m.monthly.map((x) => (
                    <div key={x.month} className="mb-2">
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--lux-text-muted)' }}>{x.month} · net {inr(x.net)}</div>
                      <div className="flex gap-1 items-center">
                        <div className="h-2.5 rounded-full" style={{ width: `${(x.income / maxMonth) * 100}%`, background: '#7BD88F', minWidth: x.income ? 4 : 0 }} />
                        <div className="h-2.5 rounded-full" style={{ width: `${(x.expense / maxMonth) * 100}%`, background: '#ff9a9a', minWidth: x.expense ? 4 : 0 }} />
                      </div>
                    </div>
                  ))}
              </div>
              <div className="lux-glass p-5">
                <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Income by category</h2>
                {m.income_by_category.length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>No income entries.</div>
                  : m.income_by_category.map((c) => (
                    <div key={c.category} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] w-24 truncate shrink-0" style={{ color: 'var(--lux-text)' }}>{c.category}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div style={{ width: `${(c.inr / maxCat) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
                      </div>
                      <span className="text-[10px] w-20 text-right shrink-0" style={{ color: 'var(--lux-text-muted)' }}>{inr(c.inr)}</span>
                    </div>
                  ))}
                {Object.keys(m.bookings.by_status).length > 0 && (
                  <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--lux-border)' }}>
                    <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--lux-text-muted)' }}>Bookings by status</div>
                    {Object.entries(m.bookings.by_status).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs" style={{ color: 'var(--lux-text)' }}><span>{k}</span><span>{v}</span></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, accent }) {
  return (
    <div className="lux-glass p-4" style={accent ? { border: '1px solid rgba(212,175,55,0.4)' } : undefined}>
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: color || '#E8C97A' }} />}
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
      </div>
      <div className="font-display text-2xl" style={{ color: accent ? '#E8C97A' : 'var(--lux-text)' }}>{value}</div>
    </div>
  );
}
