import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ScanFace, RefreshCw } from 'lucide-react';
import '@/styles/luxury.css';

/** SuperAdminFaceOps — Face Search Operations (Phase 7). Real usage + Rekognition status. */
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export default function SuperAdminFaceOps() {
  const [m, setM] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setM((await axios.get(`${API_URL}/api/admin/face-ops/overview`)).data); } catch (_) {}
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const t = m?.totals, rek = m?.rekognition;
  const rekOk = rek?.available;

  return (
    <div className="luxe" style={{ minHeight: '100vh', background: 'var(--lux-bg-solid)' }}>
      <div className="px-6 md:px-12 py-8" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="flex items-center gap-3 mb-6">
          <ScanFace style={{ color: '#E8C97A' }} />
          <h1 className="font-display text-3xl" style={{ color: 'var(--lux-text)' }}>Face search ops</h1>
          <button onClick={load} className="lux-btn lux-btn-ghost ml-auto !px-3 !py-2"><RefreshCw className="w-4 h-4" /></button>
        </div>

        {loading && !m ? <div className="lux-glass p-8 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div> : m && (
          <>
            <div className="lux-glass p-4 mb-6 flex items-center gap-3">
              <span className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Rekognition:</span>
              <span className="text-sm" style={{ color: rekOk ? '#7BD88F' : '#E8C97A' }}>
                {rekOk ? 'Connected' : `Not configured (${rek?.status})`}
              </span>
              {!rekOk && <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>— set AWS keys to enable indexing/search & reindex controls.</span>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              <Tile label="Collections (galleries)" value={t.collections} />
              <Tile label="Indexed photos" value={t.indexed_photos} sub={`of ${t.total_photos} total`} />
              <Tile label="Indexed faces" value={t.indexed_faces} />
              <Tile label="Searches" value={m.searches.total} sub={`${m.searches.last_30d} in 30d`} />
              <Tile label="Photo requests" value={m.photo_requests.total} sub={`${m.photo_requests.last_30d} in 30d`} />
              <Tile label="Failed indexing" value={t.failed_indexing} warn={t.failed_indexing > 0} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, warn }) {
  return (
    <div className="lux-glass p-4">
      <div className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
      <div className="font-display text-2xl" style={{ color: warn ? '#ff9a9a' : 'var(--lux-text)' }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{sub}</div>}
    </div>
  );
}
