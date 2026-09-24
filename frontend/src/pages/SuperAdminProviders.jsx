import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Plug, RefreshCw, CheckCircle2, MinusCircle } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminProviders — read-only provider config + health (Phase 15). No secret values. */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const HC = { ok: '#7BD88F', degraded: '#E8C97A', down: '#ff7a7a', not_configured: 'var(--lux-text-muted)', unknown: 'var(--lux-text-muted)', 'n/a': 'var(--lux-text-muted)' };

export default function SuperAdminProviders() {
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setM((await axios.get(`${API_URL}/api/admin/providers`)).data); } catch (_) {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <Plug style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Providers</h1>
          {m && <span className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{m.configured_count}/{m.total} configured</span>}
          <button onClick={load} className="lux-btn lux-btn-ghost ml-auto !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
        </div>

        {loading && !m ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : m && (
          <>
            <div className="grid gap-2">
              {m.providers.map((p) => (
                <div key={p.key} className="lux-glass p-4 flex items-center gap-3" data-testid={`provider-${p.key}`}>
                  {p.configured ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: '#7BD88F' }} />
                    : <MinusCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--lux-text-muted)' }} />}
                  <div className="min-w-0 flex-1">
                    <div style={{ color: 'var(--lux-text)' }}>{p.label}</div>
                    <div className="text-[11px] font-mono" style={{ color: 'var(--lux-text-muted)' }}>{p.env_vars.join(' · ')}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide shrink-0" style={{ color: p.configured ? 'var(--lux-text)' : 'var(--lux-text-muted)' }}>
                    {p.configured ? 'Configured' : 'Not set'}
                  </span>
                  {p.health !== 'n/a' && (
                    <span className="text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0" style={{ color: HC[p.health] || 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}>
                      {p.health}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="lux-glass p-3 mt-4 text-xs" style={{ color: '#E8C97A' }}>{m.note}</div>
          </>
        )}
      </div>
    </div>
  );
}
