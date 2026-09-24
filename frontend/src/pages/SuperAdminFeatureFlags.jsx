/* SuperAdminFeatureFlags — Phase 11. Toggle experimental / future features on/off.
   /super-admin/feature-flags (admin_token). */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2, Flag, ArrowLeft } from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });

export default function SuperAdminFeatureFlags() {
  const navigate = useNavigate();
  const [flags, setFlags] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => axios.get(`${API_URL}/api/admin/feature-flags`, authHdr())
    .then(({ data }) => setFlags(data?.flags || []))
    .catch(() => setFlags([]));
  useEffect(() => { load(); }, []);

  const toggle = async (f) => {
    setBusy(f.key);
    try {
      await axios.post(`${API_URL}/api/admin/feature-flags`, { key: f.key, label: f.label, description: f.description, enabled: !f.enabled }, authHdr());
      setFlags((rows) => rows.map((r) => r.key === f.key ? { ...r, enabled: !r.enabled } : r));
    } catch { /* noop */ } finally { setBusy(''); }
  };

  if (flags === null) return <div className="luxe min-h-screen grid place-items-center"><Loader2 className="w-8 h-8 animate-spin" style={{ color: '#D4AF37' }} /></div>;

  return (
    <div className="luxe min-h-screen px-6 py-10" data-testid="feature-flags-page">
      <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost text-xs mb-5"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
        <div className="lux-eyebrow mb-2 flex items-center gap-2"><Flag className="w-3.5 h-3.5" /> Platform</div>
        <h1 className="font-display text-3xl mb-1" style={{ color: 'var(--lux-text)' }}>Feature flags</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>Turn experimental and future features on or off across the platform.</p>

        <div className="space-y-3">
          {flags.map((f) => (
            <div key={f.key} className="lux-glass p-4 flex items-center justify-between gap-4" data-testid={`flag-${f.key}`}>
              <div className="min-w-0">
                <div className="font-medium" style={{ color: 'var(--lux-text)' }}>{f.label || f.key}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>{f.description}</div>
                <code className="text-[10px]" style={{ color: 'var(--lux-text-faint)' }}>{f.key}</code>
              </div>
              <button onClick={() => toggle(f)} disabled={busy === f.key} className="relative w-11 h-6 rounded-full shrink-0" data-testid={`flag-toggle-${f.key}`}
                style={{ background: f.enabled ? 'linear-gradient(90deg,#E8C97A,#D4AF37)' : 'rgba(255,255,255,0.15)' }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: f.enabled ? '22px' : '2px' }} />
              </button>
            </div>
          ))}
          {flags.length === 0 && <div className="lux-glass p-8 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>No flags. Sign in as super-admin.</div>}
        </div>
      </div>
    </div>
  );
}
