import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { QrCode, RefreshCw } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminQRAnalytics — QR photo-sharing analytics (Phase 8). */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function SuperAdminQRAnalytics() {
  const [m, setM] = useState(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setM((await axios.get(`${API_URL}/api/admin/qr-analytics`)).data); setErr(''); }
    catch (e) { setErr(e?.response?.status === 403 ? 'Admin access required.' : 'Could not load QR analytics.'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <QrCode style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>QR photo sharing</h1>
          <button onClick={load} className="lux-btn lux-btn-ghost ml-auto !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {err && <div className="lux-glass p-4 mb-4" style={{ color: '#ff9a9a' }}>{err}</div>}
        {!m ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <Tile label="QR scans" value={m.total_scans} />
              <Tile label="Uploads" value={m.total_uploads} sub={`${m.uploads_per_gallery_avg}/gallery`} />
              <Tile label="Scan → upload" value={`${m.scan_to_upload_pct}%`} />
              <Tile label="Storage" value={`${m.storage_gb} GB`} />
              <Tile label="Guest uploads" value={m.guest_uploads} />
              <Tile label="Studio uploads" value={m.studio_uploads} />
              <Tile label="Galleries" value={m.galleries} />
              <Tile label="Failed uploads" value={m.failed_uploads} warn={m.failed_uploads > 0} />
            </div>
            <div className="lux-glass p-5">
              <h2 className="font-heading text-sm uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Busiest events</h2>
              {(m.top_events || []).length === 0 ? <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No activity yet.</div>
                : (
                  <div className="grid gap-1.5">
                    <div className="grid grid-cols-4 text-[10px] uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>
                      <span>Event</span><span className="text-right">Uploads</span><span className="text-right">Scans</span><span className="text-right">Storage</span>
                    </div>
                    {m.top_events.map((e) => (
                      <div key={e.wedding_id} className="grid grid-cols-4 py-1.5 border-t text-sm" style={{ borderColor: 'var(--lux-border)', color: 'var(--lux-text)' }}>
                        <span className="truncate">{e.wedding_id}</span>
                        <span className="text-right">{e.uploads}</span>
                        <span className="text-right">{e.scans}</span>
                        <span className="text-right">{e.storage_mb} MB</span>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function Tile({ label, value, sub, warn }) {
  return <div className="lux-glass p-4"><div className="text-[10px] uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div><div className="font-display text-2xl" style={{ color: warn ? '#ff9a9a' : 'var(--lux-text)' }}>{value}</div>{sub && <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{sub}</div>}</div>;
}
