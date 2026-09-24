import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, MinusCircle, Clock } from 'lucide-react';
import '@/styles/luxury.css';

/**
 * SuperAdminSystemHealth — live ops console (Phase 2). Polls
 * /api/admin/system/health every 15s: API / DB / S3 / Rekognition / CloudFront /
 * email / SMS / Google-Drive pool / queue, plus background-job heartbeats with
 * staleness. All signals are real (see backend system_health.py) — `not_configured`
 * simply means that provider's keys aren't set yet.
 */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const REFRESH_MS = 15000;

const STATUS = {
  ok:             { color: '#7BD88F', Icon: CheckCircle2, label: 'Operational' },
  degraded:       { color: '#E8C97A', Icon: AlertTriangle, label: 'Degraded' },
  down:           { color: '#ff7a7a', Icon: XCircle, label: 'Down' },
  not_configured: { color: 'var(--lux-text-muted)', Icon: MinusCircle, label: 'Not configured' },
  unknown:        { color: 'var(--lux-text-muted)', Icon: MinusCircle, label: 'Unknown' },
};

export default function SuperAdminSystemHealth() {
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/system/health`);
      setHealth(data); setErr(''); setUpdatedAt(new Date());
    } catch (e) {
      setErr(e?.response?.status === 403 ? 'Admin access required.' : 'Could not load system health.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) { if (timer.current) clearInterval(timer.current); return undefined; }
    timer.current = setInterval(load, REFRESH_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [auto, load]);

  const overall = health?.overall || 'unknown';
  const O = STATUS[overall] || STATUS.unknown;

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <Activity style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>System health</h1>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh
            </label>
            <button onClick={load} className="lux-btn lux-btn-ghost !px-3 !py-2" data-testid="health-refresh">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>

        {err && <div className="lux-glass p-4 mb-4" style={{ color: '#ff9a9a' }}>{err}</div>}

        {/* Overall banner */}
        <div className="lux-glass p-5 mb-6 flex items-center gap-4"
          style={{ border: `1px solid ${O.color}55` }} data-testid="health-overall">
          <O.Icon style={{ color: O.color, width: 34, height: 34 }} />
          <div>
            <div className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>
              {overall === 'ok' ? 'All systems operational' : overall === 'degraded' ? 'Degraded — attention needed' : overall === 'down' ? 'Outage' : 'Status unknown'}
            </div>
            <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading…'}
              {auto ? ` · auto-refresh ${REFRESH_MS / 1000}s` : ''}
            </div>
          </div>
        </div>

        {/* Component grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-8">
          {(health?.components || []).map((c) => {
            const S = STATUS[c.status] || STATUS.unknown;
            return (
              <div key={c.key} className="lux-glass p-4" data-testid={`health-${c.key}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-heading" style={{ color: 'var(--lux-text)' }}>{c.label}</span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide"
                    style={{ color: S.color }}>
                    <S.Icon className="w-3.5 h-3.5" /> {S.label}
                  </span>
                </div>
                <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                  {c.detail}
                  {typeof c.latency_ms === 'number' ? ` · ${c.latency_ms} ms` : ''}
                </div>
              </div>
            );
          })}
        </div>

        {/* Background jobs */}
        <h2 className="font-heading text-sm tracking-[0.2em] uppercase mb-3" style={{ color: 'var(--lux-text-muted)' }}>
          Background jobs
        </h2>
        {(!health?.jobs || health.jobs.length === 0) ? (
          <div className="lux-glass p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            No job has reported a heartbeat yet. (Jobs record their last run when they execute.)
          </div>
        ) : (
          <div className="grid gap-2">
            {health.jobs.map((j) => (
              <div key={j.name} className="lux-glass p-3 flex items-center gap-3" data-testid={`health-job-${j.name}`}>
                <Clock className="w-4 h-4" style={{ color: j.stale ? '#ff9a9a' : '#7BD88F' }} />
                <div className="flex-1 min-w-0">
                  <div style={{ color: 'var(--lux-text)' }}>{j.name}</div>
                  <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                    {j.last_run ? `last run ${new Date(j.last_run).toLocaleString()}` : 'never run'}
                    {j.age_hours != null ? ` · ${j.age_hours}h ago` : ''}
                  </div>
                </div>
                {j.stale && (
                  <span className="text-[10px] uppercase px-2 py-1 rounded-full"
                    style={{ color: '#ff9a9a', border: '1px solid rgba(255,120,120,0.4)' }}>Stale</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
