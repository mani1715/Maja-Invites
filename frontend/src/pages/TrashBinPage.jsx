import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ArrowLeft, Trash2, ArchiveRestore, Calendar, AlertTriangle } from 'lucide-react';
import BulkActionBar from '@/components/dashboard/BulkActionBar';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// BUG A FIX: all trash endpoints are photographer-only — they fail with
// 401 when called without a Bearer token. Build it once here so every axios
// call below carries it.
const authHeaders = () => {
  const tok = localStorage.getItem('admin_token');
  return tok ? { Authorization: `Bearer ${tok}` } : {};
};

/**
 * TrashBinPage — lists soft-deleted weddings within 30-day retention window.
 * Supports per-row restore / purge and bulk action via shared BulkActionBar.
 */
const TrashBinPage = () => {
  const navigate = useNavigate();
  // BUG A FIX: previously this page had zero auth handling — a logged-out
  // visitor saw a blank page (silent 401). Redirect to /admin/login.
  const { admin, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login', { replace: true });
  }, [authLoading, admin, navigate]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/profiles/trash`, { headers: authHeaders() });
      setItems(r.data?.items || []);
    } catch (_) { setItems([]); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!authLoading && admin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, admin]);

  const toggleSel = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const clearSel = () => setSelected(new Set());

  const restoreOne = async (id) => {
    await axios.post(`${API_URL}/api/admin/profiles/${id}/restore-trash`, {}, { headers: authHeaders() });
    load();
  };
  const purgeOne = async (id) => {
    if (!window.confirm('Permanently delete this wedding? This cannot be undone.')) return;
    await axios.delete(`${API_URL}/api/admin/profiles/${id}/purge`, { headers: authHeaders() });
    load();
  };

  const bulkRestore = async () => {
    const ids = Array.from(selected);
    await axios.post(`${API_URL}/api/admin/profiles/bulk-action`, { ids, action: 'restore' }, { headers: authHeaders() });
    clearSel(); load();
  };
  const bulkPurge = async () => {
    if (!window.confirm(`Permanently delete ${selected.size} weddings? This cannot be undone.`)) return;
    const ids = Array.from(selected);
    await axios.post(`${API_URL}/api/admin/profiles/bulk-action`, { ids, action: 'purge' }, { headers: authHeaders() });
    clearSel(); load();
  };

  return (
    <div className="luxe min-h-screen" data-testid="trash-bin-page">
      <div className="px-6 md:px-12 py-10 max-w-[1300px] mx-auto">
        <button onClick={() => navigate('/studio/dashboard')}
          className="lux-btn lux-btn-ghost mb-6" data-testid="trash-back">
          <ArrowLeft className="w-4 h-4" /> Studio
        </button>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <span className="lux-eyebrow block mb-2">◆ Trash</span>
          <h1 className="font-display text-[2.4rem] md:text-[3.4rem]" style={{ color: 'var(--lux-text)' }}>
            Trash <span className="font-script italic text-gold">bin</span>
          </h1>
          <p className="mt-3 text-sm max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
            Deleted weddings stay here for <span className="text-gold">30 days</span>, then are permanently removed.
            Restore them anytime before that window closes.
          </p>
        </motion.div>

        <div className="mt-8" data-testid="trash-list">
          {loading ? (
            <div className="grid place-items-center py-20"><div className="lux-mandala" /></div>
          ) : items.length === 0 ? (
            <div className="lux-glass p-12 text-center" data-testid="trash-empty">
              <Trash2 className="w-7 h-7 mx-auto mb-3" style={{ color: '#D4AF37' }} />
              <h3 className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>Trash is empty</h3>
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                Deleted weddings will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {items.map((p) => {
                const deletedAt = p.deleted_at ? new Date(p.deleted_at) : null;
                const daysLeft = deletedAt
                  ? Math.max(0, 30 - Math.floor((Date.now() - deletedAt.getTime()) / 86400000))
                  : null;
                const sel = selected.has(p.id);
                return (
                  <motion.div key={p.id} layout
                    className="lux-glass p-6 relative"
                    style={sel ? { boxShadow: '0 0 0 2px var(--lux-gold)' } : {}}
                    data-testid={`trash-card-${p.id}`}>
                    <label className="absolute top-3 left-3">
                      <input type="checkbox" checked={sel} onChange={() => toggleSel(p.id)}
                        data-testid={`trash-select-${p.id}`} />
                    </label>
                    <h3 className="font-display text-xl pl-6" style={{ color: 'var(--lux-text)' }}>
                      {p.bride_name} <span className="text-gold italic font-script">&</span> {p.groom_name}
                    </h3>
                    {p.event_date && (
                      <div className="flex items-center gap-2 text-xs mt-2 pl-6"
                        style={{ color: 'var(--lux-text-muted)' }}>
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(p.event_date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                    <div className="lux-hairline my-3" />
                    <div className="text-xs flex items-center gap-2 mb-4"
                      style={{ color: daysLeft <= 5 ? '#EF6E6E' : 'var(--lux-text)' }}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {daysLeft != null ? `${daysLeft} days left before permanent deletion` : 'Pending purge'}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => restoreOne(p.id)} className="lux-btn lux-btn-ghost text-xs"
                        data-testid={`trash-restore-${p.id}`}>
                        <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                      </button>
                      <button onClick={() => purgeOne(p.id)} className="lux-btn text-xs"
                        style={{ background: 'linear-gradient(135deg,#7A1F1F,#A82E2E)', color: '#fff' }}
                        data-testid={`trash-purge-${p.id}`}>
                        <Trash2 className="w-3.5 h-3.5" /> Delete forever
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <BulkActionBar
        selectedCount={selected.size}
        onClear={clearSel}
        onUnarchive={bulkRestore}
        onDelete={bulkPurge}
        context="trash"
      />
    </div>
  );
};

export default TrashBinPage;
