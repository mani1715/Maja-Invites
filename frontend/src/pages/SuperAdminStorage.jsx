import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { HardDrive, RefreshCw, IndianRupee, AlertTriangle, Cloud } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminStorage — Storage Command Center (Phase 6). Real usage + labelled cost estimate. */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function SuperAdminStorage() {
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setM((await axios.get(`${API_URL}/api/admin/storage/overview`)).data); } catch (_) {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const u = m?.usage, c = m?.cost_estimate, p = m?.providers, h = m?.health;
  const maxStudio = Math.max(0.001, ...((m?.top_consumers || []).map((x) => x.used_gb)));
  const maxMonth = Math.max(0.001, ...((m?.growth_monthly || []).map((x) => x.added_gb)));

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1050, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <HardDrive style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Storage</h1>
          <button onClick={load} className="lux-btn lux-btn-ghost ml-auto !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
        </div>

        {loading && !m ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : m && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Tile label="Total used" value={`${u.total_used_gb} GB`} />
              <Tile label="Drive pool used" value={`${u.pool_used_pct}%`} sub={`${p.pool_used_gb}/${p.pool_capacity_gb} GB`} warn={u.pool_used_pct > 85} />
              <Tile label="Est. monthly cost" value={`₹${c.monthly_inr}`} sub={`@ ₹${c.inr_per_gb}/GB`} icon={IndianRupee} />
              <Tile label="Failed uploads (30d)" value={h.failed_uploads_30d} warn={h.failed_uploads_30d > 0} icon={AlertTriangle} />
            </div>

            <div className="lux-glass p-3 mb-6 text-xs flex items-center gap-2" style={{ color: 'var(--lux-text-muted)' }}>
              <Cloud className="w-3.5 h-3.5" /> {p.drive_active}/{p.drive_accounts} Drive accounts active · {u.sold_quota_gb} GB quota sold · {u.files} files · <span style={{ color: '#E8C97A' }}>{c.note}</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="lux-glass p-5">
                <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Top consumers</h2>
                {(m.top_consumers || []).length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>No files yet.</div>
                  : m.top_consumers.map((s) => (
                    <div key={s.studio_id} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[11px] w-24 truncate shrink-0" style={{ color: 'var(--lux-text)' }}>{s.studio_id}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div style={{ width: `${(s.used_gb / maxStudio) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
                      </div>
                      <span className="text-[10px] w-14 text-right shrink-0" style={{ color: 'var(--lux-text-muted)' }}>{s.used_gb} GB</span>
                    </div>
                  ))}
              </div>
              <div className="lux-glass p-5">
                <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Growth (GB added / month)</h2>
                {(m.growth_monthly || []).length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>No data yet.</div>
                  : m.growth_monthly.map((g) => (
                    <div key={g.month} className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] w-14 shrink-0" style={{ color: 'var(--lux-text-muted)' }}>{g.month}</span>
                      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div style={{ width: `${(g.added_gb / maxMonth) * 100}%`, height: '100%', background: 'rgba(143,179,255,0.7)' }} />
                      </div>
                      <span className="text-[10px] w-14 text-right shrink-0" style={{ color: 'var(--lux-text)' }}>{g.added_gb} GB</span>
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, warn, icon: Icon }) {
  return (
    <div className="lux-glass p-4">
      <div className="flex items-center gap-1.5 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5" style={{ color: '#E8C97A' }} />}
        <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
      </div>
      <div className="font-display text-2xl" style={{ color: warn ? '#ff9a9a' : 'var(--lux-text)' }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{sub}</div>}
    </div>
  );
}
