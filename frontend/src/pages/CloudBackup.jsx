import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  ArrowLeft, HardDrive, CheckCircle2, AlertTriangle, Loader2,
  Unlink, RefreshCw, FolderTree, Clock,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// ─────────────────────────────────────────────────────────────────────────
// Cloud Backup settings page
// ─────────────────────────────────────────────────────────────────────────
//   • Lets the studio connect / disconnect Google Drive in one click.
//   • Once connected, shows "Connected as you@gmail.com · last sync 2 h ago".
//   • Lists recent archive jobs (one row per published wedding) with status.
//   • The actual upload is triggered server-side from the publish flow; this
//     page is the configuration + audit surface.
// ─────────────────────────────────────────────────────────────────────────
export default function CloudBackup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [flash, setFlash] = useState(null);

  const headers = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem('admin_token')}`,
  }), []);

  const load = useCallback(async () => {
    try {
      const [s, j] = await Promise.all([
        axios.get(`${API_URL}/api/oauth/drive/status`, { headers: headers() }),
        axios.get(`${API_URL}/api/oauth/drive/jobs?limit=50`, { headers: headers() }),
      ]);
      setStatus(s.data);
      setJobs(j.data?.jobs || []);
    } catch (e) {
      setFlash({ type: 'err', text: 'Could not load Drive status.' });
    }
    setLoading(false);
  }, [headers]);

  useEffect(() => { load(); }, [load]);

  // OAuth callback redirects back here with ?drive_connected=…
  useEffect(() => {
    const flag = params.get('drive_connected');
    if (!flag) return;
    if (flag === 'success') setFlash({ type: 'ok', text: 'Google Drive connected ✓' });
    else if (flag === 'denied') setFlash({ type: 'err', text: 'You declined permissions on Google.' });
    else if (flag === 'missing_scope') setFlash({ type: 'err', text: 'Google did not grant the Drive scope. Try again and tick the access box.' });
    else if (flag === 'error') setFlash({ type: 'err', text: 'OAuth failed. Please try again.' });
  }, [params]);

  const onConnect = async () => {
    setConnecting(true);
    try {
      const r = await axios.get(`${API_URL}/api/oauth/drive/connect`, { headers: headers() });
      window.location.href = r.data.authorization_url;
    } catch (e) {
      setFlash({ type: 'err', text: e.response?.data?.detail || 'Could not start OAuth flow.' });
      setConnecting(false);
    }
  };

  const onDisconnect = async () => {
    if (!window.confirm('Disconnect Google Drive? Already-uploaded photos stay in your Drive — only future weddings will stop syncing.')) return;
    try {
      await axios.post(`${API_URL}/api/oauth/drive/disconnect`, {}, { headers: headers() });
      setFlash({ type: 'ok', text: 'Disconnected.' });
      load();
    } catch (e) {
      setFlash({ type: 'err', text: 'Disconnect failed.' });
    }
  };

  return (
    <div className="min-h-screen lux-page">
      <header className="lux-glass mb-8 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/studio/dashboard')} className="lux-icon-btn" data-testid="cloud-backup-back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <HardDrive className="w-5 h-5 text-gold" />
        <h1 className="text-xl tracking-[0.2em] uppercase" style={{ color: 'rgba(255,248,220,0.85)' }}>
          Cloud Backup
        </h1>
      </header>

      <div className="max-w-3xl mx-auto px-6 pb-20 space-y-6">
        {flash && (
          <div
            className={`lux-glass px-4 py-3 text-sm flex items-center gap-2 ${flash.type === 'ok' ? 'border-emerald-400/40' : 'border-rose-400/40'}`}
            data-testid="cloud-backup-flash"
          >
            {flash.type === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-300" /> : <AlertTriangle className="w-4 h-4 text-rose-300" />}
            <span style={{ color: 'rgba(255,248,220,0.85)' }}>{flash.text}</span>
          </div>
        )}

        {loading ? (
          <div className="lux-glass p-8 text-center text-sm" style={{ color: 'rgba(255,248,220,0.78)' }}>
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…
          </div>
        ) : (
          <>
            {/* Connection card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="lux-glass p-6"
              data-testid="drive-connection-card"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' }}
                >
                  <HardDrive className="w-6 h-6" style={{ color: '#D4AF37' }} />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg" style={{ color: 'rgba(255,248,220,0.92)' }}>Google Drive</h2>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,248,220,0.78)' }}>
                    Every published wedding's photos will auto-upload to{' '}
                    <span className="font-mono" style={{ color: '#D4AF37' }}>/MAJA Invites/&lt;wedding&gt;/photos/</span>
                  </p>

                  {status?.connected ? (
                    <div className="mt-4 flex flex-wrap items-center gap-4">
                      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
                        style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.4)', color: '#6EE7B7' }}
                        data-testid="drive-status-connected"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                        {status.google_email ? ` as ${status.google_email}` : ''}
                      </span>
                      {status.last_job && (
                        <span className="text-xs inline-flex items-center gap-1.5" style={{ color: 'rgba(255,248,220,0.78)' }}>
                          <Clock className="w-3.5 h-3.5" /> Last sync — {fmtTime(status.last_job.created_at)}
                        </span>
                      )}
                      <button onClick={onDisconnect} className="lux-btn lux-btn-ghost text-xs ml-auto"
                        data-testid="drive-disconnect">
                        <Unlink className="w-3.5 h-3.5" /> Disconnect
                      </button>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={onConnect}
                        disabled={connecting || !status?.configured}
                        className="lux-btn disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid="drive-connect-btn"
                      >
                        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                        Connect Google Drive
                      </button>
                      {!status?.configured && (
                        <span className="text-xs" style={{ color: 'rgba(244,114,182,0.85)' }}>
                          Server isn't configured for OAuth yet. Contact platform owner.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Folder layout hint */}
            <div className="lux-glass p-6">
              <div className="flex items-center gap-2 mb-3">
                <FolderTree className="w-4 h-4" style={{ color: '#D4AF37' }} />
                <span className="text-xs tracking-[0.2em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>
                  Folder Layout
                </span>
              </div>
              <pre className="text-xs font-mono whitespace-pre" style={{ color: 'rgba(255,248,220,0.72)' }}>
{`MAJA Invites/
└── Arjun-Priya-2026-12-15/
    └── photos/
        ├── photo_0001.jpg
        ├── photo_0002.jpg
        └── …`}
              </pre>
            </div>

            {/* Recent jobs */}
            <div className="lux-glass p-6">
              <div className="flex items-center gap-2 mb-4">
                <RefreshCw className="w-4 h-4" style={{ color: '#D4AF37' }} />
                <span className="text-xs tracking-[0.2em] uppercase" style={{ color: 'rgba(255,248,220,0.78)' }}>
                  Recent Archives
                </span>
                <button onClick={load} className="ml-auto lux-icon-btn" data-testid="drive-refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {jobs.length === 0 ? (
                <p className="text-xs italic" style={{ color: 'rgba(255,248,220,0.62)' }}>
                  No syncs yet. Once you publish a wedding (and have Drive connected) it'll show up here.
                </p>
              ) : (
                <table className="w-full text-sm" data-testid="drive-jobs-table">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest" style={{ color: 'rgba(255,248,220,0.7)' }}>
                      <th className="text-left py-2">When</th>
                      <th className="text-left py-2">Wedding</th>
                      <th className="text-left py-2">Status</th>
                      <th className="text-right py-2">Photos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id} className="border-t border-yellow-200/10" data-testid={`drive-job-${j.id}`}>
                        <td className="py-2 text-xs" style={{ color: 'rgba(255,248,220,0.82)' }}>{fmtTime(j.created_at)}</td>
                        <td className="py-2 text-xs font-mono" style={{ color: 'rgba(255,248,220,0.85)' }}>{(j.profile_id || '').slice(0, 8)}</td>
                        <td className="py-2 text-xs"><StatusBadge s={j.status} /></td>
                        <td className="py-2 text-xs text-right" style={{ color: 'rgba(255,248,220,0.8)' }}>
                          {j.uploaded_count ?? 0} / {j.total_count ?? '?'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const StatusBadge = ({ s }) => {
  const map = {
    completed: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)', color: '#6EE7B7', label: 'Completed' },
    running:   { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)', color: '#93C5FD', label: 'Running' },
    failed:    { bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.4)',  color: '#FDA4AF', label: 'Failed' },
  };
  const t = map[s] || { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.2)', color: 'rgba(255,248,220,0.85)', label: s };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider"
      style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.color }}
    >{t.label}</span>
  );
};

const fmtTime = (iso) => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.max(0, now - d);
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`;
    return d.toLocaleDateString();
  } catch { return iso; }
};
