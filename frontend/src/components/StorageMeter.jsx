// StorageMeter (Phase 8, HIGH-6) — always-visible storage usage.
// Shows Used / Remaining / Plan limit + a bar. Self-contained: fetches
// /api/pixora/storage (portfolio + all community media, one shared pool).
// Renders nothing on error so it can't disturb the page it's dropped into.
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { HardDrive, AlertTriangle } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const fmt = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

export default function StorageMeter({ compact = false }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/storage`, { headers: authHeaders() })
      .then(({ data }) => setS(data)).catch(() => setS(false));
  }, []);
  if (!s) return null;

  const pct = Math.min(100, Number(s.percent || 0));
  const near = pct >= 80;
  const full = !!s.full;
  const barColor = full ? '#e5484d' : near ? '#E8C97A' : '#3ECf8E';

  return (
    <div className={`lux-glass ${compact ? 'p-3' : 'p-4'}`} data-testid="storage-meter">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <HardDrive className="w-4 h-4" style={{ color: '#E8C97A' }} />
          <span className="lux-eyebrow">Storage</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
          {fmt(s.used_mb)} / {fmt(s.cap_mb)}
        </span>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--lux-panel)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
        <span>{fmt(s.remaining_mb)} remaining</span>
        <span>{pct}% used</span>
      </div>
      {(near || full) && (
        <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: full ? '#e5484d' : '#E8C97A' }}>
          <AlertTriangle className="w-3.5 h-3.5" />
          {full ? 'Storage full — ' : 'Almost full — '}
          <a href="/studio/plans" className="underline">upgrade for more space</a>
        </div>
      )}
    </div>
  );
}
