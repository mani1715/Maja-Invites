import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Scale, RefreshCw } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminProfitability — P&L estimate (Phase 14). Real revenue − labelled cost estimates. */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const COST_LABELS = { storage_inr: 'Storage', sms_inr: 'SMS', email_inr: 'Email', face_inr: 'Face search', payment_fees_inr: 'Payment fees' };

export default function SuperAdminProfitability() {
  const [days, setDays] = useState(30);
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setM((await axios.get(`${API_URL}/api/admin/profitability`, { params: { days } })).data); } catch (_) {}
    setLoading(false);
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const maxCost = m ? Math.max(0.001, ...Object.values(m.costs)) : 1;

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <Scale style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Profitability</h1>
          <div className="ml-auto flex items-center gap-2">
            <select className="lux-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={30}>30d</option><option value={90}>90d</option><option value={365}>365d</option>
            </select>
            <button onClick={load} className="lux-btn lux-btn-ghost !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>

        {loading && !m ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : m && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="lux-glass p-5">
                <div className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--lux-text-muted)' }}>Revenue</div>
                <div className="font-display text-2xl" style={{ color: '#7BD88F' }}>{inr(m.revenue_inr)}</div>
              </div>
              <div className="lux-glass p-5">
                <div className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--lux-text-muted)' }}>Costs (est.)</div>
                <div className="font-display text-2xl" style={{ color: '#ff9a9a' }}>{inr(m.total_cost_inr)}</div>
              </div>
              <div className="lux-glass p-5" style={{ border: '1px solid rgba(212,175,55,0.4)' }}>
                <div className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--lux-text-muted)' }}>Profit (est.) · {m.margin_pct}%</div>
                <div className="font-display text-2xl" style={{ color: m.profit_inr >= 0 ? '#E8C97A' : '#ff7a7a' }}>{inr(m.profit_inr)}</div>
              </div>
            </div>

            <div className="lux-glass p-5 mb-4">
              <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Cost breakdown</h2>
              {Object.entries(m.costs).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 mb-2">
                  <span className="text-xs w-28 shrink-0" style={{ color: 'var(--lux-text)' }}>{COST_LABELS[k] || k}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{ width: `${(v / maxCost) * 100}%`, height: '100%', background: 'rgba(255,154,154,0.7)' }} />
                  </div>
                  <span className="text-xs w-20 text-right shrink-0" style={{ color: 'var(--lux-text-muted)' }}>{inr(v)}</span>
                </div>
              ))}
            </div>

            <div className="lux-glass p-4 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              <span style={{ color: '#E8C97A' }}>Assumptions (editable via env):</span> storage ₹{m.assumptions.storage_inr_per_gb}/GB ·
              SMS ₹{m.assumptions.sms_inr} · email ₹{m.assumptions.email_inr} · face ₹{m.assumptions.face_inr} ·
              payment fee {m.assumptions.payment_fee_pct}% · volumes: {m.volumes.sms_sends} SMS, {m.volumes.email_sends} email, {m.volumes.face_ops} face ops.
              <div className="mt-1" style={{ color: 'var(--lux-text-muted)' }}>{m.assumptions.note}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
