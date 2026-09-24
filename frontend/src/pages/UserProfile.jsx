import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ArrowLeft, Calendar, MapPin, Copy, Check, ExternalLink, Edit3, Trash2,
  AlertTriangle, X, Save, Camera, ShoppingBag,
} from 'lucide-react';
import { useUserAuth } from '@/context/UserAuthContext';
import '../styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fieldStyle = {
  width: '100%', padding: '0.7rem 0.9rem', background: 'transparent', color: 'var(--lux-text)',
  border: '1px solid var(--lux-border)', borderRadius: '0.45rem', outline: 'none',
  caretColor: '#D4AF37', fontSize: '0.9rem',
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
};
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
};
const inputDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toISOString().slice(0, 10); } catch { return ''; }
};

export default function UserProfile() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, loading } = useUserAuth();
  const [tab, setTab] = useState('invitations');
  const [profiles, setProfiles] = useState([]);
  const [busy, setBusy] = useState(true);
  const [insights, setInsights] = useState({}); // { profileId: {rsvp, wishes, gallery} }
  const [orders, setOrders] = useState([]); // purchase history (store orders)
  const [copied, setCopied] = useState(null);
  const [editing, setEditing] = useState(null);  // profile being edited
  const [deleting, setDeleting] = useState(null); // profile pending deletion
  const [toast, setToast] = useState('');

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    setParams((prev) => { const p = new URLSearchParams(prev); p.set('tab', tab); return p; }, { replace: true });
  }, [tab, setParams]);

  const loadAll = async () => {
    setBusy(true);
    try {
      const p = await axios.get(`${API_URL}/api/users/profiles`, { withCredentials: true });
      const list = p.data?.profiles || [];
      setProfiles(list);
      // Fetch per-invitation RSVP / wishes / gallery counts (best-effort).
      const entries = await Promise.all(list.map((pr) =>
        axios.get(`${API_URL}/api/users/profiles/${pr.id}/insights`, { withCredentials: true })
          .then((r) => [pr.id, r.data]).catch(() => [pr.id, null])));
      setInsights(Object.fromEntries(entries.filter(([, v]) => v)));
      // Purchase history (design + pack + details + link) — best-effort.
      axios.get(`${API_URL}/api/store/my-orders`, { withCredentials: true })
        .then((r) => setOrders(r.data?.orders || [])).catch(() => setOrders([]));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate('/', { replace: true }); return; }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const copyLink = (slug) => {
    const url = `${window.location.origin}/invite/${slug}`;
    navigator.clipboard?.writeText(url);
    setCopied(slug);
    setTimeout(() => setCopied(null), 1500);
  };

  const saveEdit = async (form) => {
    try {
      const payload = { ...form };
      if (payload.event_date) {
        payload.event_date = new Date(payload.event_date).toISOString();
      }
      const { data } = await axios.patch(
        `${API_URL}/api/users/profiles/${editing.id}`,
        payload,
        { withCredentials: true },
      );
      setProfiles((arr) => arr.map((p) => (p.id === editing.id ? { ...p, ...(data?.profile || {}) } : p)));
      setEditing(null);
      flash('Invitation updated');
    } catch (err) {
      flash(err?.response?.data?.detail || 'Update failed');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await axios.delete(`${API_URL}/api/users/profiles/${deleting.id}`, { withCredentials: true });
      setProfiles((arr) => arr.filter((p) => p.id !== deleting.id));
      flash('Invitation deleted');
    } catch (err) {
      flash(err?.response?.data?.detail || 'Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  if (loading || busy) {
    return (
      <div className="luxe min-h-screen grid place-items-center" data-testid="user-profile-loading">
        <Sparkles className="w-6 h-6 animate-pulse text-gold" />
      </div>
    );
  }

  return (
    <div className="luxe min-h-screen px-5 md:px-12 py-8 md:py-12" data-testid="user-profile">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <button
            onClick={() => navigate('/user/dashboard')}
            className="text-[10px] tracking-[0.25em] uppercase mb-3 inline-flex items-center gap-2 hover:opacity-80"
            style={{ color: 'var(--lux-text-muted)' }}
            data-testid="profile-back-btn"
          >
            <ArrowLeft className="w-3 h-3" /> Back to studio
          </button>
          <span className="lux-eyebrow block mb-2">◆ My Profile</span>
          <h1 className="font-display text-3xl md:text-4xl" style={{ color: 'var(--lux-text)' }}>
            Welcome back, <span className="font-script italic text-gold">{user?.name?.split(' ')[0] || 'friend'}.</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            {user?.email}{user?.phone ? ` · ${user.phone}` : ''}
          </p>
        </div>
      </div>

      {/* Privacy & Data (DPDP) */}
      <div className="lux-glass p-5 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        data-testid="privacy-data-section">
        <div>
          <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>
            Privacy &amp; data
          </div>
          <p className="text-sm" style={{ color: 'var(--lux-text)' }}>
            Download a copy of your data, or permanently delete your account.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            data-testid="export-my-data"
            className="lux-btn-ghost text-xs px-4 py-2"
            onClick={async () => {
              try {
                const r = await axios.get(`${API_URL}/api/account/export`, { withCredentials: true });
                const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'my-data-export.json'; a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                alert('Could not export your data. Please try again.');
              }
            }}
          >
            Download my data
          </button>
          <button
            data-testid="delete-my-account"
            className="text-xs px-4 py-2 rounded"
            style={{ border: '1px solid rgba(220,80,80,0.5)', color: '#fca5a5' }}
            onClick={async () => {
              if (!window.confirm('Permanently delete your account? This anonymizes your data and cannot be undone.')) return;
              try {
                await axios.post(`${API_URL}/api/account/delete-request`, { confirm: true }, { withCredentials: true });
                alert('Your account has been deleted.');
                window.location.href = '/';
              } catch (e) {
                alert(e?.response?.data?.detail || 'Could not delete your account. Please contact support.');
              }
            }}
          >
            Delete my account
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 lux-glass p-1.5 w-fit" data-testid="profile-tabs">
        {[
          { id: 'invitations', label: `My Invitations · ${profiles.length}` },
          { id: 'orders', label: `My Orders · ${orders.length}` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded text-[10px] tracking-[0.22em] uppercase transition-all"
            style={{
              background: tab === t.id ? 'linear-gradient(135deg,#D4AF37,#B8941F)' : 'transparent',
              color: tab === t.id ? '#16110C' : 'var(--lux-text)',
            }}
            data-testid={`tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* My Invitations */}
      {tab === 'invitations' && (
        <div data-testid="invitations-tab">
          {profiles.length === 0 ? (
            <div className="lux-glass p-12 text-center" data-testid="invitations-empty">
              <Sparkles className="w-10 h-10 text-gold mx-auto mb-4" />
              <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>
                No invitations yet.
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>
                Create your first wedding invitation in minutes.
              </p>
              <button
                onClick={() => navigate('/user/create-invitation')}
                className="lux-btn inline-flex"
                data-testid="invitations-empty-cta"
              >
                Create an invitation
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="invitations-grid">
              {profiles.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="lux-glass p-5 flex flex-col"
                  data-testid={`invitation-card-${p.id}`}
                >
                  <div className="text-[10px] tracking-[0.25em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>
                    {p.event_type}
                  </div>
                  <h3 className="font-display text-xl leading-tight mb-2" style={{ color: 'var(--lux-text)' }}>
                    {p.groom_name} <span className="text-gold font-script italic">&</span> {p.bride_name}
                  </h3>
                  <div className="text-xs mb-1 inline-flex items-center gap-1.5" style={{ color: 'var(--lux-text)' }}>
                    <Calendar className="w-3 h-3 text-gold" /> {fmtDate(p.event_date)}
                  </div>
                  {(p.venue || p.city) && (
                    <div className="text-xs mb-3 inline-flex items-center gap-1.5" style={{ color: 'var(--lux-text)' }}>
                      <MapPin className="w-3 h-3 text-gold" /> {[p.venue, p.city].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {insights[p.id] && (
                    <div className="grid grid-cols-3 gap-2 mb-3 text-center" data-testid={`invitation-insights-${p.id}`}>
                      <Metric label="Coming" value={insights[p.id].rsvp?.coming ?? 0} />
                      <Metric label="Wishes" value={insights[p.id].wishes ?? 0} />
                      <Metric label="Photos" value={insights[p.id].gallery ?? 0} />
                    </div>
                  )}
                  <div className="text-[10px] mt-auto mb-3" style={{ color: 'var(--lux-text-faint)' }}>
                    Created {fmtDateTime(p.created_at)}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => window.open(p.invitation_link, '_blank')}
                      className="lux-btn lux-btn-ghost text-xs flex-1 justify-center"
                      data-testid={`invitation-view-${p.id}`}
                    >
                      <ExternalLink className="w-3 h-3" /> View
                    </button>
                    {p.slug && (
                      <button
                        onClick={() => window.open(`/invite/${p.slug}/live-gallery`, '_blank')}
                        className="lux-btn lux-btn-ghost text-xs flex-1 justify-center"
                        data-testid={`invitation-qr-upload-${p.id}`}
                      >
                        <Camera className="w-3 h-3" /> Photos
                      </button>
                    )}
                    <button
                      onClick={() => copyLink(p.slug)}
                      className="lux-btn lux-btn-ghost text-xs flex-1 justify-center"
                      data-testid={`invitation-copy-${p.id}`}
                    >
                      {copied === p.slug ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                    <button
                      onClick={() => setEditing(p)}
                      className="lux-btn lux-btn-ghost text-xs flex-1 justify-center"
                      data-testid={`invitation-edit-${p.id}`}
                    >
                      <Edit3 className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => setDeleting(p)}
                      className="lux-btn lux-btn-ghost text-xs flex-1 justify-center"
                      style={{ borderColor: 'rgba(255,80,80,0.45)', color: '#FFB47C' }}
                      data-testid={`invitation-delete-${p.id}`}
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My Orders — purchase history: design, pack, details, status, link */}
      {tab === 'orders' && (
        <div data-testid="orders-tab">
          {orders.length === 0 ? (
            <div className="lux-glass p-12 text-center" data-testid="orders-empty">
              <ShoppingBag className="w-10 h-10 text-gold mx-auto mb-4" />
              <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>No orders yet.</h3>
              <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>Buy a design and it'll show here — design, package, the details you gave, and your link.</p>
              <button onClick={() => navigate('/designs')} className="lux-btn inline-flex">Browse designs</button>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((o) => {
                const st = o.build_status || o.status;
                const delivered = o.build_status === 'delivered' && o.live_url;
                return (
                  <div key={o.id} className="lux-glass p-5" data-testid={`order-${o.id}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="font-medium" style={{ color: 'var(--lux-text)' }}>{o.design_name || o.design_id || 'Your design'}</div>
                        <div className="text-xs mt-1 flex flex-wrap items-center gap-2" style={{ color: 'var(--lux-text-muted)' }}>
                          {o.package_label && <span>{o.package_label}</span>}
                          <span>₹{Number(o.amount_inr || o.amount || 0).toLocaleString('en-IN')}</span>
                          {o.fulfillment_code && <span className="px-1.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.05)' }}>{o.fulfillment_code}</span>}
                          <span className="capitalize">{String(st || '').replace('_', ' ')}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {o.build_status === 'pending_info' && (
                          <button onClick={() => navigate(`/order/${o.id}/details`)} className="lux-btn text-xs" data-testid={`order-details-${o.id}`}>Enter details</button>
                        )}
                        {delivered && (
                          <a href={o.live_url} target="_blank" rel="noreferrer" className="lux-btn text-xs" data-testid={`order-view-${o.id}`}>View invitation</a>
                        )}
                      </div>
                    </div>
                    {o.info && Object.keys(o.info).length > 0 && (
                      <div className="mt-3 text-xs" style={{ color: 'var(--lux-text-faint)' }}>
                        Details submitted: {[o.info.bride_name, o.info.groom_name].filter(Boolean).join(' & ')}{o.info.event_date ? ` · ${o.info.event_date}` : ''}{o.info.venue ? ` · ${o.info.venue}` : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editing && (
          <EditInvitationModal
            profile={editing}
            onClose={() => setEditing(null)}
            onSave={saveEdit}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setDeleting(null)}
            className="fixed inset-0 z-50 grid place-items-center p-4"
            style={{ background: 'rgba(10,6,2,0.85)', backdropFilter: 'blur(8px)' }}
            data-testid="delete-confirm-modal"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="lux-glass p-7 max-w-md w-full"
            >
              <AlertTriangle className="w-9 h-9 mx-auto mb-3" style={{ color: '#FFB47C' }} />
              <h3 className="font-display text-xl text-center mb-2" style={{ color: 'var(--lux-text)' }}>
                Delete this invitation?
              </h3>
              <p className="text-sm text-center mb-5" style={{ color: 'var(--lux-text)' }}>
                <span className="font-display text-gold">{deleting.groom_name} & {deleting.bride_name}</span><br />
                This is permanent and cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleting(null)}
                  className="lux-btn lux-btn-ghost flex-1 justify-center"
                  data-testid="delete-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="lux-btn flex-1 justify-center"
                  style={{ background: 'linear-gradient(135deg,#8B0000,#5a0000)', color: '#FFD7C9' }}
                  data-testid="delete-confirm"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 lux-glass px-5 py-3 text-sm z-50"
            style={{ color: 'var(--lux-text)' }}
            data-testid="profile-toast"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EditInvitationModal({ profile, onClose, onSave }) {
  const [form, setForm] = useState({
    groom_name: profile.groom_name || '',
    bride_name: profile.bride_name || '',
    event_date: inputDate(profile.event_date),
    venue: profile.venue || '',
    city: profile.city || '',
    invitation_message: profile.invitation_message || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: 'rgba(10,6,2,0.85)', backdropFilter: 'blur(8px)' }}
      data-testid="edit-modal"
    >
      <motion.form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="lux-glass p-7 max-w-2xl w-full relative max-h-[90vh] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:opacity-80"
          style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}
          data-testid="edit-modal-close"
        >
          <X className="w-4 h-4" style={{ color: 'var(--lux-text)' }} />
        </button>
        <span className="lux-eyebrow block mb-2">◆ Edit Invitation</span>
        <h3 className="font-display text-2xl mb-5" style={{ color: 'var(--lux-text)' }}>
          Update <span className="italic font-script text-gold">your details.</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <label>
            <span className="text-[10px] tracking-[0.25em] uppercase block mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>Groom's name</span>
            <input style={fieldStyle} value={form.groom_name} onChange={set('groom_name')} data-testid="edit-groom-name" />
          </label>
          <label>
            <span className="text-[10px] tracking-[0.25em] uppercase block mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>Bride's name</span>
            <input style={fieldStyle} value={form.bride_name} onChange={set('bride_name')} data-testid="edit-bride-name" />
          </label>
          <label>
            <span className="text-[10px] tracking-[0.25em] uppercase block mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>Event date</span>
            <input type="date" style={fieldStyle} value={form.event_date} onChange={set('event_date')} data-testid="edit-event-date" />
          </label>
          <label>
            <span className="text-[10px] tracking-[0.25em] uppercase block mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>City</span>
            <input style={fieldStyle} value={form.city} onChange={set('city')} data-testid="edit-city" />
          </label>
          <label className="sm:col-span-2">
            <span className="text-[10px] tracking-[0.25em] uppercase block mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>Venue</span>
            <input style={fieldStyle} value={form.venue} onChange={set('venue')} data-testid="edit-venue" />
          </label>
          <label className="sm:col-span-2">
            <span className="text-[10px] tracking-[0.25em] uppercase block mb-1.5" style={{ color: 'var(--lux-text-muted)' }}>Invitation message</span>
            <textarea rows={3} style={fieldStyle} value={form.invitation_message} onChange={set('invitation_message')} data-testid="edit-message" />
          </label>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="lux-btn lux-btn-ghost flex-1 justify-center"
            data-testid="edit-cancel"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="lux-btn flex-1 justify-center"
            data-testid="edit-save"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

const Metric = ({ label, value }) => (
  <div className="rounded-lg py-2" style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
    <div className="font-display text-lg text-gold leading-none">{value}</div>
    <div className="text-[9px] tracking-[0.2em] uppercase mt-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
  </div>
);
