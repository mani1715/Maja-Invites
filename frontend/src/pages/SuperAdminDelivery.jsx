import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Send, RefreshCw, Mail, MessageSquare, AlertTriangle } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminDelivery — email/SMS delivery observability (Phase 12). */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const SC = { sent: 'var(--lux-text-muted)', delivered: '#7BD88F', opened: '#8Fb3ff', clicked: '#E8C97A', bounced: '#ff9a9a', failed: '#ff7a7a', complained: '#ff7a7a' };

export default function SuperAdminDelivery() {
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState('');
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { days }; if (channel) params.channel = channel;
      const [s, r] = await Promise.all([
        axios.get(`${API_URL}/api/admin/delivery/stats`, { params }),
        axios.get(`${API_URL}/api/admin/delivery/recent`, { params: { ...(channel ? { channel } : {}), limit: 50 } }),
      ]);
      setStats(s.data); setRecent(r.data.items || []);
    } catch (_) {}
    setLoading(false);
  }, [days, channel]);
  useEffect(() => { load(); }, [load]);

  const t = stats?.totals, rate = stats?.rates_pct;
  const maxDay = Math.max(1, ...(stats?.daily || []).map((d) => d.sent));

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1050, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <Send style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Delivery</h1>
          <div className="ml-auto flex items-center gap-2">
            <select className="lux-input" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">All channels</option><option value="email">Email</option><option value="sms">SMS</option>
            </select>
            <select className="lux-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={30}>30d</option><option value={90}>90d</option>
            </select>
            <button onClick={load} className="lux-btn lux-btn-ghost !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>

        {stats && !stats.webhook_connected && (
          <div className="lux-glass p-3 mb-4 flex items-center gap-2 text-sm" style={{ color: '#E8C97A', border: '1px solid rgba(212,175,55,0.35)' }}>
            <AlertTriangle className="w-4 h-4" /> Sends are logged, but delivered/opened/bounced need your provider webhook → <code>POST /api/webhooks/delivery</code> with <code>DELIVERY_WEBHOOK_SECRET</code>.
          </div>
        )}

        {loading && !stats ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <Tile label="Sent" value={t.sent} />
              <Tile label="Delivery rate" value={`${rate.delivery}%`} good={rate.delivery >= 95} />
              <Tile label="Bounce rate" value={`${rate.bounce}%`} warn={rate.bounce > 3} />
              <Tile label="Open rate" value={`${rate.open}%`} />
              <Tile label="Failed" value={t.failed} warn={t.failed > 0} />
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="lux-glass p-5">
                <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Sends / day</h2>
                {(stats.daily || []).length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>No sends yet.</div>
                  : stats.daily.map((d) => (
                    <div key={d.day} className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] w-16 shrink-0" style={{ color: 'var(--lux-text-muted)' }}>{d.day.slice(5)}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div style={{ width: `${(d.sent / maxDay) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
                      </div>
                      <span className="text-[10px] w-8 text-right" style={{ color: 'var(--lux-text)' }}>{d.sent}</span>
                    </div>
                  ))}
              </div>
              <div className="lux-glass p-5">
                <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>By provider</h2>
                {Object.entries(stats.by_provider).map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1.5 border-t text-sm" style={{ borderColor: 'var(--lux-border)', color: 'var(--lux-text)' }}>
                    <span>{k}</span><span className="font-display">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Recent sends</h2>
            <div className="lux-glass overflow-hidden">
              {recent.length === 0 ? <div className="p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>Nothing sent yet.</div>
                : recent.map((r) => (
                  <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 border-b text-sm" style={{ borderColor: 'var(--lux-border)' }}>
                    {r.channel === 'sms' ? <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--lux-text-muted)' }} /> : <Mail className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--lux-text-muted)' }} />}
                    <span className="flex-1 truncate" style={{ color: 'var(--lux-text)' }}>{r.recipient_masked}</span>
                    <span className="text-xs shrink-0" style={{ color: 'var(--lux-text-muted)' }}>{r.provider}</span>
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0" style={{ color: SC[r.status] || 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}>{r.status}</span>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--lux-text-muted)' }}>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, good, warn }) {
  return (
    <div className="lux-glass p-4">
      <div className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
      <div className="font-display text-2xl" style={{ color: warn ? '#ff9a9a' : good ? '#7BD88F' : 'var(--lux-text)' }}>{value}</div>
    </div>
  );
}
