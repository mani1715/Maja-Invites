import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, IndianRupee, Users, Repeat, RefreshCw, Percent, Gift, Ticket } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * SuperAdminBI — the executive dashboard (Phase 11). Recurring revenue (MRR/ARR),
 * churn, revenue rollups, signup growth, conversion/activation funnel, referral +
 * coupon performance. All from /api/admin/bi/overview (computed over real data).
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function SuperAdminBI() {
  const [days, setDays] = useState(30);
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/bi/overview`, { params: { days } });
      setM(data);
    } catch (e) { setErr(e?.response?.status === 403 ? 'Admin access required.' : 'Could not load metrics.'); }
    setLoading(false);
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const r = m?.recurring, g = m?.growth, f = m?.funnel, rev = m?.revenue;

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Business intelligence</h1>
          <div className="ml-auto flex items-center gap-2">
            <select className="lux-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 365 days</option>
            </select>
            <button onClick={load} className="lux-btn lux-btn-ghost !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>

        {err && <div className="lux-glass p-4 mb-4" style={{ color: '#ff9a9a' }}>{err}</div>}
        {loading && !m ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : m && (
          <>
            {/* Hero KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Kpi icon={Repeat} label="MRR" value={inr(r.mrr_inr)} sub={`${r.active_subscriptions} active subs`} big />
              <Kpi icon={IndianRupee} label="ARR" value={inr(r.arr_inr)} sub="run-rate" big />
              <Kpi icon={Percent} label="Churn (window)" value={`${r.churn_rate_pct}%`} sub={`${r.churned_window} churned`} warn={r.churn_rate_pct > 5} big />
              <Kpi icon={IndianRupee} label={`Revenue (${m.window_days}d)`} value={inr(rev.window_inr)} sub={`${inr(rev.total_inr)} all-time`} big />
            </div>

            {/* Growth + funnel */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <Card title="Growth">
                <Row k="Photographers" v={g.total_photographers} extra={`+${g.new_photographers_window} in window`} />
                <Row k="Couples" v={g.total_couples} extra={`+${g.new_couples_window} in window`} />
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--lux-text-muted)' }}>New signups / month</div>
                  <Bars data={g.monthly.map((x) => ({ label: x.month, value: x.couples + x.photographers }))} />
                </div>
              </Card>
              <Card title="Funnel">
                <Row k="Photographer conversion" v={`${f.photographer_conversion_pct}%`} extra={`${f.paid_photographers} paid`} />
                <Row k="Photographer activation" v={`${f.photographer_activation_pct}%`} extra={`${f.activated_photographers} activated`} />
                <div className="mt-3">
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--lux-text-muted)' }}>Active subs by product</div>
                  {Object.entries(r.by_product).length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>None yet.</div>
                    : Object.entries(r.by_product).map(([k, v]) => <Row key={k} k={k} v={v} />)}
                </div>
              </Card>
            </div>

            {/* Revenue trend + referrals/coupons */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Revenue / month">
                <Bars gold data={rev.monthly.map((x) => ({ label: x.month, value: x.revenue_inr }))} money />
              </Card>
              <Card title="Acquisition">
                <Row k="Referrals (total)" v={m.referrals.total} extra={`${m.referrals.photographer_referrals} studio · ${m.referrals.couple_referrals} couple`} icon={Gift} />
                <Row k="Coupon redemptions" v={m.coupons.redemptions} icon={Ticket} />
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, big, warn }) {
  return (
    <div className="lux-glass p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" style={{ color: '#E8C97A' }} />
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
      </div>
      <div className={big ? 'font-display text-2xl' : 'font-display text-xl'} style={{ color: warn ? '#ff9a9a' : 'var(--lux-text)' }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{sub}</div>}
    </div>
  );
}
function Card({ title, children }) {
  return (
    <div className="lux-glass p-5">
      <h2 className="font-heading text-sm tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--lux-text-muted)' }}>{title}</h2>
      {children}
    </div>
  );
}
function Row({ k, v, extra, icon: Icon }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: 'var(--lux-border)' }}>
      <span className="flex items-center gap-2 text-sm" style={{ color: 'var(--lux-text)' }}>
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: 'var(--lux-text-muted)' }} />}{k}
      </span>
      <span className="text-right">
        <span className="font-display" style={{ color: 'var(--lux-text)' }}>{v}</span>
        {extra && <span className="block text-[10px]" style={{ color: 'var(--lux-text-muted)' }}>{extra}</span>}
      </span>
    </div>
  );
}
function Bars({ data, gold, money }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>No data yet.</div>;
  return (
    <div className="grid gap-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-[10px] w-14 shrink-0" style={{ color: 'var(--lux-text-muted)' }}>{d.label}</span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: gold ? 'linear-gradient(90deg,#E8C97A,#D4AF37)' : 'rgba(143,179,255,0.7)' }} />
          </div>
          <span className="text-[10px] w-20 text-right shrink-0" style={{ color: 'var(--lux-text)' }}>{money ? inr(d.value) : d.value}</span>
        </div>
      ))}
    </div>
  );
}
