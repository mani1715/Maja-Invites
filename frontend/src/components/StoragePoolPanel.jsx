/**
 * StoragePoolPanel — super-admin Storage Overview (V1 multi-drive storage).
 *
 * Talks to /api/super-admin/storage/* (storage_pool_service.py):
 *   dashboard · accounts/connect · {id}/disable|enable|make-current|check ·
 *   by-photographer · by-event · failures (+retry) · alerts (+ack) · settings.
 *
 * Renders: pool totals, active drive, per-drive capacity bars + health chips,
 * connect-drive button (opens Google OAuth), enable/disable pool flag,
 * storage by photographer / by event, failed uploads + retry, alerts feed,
 * capacity forecast. Matches the lux design system (lux-glass, gold accents).
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  HardDrive, Plug, RefreshCw, AlertTriangle, CheckCircle2, PauseCircle,
  PlayCircle, Crown, Camera, CalendarDays, CloudUpload, Activity,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });

const fmtBytes = (n) => {
  const v = Number(n) || 0;
  if (v >= 1024 ** 4) return `${(v / 1024 ** 4).toFixed(2)} TB`;
  if (v >= 1024 ** 3) return `${(v / 1024 ** 3).toFixed(2)} GB`;
  if (v >= 1024 ** 2) return `${(v / 1024 ** 2).toFixed(1)} MB`;
  if (v >= 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${v} B`;
};

const STATUS_STYLE = {
  active:   { label: 'Active',   color: '#3E7C4F', bg: 'rgba(62,124,79,0.12)' },
  degraded: { label: 'Degraded', color: '#B4762A', bg: 'rgba(180,118,42,0.12)' },
  full:     { label: 'Full',     color: '#8A5A2B', bg: 'rgba(138,90,43,0.12)' },
  disabled: { label: 'Disabled', color: '#8B8578', bg: 'rgba(139,133,120,0.12)' },
};

function Chip({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.disabled;
  return (
    <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] tracking-[0.15em] uppercase font-semibold"
      style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

function Tile({ label, value, sub, icon: Icon }) {
  return (
    <div className="lux-glass p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[0.65rem] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
        {Icon && <Icon className="w-4 h-4" style={{ color: '#D4AF37' }} />}
      </div>
      <div className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>{sub}</div>}
    </div>
  );
}

export default function StoragePoolPanel() {
  const [data, setData] = useState(null);
  const [byPhotographer, setByPhotographer] = useState([]);
  const [byEvent, setByEvent] = useState([]);
  const [failures, setFailures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [view, setView] = useState('drives'); // drives | photographers | events | failures

  const load = useCallback(async () => {
    try {
      const [d, p, e, f] = await Promise.all([
        axios.get(`${API_URL}/api/super-admin/storage/dashboard`, authHdr()),
        axios.get(`${API_URL}/api/super-admin/storage/by-photographer?limit=25`, authHdr()),
        axios.get(`${API_URL}/api/super-admin/storage/by-event?limit=25`, authHdr()),
        axios.get(`${API_URL}/api/super-admin/storage/failures?limit=50`, authHdr()),
      ]);
      setData(d.data);
      setByPhotographer(p.data.items || []);
      setByEvent(e.data.items || []);
      setFailures(f.data.items || []);
    } catch (err) {
      setMsg(err?.response?.data?.detail || 'Could not load storage dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (label, fn) => {
    setBusy(label); setMsg('');
    try {
      await fn();
      await load();
    } catch (err) {
      setMsg(err?.response?.data?.detail || `Action failed: ${label}`);
    } finally {
      setBusy('');
    }
  };

  const connectDrive = () => act('connect', async () => {
    const r = await axios.get(`${API_URL}/api/super-admin/storage/accounts/connect`, authHdr());
    window.open(r.data.authorization_url, '_blank', 'noopener');
    setMsg('Google sign-in opened in a new tab — log into the STORAGE account you want to add, then come back and refresh.');
  });

  const togglePool = (enabled) => act('flag', () =>
    axios.put(`${API_URL}/api/super-admin/storage/settings`, { enabled }, authHdr()));

  const drive = (id, action) => act(`${action}:${id}`, () =>
    axios.post(`${API_URL}/api/super-admin/storage/accounts/${id}/${action}`, {}, authHdr()));

  const retryFailures = () => act('retry', () =>
    axios.post(`${API_URL}/api/super-admin/storage/failures/retry`, {}, authHdr()));

  const ackAlert = (id) => act(`ack:${id}`, () =>
    axios.post(`${API_URL}/api/super-admin/storage/alerts/${id}/ack`, {}, authHdr()));

  if (loading) {
    return <div className="lux-glass p-12 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading storage…</div>;
  }
  if (!data) {
    return <div className="lux-glass p-12 text-center" style={{ color: 'var(--lux-text-muted)' }}>{msg || 'Storage dashboard unavailable.'}</div>;
  }

  const forecast = data.forecast || {};
  const alerts = data.alerts || [];

  return (
    <div data-testid="storage-pool-panel">
      {/* Action bar */}
      <div className="lux-glass p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={connectDrive} className="lux-btn" disabled={!!busy} data-testid="connect-drive-btn">
            <Plug className="w-4 h-4" /> Connect Drive
          </button>
          <button onClick={() => togglePool(!data.enabled)} className="lux-btn lux-btn-ghost" disabled={!!busy}
            data-testid="pool-flag-btn">
            {data.enabled ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
            {data.enabled ? 'Pool: ON — click to pause' : 'Pool: OFF — click to enable'}
          </button>
          <button onClick={load} className="lux-btn lux-btn-ghost" disabled={!!busy}>
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
        {!data.configured && (
          <span className="text-xs" style={{ color: '#B4762A' }}>
            OAuth env not configured — set GOOGLE_CLIENT_ID / SECRET / PUBLIC_BASE_URL and register the storage callback.
          </span>
        )}
      </div>

      {msg && (
        <div className="lux-glass p-4 mb-6 text-sm" style={{ color: 'var(--lux-text)' }} data-testid="storage-msg">{msg}</div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="lux-glass p-5 mb-6" data-testid="storage-alerts">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4" style={{ color: '#B4762A' }} />
            <span className="text-xs tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text)' }}>Alerts</span>
          </div>
          {alerts.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 py-2" style={{ borderTop: '1px solid var(--lux-border)' }}>
              <div className="text-sm" style={{ color: a.severity === 'error' ? '#A33A2E' : 'var(--lux-text)' }}>
                <span className="uppercase text-[0.6rem] tracking-[0.2em] mr-2" style={{ color: 'var(--lux-text-muted)' }}>{a.kind}</span>
                {a.message}
                {a.occurrences > 1 && <span className="ml-2 text-xs" style={{ color: 'var(--lux-text-muted)' }}>×{a.occurrences}</span>}
              </div>
              <button onClick={() => ackAlert(a.id)} className="text-xs underline shrink-0" style={{ color: 'var(--lux-text-muted)' }}>
                Acknowledge
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Emergency capacity banner — pool below 10% remaining */}
      {data.emergency && (
        <div className="mb-6 p-4 rounded-xl flex items-center gap-3"
          style={{ background: 'rgba(139,0,0,0.2)', border: '1px solid rgba(255,80,80,0.5)', color: '#FFD7C9' }}
          data-testid="storage-emergency-banner">
          <Activity className="w-5 h-5 flex-shrink-0" />
          <div className="text-sm">
            <strong>Storage almost full — {data.remaining_pct}% remaining.</strong>{' '}
            {fmtBytes(data.remaining_bytes)} free
            {typeof data.days_remaining === 'number' ? ` · ~${data.days_remaining} day(s) left at current growth` : ''}.
            Connect another drive now to avoid upload failures.
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Tile label="Total Capacity" value={fmtBytes(data.total_bytes)} icon={HardDrive}
          sub={`${(data.accounts || []).filter((a) => a.status !== 'disabled').length} drive(s) in rotation`} />
        <Tile label="Used" value={fmtBytes(data.used_bytes)} icon={CloudUpload} sub={`${data.used_pct}% of pool`} />
        <Tile label="Remaining" value={fmtBytes(data.remaining_bytes)} icon={Activity}
          sub={typeof data.days_remaining === 'number'
            ? `~${data.days_remaining} days left at current growth`
            : (forecast.days_to_full ? `~${Math.round(forecast.days_to_full)} days at current growth` : 'forecast pending')} />
        <Tile label="Active Drive" value={data.active_drive ? (data.active_drive.label || data.active_drive.google_email || data.active_drive.id) : '—'}
          icon={Crown} sub={data.active_drive ? `${data.active_drive.used_pct}% used` : 'no active drive'} />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { id: 'drives', label: 'Drives', icon: HardDrive },
          { id: 'photographers', label: 'By Photographer', icon: Camera },
          { id: 'events', label: 'By Event', icon: CalendarDays },
          { id: 'failures', label: `Failures (${(data.uploads || {}).failed || 0})`, icon: AlertTriangle },
        ].map((t) => (
          <button key={t.id} onClick={() => setView(t.id)}
            className="px-4 py-1.5 rounded-full text-[0.65rem] tracking-[0.2em] uppercase transition-all"
            style={view === t.id
              ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
              : { background: 'transparent', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
            data-testid={`storage-view-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'drives' && (
        <div className="lux-glass p-6" data-testid="storage-drives">
          {(data.accounts || []).length === 0 && (
            <div className="text-center py-10" style={{ color: 'var(--lux-text-muted)' }}>
              No drives connected yet. Click <b>Connect Drive</b>, sign into your first storage Google account, and it joins the pool automatically.
            </div>
          )}
          {(data.accounts || []).map((a) => {
            const pct = Math.min(100, a.used_pct || 0);
            return (
              <div key={a.id} className="py-4" style={{ borderTop: '1px solid var(--lux-border)' }}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    {a.slot === 'current' && <Crown className="w-4 h-4" style={{ color: '#D4AF37' }} title="Active drive" />}
                    <span className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>
                      {a.label || a.google_email || a.id}
                    </span>
                    <Chip status={a.status} />
                    {a.last_health_ok_at && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#3E7C4F' }} title={`Healthy ${a.last_health_ok_at}`} />}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button onClick={() => drive(a.id, 'check')} className="underline" style={{ color: 'var(--lux-text-muted)' }} disabled={!!busy}>Check</button>
                    {a.slot !== 'current' && a.status === 'active' && (
                      <button onClick={() => drive(a.id, 'make-current')} className="underline" style={{ color: 'var(--lux-text-muted)' }} disabled={!!busy}>Make active</button>
                    )}
                    {a.status !== 'disabled'
                      ? <button onClick={() => drive(a.id, 'disable')} className="underline" style={{ color: '#A33A2E' }} disabled={!!busy}>Disable</button>
                      : <button onClick={() => drive(a.id, 'enable')} className="underline" style={{ color: '#3E7C4F' }} disabled={!!busy}>Enable</button>}
                  </div>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--lux-border)' }}>
                  <div className="h-full rounded-full" style={{
                    width: `${pct}%`,
                    background: pct >= 80 ? '#A33A2E' : pct >= 60 ? '#B4762A' : '#D4AF37',
                  }} />
                </div>
                <div className="flex justify-between mt-1 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                  <span>{fmtBytes(a.committed_bytes)} of {fmtBytes(a.capacity_bytes)} ({a.used_pct}%)</span>
                  <span>switches at {a.soft_limit_pct || 80}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'photographers' && (
        <div className="lux-glass p-6" data-testid="storage-by-photographer">
          {byPhotographer.length === 0
            ? <div className="text-center py-10" style={{ color: 'var(--lux-text-muted)' }}>No archived uploads yet.</div>
            : byPhotographer.map((r) => (
              <div key={r.photographer_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm" style={{ borderTop: '1px solid var(--lux-border)' }}>
                <span style={{ color: 'var(--lux-text)' }}>{r.photographer_id}</span>
                <span style={{ color: 'var(--lux-text-muted)' }}>
                  {fmtBytes(r.total_bytes)} · {r.file_count} file(s)
                  {r.portfolio_bytes ? ` · portfolio ${fmtBytes(r.portfolio_bytes)}` : ''}
                  {r.cloud_storage_bytes ? ` · cloud ${fmtBytes(r.cloud_storage_bytes)}` : ''}
                </span>
              </div>
            ))}
        </div>
      )}

      {view === 'events' && (
        <div className="lux-glass p-6" data-testid="storage-by-event">
          {byEvent.length === 0
            ? <div className="text-center py-10" style={{ color: 'var(--lux-text-muted)' }}>No event uploads archived yet.</div>
            : byEvent.map((r) => (
              <div key={r.event_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm" style={{ borderTop: '1px solid var(--lux-border)' }}>
                <span style={{ color: 'var(--lux-text)' }}>{r.event_id}</span>
                <span style={{ color: 'var(--lux-text-muted)' }}>
                  {fmtBytes(r.total_bytes)} · {r.file_count} file(s)
                  {r.qr_photos_bytes ? ` · QR ${fmtBytes(r.qr_photos_bytes)}` : ''}
                  {r.selfies_bytes ? ` · selfies ${fmtBytes(r.selfies_bytes)}` : ''}
                </span>
              </div>
            ))}
        </div>
      )}

      {view === 'failures' && (
        <div className="lux-glass p-6" data-testid="storage-failures">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text)' }}>
              Failed / deferred uploads · retried OK: {(data.uploads || {}).retried_ok || 0}
            </span>
            <button onClick={retryFailures} className="lux-btn" disabled={!!busy} data-testid="retry-failures-btn">
              <RefreshCw className="w-4 h-4" /> Retry now
            </button>
          </div>
          {failures.length === 0
            ? <div className="text-center py-10" style={{ color: 'var(--lux-text-muted)' }}>Nothing pending — all mirrors healthy.</div>
            : failures.map((l) => (
              <div key={l.id} className="py-3 text-sm" style={{ borderTop: '1px solid var(--lux-border)' }}>
                <div className="flex flex-wrap justify-between gap-2">
                  <span style={{ color: 'var(--lux-text)' }}>{l.filename} <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>({l.area})</span></span>
                  <Chip status={l.status === 'deferred' ? 'degraded' : 'disabled'} />
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                  {l.error} · retries {l.retry_count || 0}{l.source_ref ? '' : ' · no source (unrecoverable)'}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
