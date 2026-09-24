import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  ArrowLeft, Check, X, Star, MessageSquare, Trash2, Loader2,
  Inbox, ShieldCheck, ShieldOff, Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] } }),
};

/**
 * PROMPT 07 — Wishes moderation queue
 */
function WishesManagement() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  // BUG 15 FIX: redirect logged-out visitors to /admin/login.
  const { admin, loading: authLoading } = useAuth();
  const [tab, setTab] = useState('pending');
  const [wishes, setWishes] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, featured: 0 });
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !admin) {
      navigate('/studio/login', { replace: true });
    }
  }, [authLoading, admin, navigate]);

  const getAuth = () => {
    // BUG 13 FIX: AuthContext stores the photographer JWT under `admin_token`.
    const token = localStorage.getItem('admin_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const load = useCallback(async (status = tab) => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_URL}/api/admin/profiles/${profileId}/wishes`, {
        params: { status },
        headers: getAuth(),
      });
      setWishes(r.data?.wishes || []);
      setCounts(r.data?.counts || { pending: 0, approved: 0, rejected: 0, featured: 0 });
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, tab]);

  useEffect(() => { load(tab); /* eslint-disable-next-line */ }, [tab]);

  const approve = async (id) => {
    await axios.post(`${API_URL}/api/admin/profiles/${profileId}/wishes/${id}/approve`, {}, { headers: getAuth() });
    load(tab);
  };
  const reject = async (id) => {
    await axios.post(`${API_URL}/api/admin/profiles/${profileId}/wishes/${id}/reject`, {}, { headers: getAuth() });
    load(tab);
  };
  const toggleFeature = async (id) => {
    await axios.post(`${API_URL}/api/admin/profiles/${profileId}/wishes/${id}/feature`, {}, { headers: getAuth() });
    load(tab);
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this wish permanently?')) return;
    await axios.delete(`${API_URL}/api/admin/profiles/${profileId}/wishes/${id}`, { headers: getAuth() });
    load(tab);
  };

  const bulkApprove = async () => {
    if (!counts.pending) return;
    if (!window.confirm(`Approve all ${counts.pending} pending wishes?`)) return;
    setBulkBusy(true);
    try {
      await axios.post(`${API_URL}/api/admin/profiles/${profileId}/wishes/bulk-approve`, {}, { headers: getAuth() });
      await load(tab);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="luxe min-h-screen" data-testid="wishes-management">
      <div className="px-4 md:px-12 py-8 md:py-10 max-w-[1200px] mx-auto">
        <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost mb-6 inline-flex items-center gap-2" data-testid="wm-back">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {/* Hero */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" className="mb-10">
          <span className="lux-eyebrow block mb-3">◆ Words of Love</span>
          <h1 className="font-display text-[2.2rem] md:text-[3.6rem] leading-[1.05]" style={{ color: 'var(--lux-text)' }}>
            Wishes <span className="font-script italic text-gold">moderation</span>
          </h1>
          <p className="mt-3 text-sm md:text-base max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
            Approve, reject and feature guest wishes. Featured wishes shine on the invitation in burgundy spotlight cards (max 3).
          </p>
        </motion.div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b" style={{ borderColor: 'rgba(212,175,55,0.18)' }} data-testid="wm-tabs">
          <TabBtn id="pending" active={tab === 'pending'} label="Pending" count={counts.pending} onClick={() => setTab('pending')} accent />
          <TabBtn id="approved" active={tab === 'approved'} label="Approved" count={counts.approved} onClick={() => setTab('approved')} />
          <TabBtn id="rejected" active={tab === 'rejected'} label="Rejected" count={counts.rejected} onClick={() => setTab('rejected')} />
          <div className="ml-auto flex items-center gap-2 pb-3 text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
            <Sparkles className="w-3.5 h-3.5 text-gold" /> {counts.featured}/3 featured
          </div>
        </div>

        {/* Bulk approve */}
        {tab === 'pending' && counts.pending > 0 && (
          <button onClick={bulkApprove} disabled={bulkBusy}
            className="lux-btn mb-6 inline-flex items-center gap-2"
            data-testid="wm-bulk-approve">
            {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Approve all {counts.pending} pending
          </button>
        )}

        {/* Wish cards */}
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin" style={{ color: '#D4AF37' }} /></div>
        ) : wishes.length === 0 ? (
          <div className="lux-glass p-10 text-center" data-testid="wm-empty">
            <Inbox className="w-7 h-7 mx-auto mb-3" style={{ color: '#D4AF37' }} />
            <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              {tab === 'pending' ? "No new wishes — you're all caught up." :
               tab === 'approved' ? 'No approved wishes yet.' :
               'No rejected wishes.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5" data-testid="wm-list">
            <AnimatePresence>
              {wishes.map((w, i) => (
                <motion.div
                  key={w.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.04, duration: 0.5 }}
                  className="lux-glass p-5 md:p-6 relative"
                  style={w.is_featured ? {
                    background: 'linear-gradient(160deg, rgba(74,14,42,0.55), rgba(26,20,15,0.85))',
                    border: '1px solid rgba(212,175,55,0.5)',
                  } : {}}
                  data-testid={`wm-wish-${w.id}`}
                >
                  {w.is_featured && (
                    <div className="absolute -top-2 -right-2 w-9 h-9 grid place-items-center rounded-full"
                      style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
                      <Star className="w-4 h-4" style={{ color: '#1A0810' }} fill="#1A0810" />
                    </div>
                  )}
                  <p className="font-display italic text-[1.05rem] leading-[1.6] mb-4" style={{ color: 'var(--lux-text)' }}>
                    "{w.message}"
                  </p>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-script text-xl text-gold italic">— {w.guest_name}</div>
                      <div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                        {w.relationship || '—'} · {new Date(w.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {w.status !== 'approved' && (
                        <ActionBtn onClick={() => approve(w.id)} title="Approve" testid={`wm-approve-${w.id}`}
                          color="#22c55e">
                          <Check className="w-4 h-4" />
                        </ActionBtn>
                      )}
                      {w.status !== 'rejected' && (
                        <ActionBtn onClick={() => reject(w.id)} title="Reject" testid={`wm-reject-${w.id}`}
                          color="#ef4444">
                          <X className="w-4 h-4" />
                        </ActionBtn>
                      )}
                      <ActionBtn onClick={() => toggleFeature(w.id)} title={w.is_featured ? 'Unfeature' : 'Feature'}
                        testid={`wm-feature-${w.id}`}
                        color={w.is_featured ? '#D4AF37' : 'rgba(212,175,55,0.5)'}>
                        <Star className="w-4 h-4" fill={w.is_featured ? '#D4AF37' : 'none'} />
                      </ActionBtn>
                      <ActionBtn onClick={() => remove(w.id)} title="Delete"
                        testid={`wm-delete-${w.id}`} color="rgba(255,255,255,0.4)">
                        <Trash2 className="w-4 h-4" />
                      </ActionBtn>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

const TabBtn = ({ active, label, count, onClick, accent }) => (
  <button
    onClick={onClick}
    className="px-4 py-3 text-sm tracking-wide inline-flex items-center gap-2 relative transition-all"
    style={{
      color: active ? '#D4AF37' : 'var(--lux-text-muted)',
      fontFamily: 'DM Sans, sans-serif',
    }}
    data-testid={`wm-tab-${label.toLowerCase()}`}
  >
    {label}
    {count > 0 && (
      <span className="text-[10px] px-2 py-0.5 rounded-full"
        style={{
          background: accent && count > 0 ? '#dc2626' : 'rgba(212,175,55,0.18)',
          color: accent && count > 0 ? '#FFF8DC' : '#D4AF37',
        }}>{count}</span>
    )}
    {active && <span className="absolute bottom-0 left-0 right-0 h-px" style={{ background: '#D4AF37' }} />}
  </button>
);

const ActionBtn = ({ onClick, title, color, children, testid }) => (
  <button onClick={onClick} title={title}
    className="w-9 h-9 rounded-lg grid place-items-center transition-all hover:scale-105"
    style={{ background: 'var(--lux-panel)', color, border: `1px solid ${color}33` }}
    data-testid={testid}
  >
    {children}
  </button>
);

export default WishesManagement;
