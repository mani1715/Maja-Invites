import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import PanelTabs from '@/components/PanelTabs';
import { BarChart3, RefreshCw, QrCode, Database, ScanFace, ExternalLink } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * StudioInsights — a photographer's OWN analytics, scoped to their invitations.
 * QR / live-gallery activity, studio storage usage, and face-search stats — the
 * same signals the super-admin sees platform-wide, but only for this studio.
 * Reads GET /api/studio/insights.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const num = (n) => Number(n || 0).toLocaleString('en-IN');

export default function StudioInsights() {
  const [days, setDays] = useState(90);
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setM((await axios.get(`${API_URL}/api/studio/insights`, { params: { days } })).data); } catch (_) {}
    setLoading(false);
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const qr = m?.qr, st = m?.storage, fc = m?.face;
  const maxUp = m ? Math.max(1, ...qr.top_events.map((e) => e.uploads)) : 1;

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <PanelTabs active="/studio/insights" />
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Insights</h1>
          <div className="ml-auto flex items-center gap-2">
            <select className="lux-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={30}>30d</option><option value={90}>90d</option><option value={365}>365d</option>
            </select>
            <button onClick={load} className="lux-btn lux-btn-ghost !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>
        <p className="text-xs mb-6" style={{ color: 'var(--lux-text-muted)' }}>
          Your own numbers across {m ? m.owned_events : '—'} invitation{m && m.owned_events === 1 ? '' : 's'} — QR galleries, studio storage and face search. Nobody else's data appears here.
        </p>

        {loading && !m ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : m && (
          <>
            {/* QR / live gallery */}
            <Section icon={QrCode} title="QR & live galleries">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Kpi label="QR scans" value={num(qr.total_scans)} />
                <Kpi label="Photos uploaded" value={num(qr.total_uploads)} accent />
                <Kpi label="Guest / studio" value={`${num(qr.guest_uploads)} / ${num(qr.studio_uploads)}`} />
                <Kpi label="Scan → upload" value={`${qr.scan_to_upload_pct}%`} />
              </div>
              <div className="text-[11px] mb-2" style={{ color: 'var(--lux-text-muted)' }}>
                {qr.galleries} gallery{qr.galleries === 1 ? '' : 's'} · avg {qr.uploads_per_gallery_avg} uploads each · {qr.gallery_storage_gb} GB of gallery photos.
              </div>
              {qr.top_events.length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>No gallery activity yet — share a QR to start collecting guest photos.</div>
                : (
                  <div className="lux-glass p-4">
                    <div className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--lux-text-muted)' }}>Busiest events</div>
                    {qr.top_events.map((e) => (
                      <div key={e.wedding_id} className="mb-2.5">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="truncate" style={{ color: 'var(--lux-text)' }}>{e.name}</span>
                          <span className="shrink-0 ml-2" style={{ color: 'var(--lux-text-muted)' }}>
                            {num(e.uploads)} photos · {num(e.scans)} scans · {e.storage_mb} MB
                            {e.slug && <a href={`/invite/${e.slug}/live-gallery`} target="_blank" rel="noreferrer" className="inline-flex items-center ml-1.5" style={{ color: '#E8C97A' }}><ExternalLink className="w-3 h-3" /></a>}
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <div style={{ width: `${(e.uploads / maxUp) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </Section>

            {/* Storage */}
            <Section icon={Database} title="Studio storage">
              {!st.has_plan ? (
                <div className="lux-glass p-4 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                  You don't have a storage plan yet — cloud backup keeps a private copy of your originals.
                  <a href="/studio/plans" className="ml-1" style={{ color: '#E8C97A' }}>See storage plans →</a>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    <Kpi label="Used" value={`${st.backup_used_gb} GB`} accent />
                    <Kpi label="Quota" value={`${num(st.quota_gb)} GB`} />
                    <Kpi label="Used %" value={`${st.used_pct}%`} />
                    <Kpi label="Files" value={num(st.backup_files)} />
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden mb-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{ width: `${Math.min(100, st.used_pct)}%`, height: '100%', background: st.used_pct > 90 ? '#ff9a9a' : 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
                  </div>
                  {st.growth_monthly.length > 0 && (
                    <div className="text-[10px] mt-2" style={{ color: 'var(--lux-text-muted)' }}>
                      Recent: {st.growth_monthly.slice(-6).map((g) => `${g.month} +${g.added_gb}GB`).join(' · ')}
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* Face search */}
            <Section icon={ScanFace} title="Face search">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Indexed photos" value={num(fc.indexed_photos)} accent />
                <Kpi label="Faces indexed" value={num(fc.indexed_faces)} />
                <Kpi label="Searches (30d)" value={num(fc.searches_30d)} />
                <Kpi label="Photo requests (30d)" value={num(fc.photo_requests_30d)} />
              </div>
              <div className="text-[10px] mt-2" style={{ color: 'var(--lux-text-muted)' }}>
                {fc.collections} gallery{fc.collections === 1 ? '' : 's'} with indexed faces · {num(fc.total_photos)} photos total. Guests find their photos by selfie when face search is enabled.
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="w-4 h-4" style={{ color: '#E8C97A' }} />}
        <h2 className="font-heading text-sm uppercase tracking-[0.2em]" style={{ color: 'var(--lux-text-muted)' }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Kpi({ label, value, accent }) {
  return (
    <div className="lux-glass p-4" style={accent ? { border: '1px solid rgba(212,175,55,0.4)' } : undefined}>
      <div className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
      <div className="font-display text-2xl" style={{ color: accent ? '#E8C97A' : 'var(--lux-text)' }}>{value}</div>
    </div>
  );
}
