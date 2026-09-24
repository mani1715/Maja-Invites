import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import {
  LogOut, Copy, Check, ExternalLink, Eye, Users, Heart, Camera, Download,
  Star, Trash2, Plus, RefreshCw, BarChart3, Smartphone, Monitor, Loader2,
  CalendarDays, MessageSquareHeart, FileText,
} from 'lucide-react';
import { useClientAuth } from '@/context/ClientAuthContext';
import '../styles/luxury.css';

const TABS = [
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'rsvp', label: 'RSVP', icon: Users },
  { id: 'wishes', label: 'Wishes', icon: MessageSquareHeart },
  { id: 'contracts', label: 'Contracts', icon: FileText },
  { id: 'proofs', label: 'Proofs', icon: Camera },
];

const StatCard = ({ icon: Icon, label, value, sub }) => (
  <div className="lux-glass p-4 flex items-center gap-3">
    <span className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
      style={{ background: 'rgba(212,175,55,0.12)' }}>
      <Icon className="w-5 h-5 text-gold" />
    </span>
    <div className="min-w-0">
      <div className="font-display text-2xl leading-none" style={{ color: 'var(--lux-text)' }}>{value}</div>
      <div className="text-[11px] tracking-[0.15em] uppercase mt-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--lux-text-faint)' }}>{sub}</div>}
    </div>
  </div>
);

/** "2026-12-12T00:00:00" -> "12 December 2026". Returns the input untouched if
 *  it is not a date we can parse, so a surprise format degrades to the old
 *  behaviour instead of rendering "Invalid Date". */
const formatEventDate = (raw) => {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function ClientDashboard() {
  const navigate = useNavigate();
  const { event, clientApi, clientLogout, loading: authLoading, isClient } = useClientAuth();

  const [tab, setTab] = useState('analytics');
  const [analytics, setAnalytics] = useState(null);
  const [rsvps, setRsvps] = useState([]);
  const [rsvpStats, setRsvpStats] = useState(null);
  const [wishes, setWishes] = useState([]);
  const [wishCounts, setWishCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busyWish, setBusyWish] = useState(null);
  const [addForm, setAddForm] = useState({ guest_name: '', relationship: '', message: '' });
  const [addingWish, setAddingWish] = useState(false);
  const [err, setErr] = useState('');
  // contracts + proofing (studio⇄client workflow)
  const [contracts, setContracts] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [signName, setSignName] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  // Redirect out if there's no client session (after boot).
  useEffect(() => {
    if (!authLoading && !isClient) navigate('/studio/login?tab=client', { replace: true });
  }, [authLoading, isClient, navigate]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = event?.invite_path ? `${origin}${event.invite_path}` : '';
  const galleryUrl = event?.gallery?.live_gallery_path ? `${origin}${event.gallery.live_gallery_path}` : '';

  const loadAll = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const [a, r, s, w] = await Promise.all([
        clientApi.get('/api/client/analytics'),
        clientApi.get('/api/client/rsvps'),
        clientApi.get('/api/client/rsvps/stats'),
        clientApi.get('/api/client/wishes'),
      ]);
      setAnalytics(a.data);
      setRsvps(r.data?.rsvps || []);
      setRsvpStats(s.data);
      setWishes(w.data?.wishes || []);
      setWishCounts(w.data?.counts || null);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not load your event data.');
    } finally {
      setLoading(false);
    }
  }, [clientApi]);

  useEffect(() => { if (isClient) loadAll(); }, [isClient, loadAll]);

  const loadContracts = useCallback(async () => {
    try { setContracts((await clientApi.get('/api/client/contracts')).data?.contracts || []); } catch (_) {}
  }, [clientApi]);
  const loadProofs = useCallback(async () => {
    try { setProofs((await clientApi.get('/api/client/proofing')).data?.galleries || []); } catch (_) {}
  }, [clientApi]);
  useEffect(() => { if (isClient && tab === 'contracts') loadContracts(); }, [isClient, tab, loadContracts]);
  useEffect(() => { if (isClient && tab === 'proofs') loadProofs(); }, [isClient, tab, loadProofs]);

  const signContract = async (id) => {
    if (signName.trim().length < 2) { setErr('Type your full name to sign.'); return; }
    setBusyId(id); setErr('');
    try { await clientApi.post(`/api/client/contracts/${id}/sign`, { signer_name: signName.trim() }); setSignName(''); await loadContracts(); }
    catch (e) { setErr(e?.response?.data?.detail || 'Could not sign.'); }
    setBusyId(null);
  };
  const toggleSelect = async (galleryId, photo) => {
    setBusyId(photo.id);
    try {
      await clientApi.post(`/api/client/proofing/photos/${photo.id}/select`, { selected: !photo.selected });
      setProofs((gs) => gs.map((g) => g.id !== galleryId ? g : {
        ...g, selected_count: g.selected_count + (photo.selected ? -1 : 1),
        photos: g.photos.map((p) => p.id === photo.id ? { ...p, selected: !p.selected } : p),
      }));
    } catch (_) {}
    setBusyId(null);
  };
  const requestPhotos = async (galleryId, kind) => {
    setBusyId(galleryId); setErr('');
    try { await clientApi.post('/api/client/print-orders', { gallery_id: galleryId, kind }); setErr(kind === 'print' ? 'Print request sent to your studio ✓' : 'Download request sent to your studio ✓'); }
    catch (e) { setErr(e?.response?.data?.detail || 'Could not send request.'); }
    setBusyId(null);
  };

  // Pull the latest RSVPs/wishes/analytics whenever the tab regains focus, so a
  // client who left the dashboard open sees new submissions without a manual
  // refresh. Guarded to the visible + signed-in state to avoid idle churn.
  useEffect(() => {
    if (!isClient) return undefined;
    const onFocus = () => { if (document.visibilityState !== 'hidden') loadAll(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isClient, loadAll]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (_) {}
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await clientApi.get('/api/client/rsvps/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `rsvps-${event?.slug || 'event'}.csv`;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
    } catch (_) { /* ignore */ } finally { setExporting(false); }
  };

  const reloadWishes = useCallback(async () => {
    const w = await clientApi.get('/api/client/wishes');
    setWishes(w.data?.wishes || []);
    setWishCounts(w.data?.counts || null);
  }, [clientApi]);

  const wishAction = async (id, action) => {
    setBusyWish(id);
    try {
      if (action === 'delete') await clientApi.delete(`/api/client/wishes/${id}`);
      else await clientApi.post(`/api/client/wishes/${id}/${action}`);
      await reloadWishes();
    } catch (_) { /* ignore */ } finally { setBusyWish(null); }
  };

  const submitWish = async (e) => {
    e.preventDefault();
    if (!addForm.guest_name.trim() || !addForm.message.trim()) return;
    setAddingWish(true);
    try {
      await clientApi.post('/api/client/wishes', addForm);
      setAddForm({ guest_name: '', relationship: '', message: '' });
      await reloadWishes();
    } catch (_) { /* ignore */ } finally { setAddingWish(false); }
  };

  const logout = () => { clientLogout(); navigate('/studio/login?tab=client', { replace: true }); };

  const deviceTotal = useMemo(() => {
    if (!analytics) return 0;
    return (analytics.mobile_views || 0) + (analytics.desktop_views || 0) + (analytics.tablet_views || 0);
  }, [analytics]);

  if (authLoading) {
    return <div className="luxe min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>;
  }

  return (
    <div className="luxe min-h-screen px-4 md:px-10 py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
          <div>
            <span className="lux-eyebrow block mb-2">◆ Client View</span>
            <h1 className="font-display text-3xl md:text-4xl" style={{ color: 'var(--lux-text)' }}>
              {event?.couple || 'Your celebration'}
            </h1>
            {event?.event_date && (
              <div className="mt-1 text-sm inline-flex items-center gap-1.5" style={{ color: 'var(--lux-text-muted)' }}>
                {/* The API returns a full ISO timestamp, so this printed a raw
                    "2026-12-12T00:00:00" at the couple. Format it, and fall back
                    to the raw string if it is ever not parseable. */}
                <CalendarDays className="w-3.5 h-3.5 text-gold" /> {formatEventDate(event.event_date)}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={loadAll} className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5" data-testid="client-refresh">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button onClick={logout} className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5" data-testid="client-logout">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>

        {err && (
          <div className="lux-glass px-4 py-3 mb-6 text-sm" style={{ color: '#FFD7C9', border: '1px solid rgba(255,120,90,0.4)' }}>
            {err}
          </div>
        )}

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={Eye} label="Link opens" value={analytics?.total_views ?? event?.quick?.total_views ?? 0}
            sub={`${analytics?.unique_views ?? 0} unique`} />
          <StatCard icon={Users} label="Attending" value={rsvpStats?.attending_count ?? event?.quick?.rsvp_attending ?? 0}
            sub={`${rsvpStats?.total_guest_count ?? 0} guests`} />
          <StatCard icon={Heart} label="Wishes" value={wishCounts?.approved ?? event?.quick?.wishes_total ?? 0}
            sub={wishCounts ? `${wishCounts.pending} pending` : ''} />
          <StatCard icon={Camera} label="Photos" value={event?.gallery?.photo_count ?? 0}
            sub={event?.gallery?.enabled ? 'live gallery' : 'gallery off'} />
        </div>

        {/* Invite link + QR */}
        <div className="lux-glass p-5 mb-8 flex flex-col md:flex-row items-start md:items-center gap-5">
          <div className="flex-1 min-w-0">
            <div className="lux-eyebrow mb-2">◇ Your invitation link</div>
            <div className="text-sm break-all mb-3" style={{ color: 'var(--lux-text)' }}>{inviteUrl || '—'}</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={copyLink} disabled={!inviteUrl} className="lux-btn text-xs inline-flex items-center gap-1.5" data-testid="client-copy-link">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy link'}
              </button>
              {inviteUrl && (
                <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5" data-testid="client-open-invite">
                  <ExternalLink className="w-3.5 h-3.5" /> Open invitation
                </a>
              )}
              {galleryUrl && (
                <a href={galleryUrl} target="_blank" rel="noopener noreferrer" className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5" data-testid="client-open-gallery">
                  <Camera className="w-3.5 h-3.5" /> Live gallery
                </a>
              )}
            </div>
          </div>
          {inviteUrl && (
            <div className="p-3 rounded-xl bg-white flex-shrink-0">
              <QRCodeCanvas value={inviteUrl} size={104} includeMargin={false} level="M" />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-full text-sm inline-flex items-center gap-2 transition-colors ${tab === t.id ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`}
              data-testid={`client-tab-${t.id}`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>
        ) : (
          <>
            {/* ANALYTICS */}
            {tab === 'analytics' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4" data-testid="client-analytics">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard icon={Eye} label="Total opens" value={analytics?.total_views ?? 0} />
                  <StatCard icon={Users} label="Unique visitors" value={analytics?.unique_views ?? 0} />
                  <StatCard icon={Smartphone} label="Mobile" value={analytics?.mobile_views ?? 0}
                    sub={deviceTotal ? `${Math.round(((analytics?.mobile_views || 0) / deviceTotal) * 100)}%` : ''} />
                  <StatCard icon={Monitor} label="Desktop" value={analytics?.desktop_views ?? 0}
                    sub={deviceTotal ? `${Math.round(((analytics?.desktop_views || 0) / deviceTotal) * 100)}%` : ''} />
                </div>
                {/* Fuller picture — the same signals the studio sees for this event */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard icon={Monitor} label="Tablet" value={analytics?.tablet_views ?? 0} />
                  <StatCard icon={ExternalLink} label="Map clicks" value={analytics?.map_clicks ?? 0} />
                  <StatCard icon={Users} label="RSVP clicks" value={analytics?.rsvp_clicks ?? 0} />
                  <StatCard icon={CalendarDays} label="First opened"
                    value={analytics?.first_viewed_at ? String(analytics.first_viewed_at).slice(0, 10) : '—'} />
                </div>
                {Array.isArray(analytics?.daily_views) && analytics.daily_views.length > 0 && (() => {
                  const days = analytics.daily_views.slice(-30);
                  const max = Math.max(1, ...days.map((d) => Number(d.count ?? d.views ?? d.value ?? 0)));
                  return (
                    <div className="lux-glass p-4">
                      <div className="text-[11px] tracking-[0.15em] uppercase mb-3" style={{ color: 'var(--lux-text-muted)' }}>Opens over time</div>
                      <div className="flex items-end gap-1" style={{ height: 80 }}>
                        {days.map((d, i) => {
                          const v = Number(d.count ?? d.views ?? d.value ?? 0);
                          return (
                            <div key={i} className="flex-1 rounded-t" title={`${d.date || d.day || ''}: ${v}`}
                              style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 0, background: 'linear-gradient(180deg,#E8C97A,#D4AF37)' }} />
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {(!analytics || analytics.total_views === 0) && (
                  <div className="lux-glass p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                    No opens yet — share your invitation link and this will start filling in.
                  </div>
                )}
                {analytics?.last_viewed_at && (
                  <div className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>
                    Last opened: {String(analytics.last_viewed_at).slice(0, 16).replace('T', ' ')}
                  </div>
                )}
              </motion.div>
            )}

            {/* RSVP */}
            {tab === 'rsvp' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="client-rsvp">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <StatCard icon={Users} label="Total RSVPs" value={rsvpStats?.total_rsvps ?? 0} />
                  <StatCard icon={Check} label="Attending" value={rsvpStats?.attending_count ?? 0} />
                  <StatCard icon={Users} label="Guests" value={rsvpStats?.total_guest_count ?? 0} />
                  <StatCard icon={Users} label="Maybe" value={rsvpStats?.maybe_count ?? 0} />
                </div>
                <div className="flex justify-end mb-3">
                  <button onClick={exportCsv} disabled={exporting || !rsvps.length} className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5" data-testid="client-export-rsvp">
                    {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Export CSV
                  </button>
                </div>
                {rsvps.length === 0 ? (
                  <div className="lux-glass p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>No RSVPs yet.</div>
                ) : (
                  <div className="lux-glass overflow-x-auto">
                    <table className="w-full text-sm" style={{ color: 'var(--lux-text)' }}>
                      <thead>
                        <tr style={{ color: 'var(--lux-text-muted)' }} className="text-left text-[11px] tracking-[0.15em] uppercase">
                          <th className="px-4 py-3">Guest</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Guests</th>
                          <th className="px-4 py-3 hidden md:table-cell">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rsvps.map((r, i) => (
                          <tr key={r.id || i} style={{ borderTop: '1px solid var(--lux-border)' }}>
                            <td className="px-4 py-3">{r.guest_name || '—'}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-full text-[11px]" style={{
                                background: r.status === 'yes' ? 'rgba(60,140,80,0.2)' : r.status === 'no' ? 'rgba(139,0,0,0.2)' : 'rgba(212,175,55,0.15)',
                                color: r.status === 'yes' ? '#bff0c8' : r.status === 'no' ? '#FFD7C9' : '#FFE5A0',
                              }}>
                                {r.status === 'yes' ? 'Attending' : r.status === 'no' ? 'Not attending' : 'Maybe'}
                              </span>
                            </td>
                            <td className="px-4 py-3">{r.guest_count ?? 1}</td>
                            <td className="px-4 py-3 hidden md:table-cell" style={{ color: 'var(--lux-text-muted)' }}>{r.message || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </motion.div>
            )}

            {/* WISHES */}
            {tab === 'wishes' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} data-testid="client-wishes">
                <form onSubmit={submitWish} className="lux-glass p-5 mb-5">
                  <div className="lux-eyebrow mb-3">◇ Add a wish</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <input value={addForm.guest_name} onChange={(e) => setAddForm((f) => ({ ...f, guest_name: e.target.value }))}
                      placeholder="Name" required maxLength={80}
                      className="px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
                      style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="client-wish-name" />
                    <input value={addForm.relationship} onChange={(e) => setAddForm((f) => ({ ...f, relationship: e.target.value }))}
                      placeholder="Relationship (optional)" maxLength={80}
                      className="px-3 py-2 rounded-lg bg-transparent outline-none text-sm"
                      style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
                  </div>
                  <textarea value={addForm.message} onChange={(e) => setAddForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="Write a blessing…" required maxLength={600} rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-transparent outline-none text-sm mb-3"
                    style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="client-wish-message" />
                  <button type="submit" disabled={addingWish} className="lux-btn text-xs inline-flex items-center gap-1.5" data-testid="client-wish-add">
                    {addingWish ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add wish
                  </button>
                </form>

                {wishes.length === 0 ? (
                  <div className="lux-glass p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>No wishes yet.</div>
                ) : (
                  <div className="space-y-3">
                    {wishes.map((w) => (
                      <div key={w.id} className="lux-glass p-4 flex items-start justify-between gap-3" data-testid={`client-wish-${w.id}`}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-display text-sm" style={{ color: 'var(--lux-text)' }}>{w.guest_name}</span>
                            {w.relationship && <span className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>· {w.relationship}</span>}
                            {w.is_featured && <Star className="w-3.5 h-3.5 text-gold" fill="currentColor" />}
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
                              background: w.status === 'approved' ? 'rgba(60,140,80,0.18)' : w.status === 'rejected' ? 'rgba(139,0,0,0.18)' : 'rgba(212,175,55,0.15)',
                              color: w.status === 'approved' ? '#bff0c8' : w.status === 'rejected' ? '#FFD7C9' : '#FFE5A0',
                            }}>{w.status}</span>
                          </div>
                          <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{w.message}</div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {w.status !== 'approved' && (
                            <button onClick={() => wishAction(w.id, 'approve')} disabled={busyWish === w.id} title="Approve"
                              className="w-8 h-8 rounded-full grid place-items-center" style={{ border: '1px solid var(--lux-border)' }} data-testid={`client-wish-approve-${w.id}`}>
                              <Check className="w-4 h-4 text-gold" />
                            </button>
                          )}
                          <button onClick={() => wishAction(w.id, 'feature')} disabled={busyWish === w.id} title={w.is_featured ? 'Unfeature' : 'Feature'}
                            className="w-8 h-8 rounded-full grid place-items-center" style={{ border: '1px solid var(--lux-border)' }} data-testid={`client-wish-feature-${w.id}`}>
                            <Star className="w-4 h-4" style={{ color: w.is_featured ? '#D4AF37' : 'var(--lux-text-muted)' }} />
                          </button>
                          <button onClick={() => wishAction(w.id, 'delete')} disabled={busyWish === w.id} title="Delete"
                            className="w-8 h-8 rounded-full grid place-items-center" style={{ border: '1px solid rgba(139,0,0,0.4)' }} data-testid={`client-wish-delete-${w.id}`}>
                            {busyWish === w.id ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#FFD7C9' }} /> : <Trash2 className="w-4 h-4" style={{ color: '#FFD7C9' }} />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* CONTRACTS */}
            {tab === 'contracts' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3" data-testid="client-contracts">
                {contracts.length === 0 ? (
                  <div className="lux-glass p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>No contracts yet. Your studio will send any here to review and sign.</div>
                ) : contracts.map((c) => (
                  <div key={c.id} className="lux-glass p-5" data-testid={`client-contract-${c.id}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-gold" />
                      <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{c.title}</span>
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{
                        background: c.status === 'signed' ? 'rgba(60,140,80,0.18)' : 'rgba(212,175,55,0.15)',
                        color: c.status === 'signed' ? '#bff0c8' : '#FFE5A0' }}>{c.status}</span>
                    </div>
                    {c.amount_inr > 0 && <div className="text-sm text-gold mb-2">₹{Number(c.amount_inr).toLocaleString('en-IN')}</div>}
                    <div className="text-sm whitespace-pre-wrap mb-4" style={{ color: 'var(--lux-text-muted)' }}>{c.body}</div>
                    {c.status === 'signed' ? (
                      <div className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>
                        Signed by <b style={{ color: 'var(--lux-text)' }}>{c.signer_name}</b> on {String(c.signed_at || '').slice(0, 16).replace('T', ' ')}
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 pt-3 border-t" style={{ borderColor: 'var(--lux-border)' }}>
                        <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Type your full name to sign:</span>
                        <input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Full name"
                          className="px-3 py-1.5 rounded-lg bg-transparent outline-none text-sm" style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="client-sign-name" />
                        <button onClick={() => signContract(c.id)} disabled={busyId === c.id} className="lux-btn text-xs inline-flex items-center gap-1.5" data-testid={`client-sign-${c.id}`}>
                          {busyId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Sign
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </motion.div>
            )}

            {/* PROOFS */}
            {tab === 'proofs' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5" data-testid="client-proofs">
                {proofs.length === 0 ? (
                  <div className="lux-glass p-6 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>No proofing galleries yet. Your studio will share photos here for you to pick your favourites.</div>
                ) : proofs.map((g) => (
                  <div key={g.id} className="lux-glass p-5" data-testid={`client-proof-${g.id}`}>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <Camera className="w-4 h-4 text-gold" />
                      <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{g.title}</span>
                      <span className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>· {g.selected_count}/{g.photo_count} selected</span>
                      <div className="ml-auto flex items-center gap-2">
                        <button onClick={() => requestPhotos(g.id, 'download')} disabled={busyId === g.id || g.selected_count === 0} className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                          <Download className="w-3.5 h-3.5" /> Request download
                        </button>
                        <button onClick={() => requestPhotos(g.id, 'print')} disabled={busyId === g.id || g.selected_count === 0} className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                          <Camera className="w-3.5 h-3.5" /> Request prints
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {g.photos.map((p) => (
                        <button key={p.id} onClick={() => toggleSelect(g.id, p)} disabled={busyId === p.id}
                          className="relative rounded-lg overflow-hidden aspect-square" style={{ outline: p.selected ? '2px solid #E8C97A' : '1px solid var(--lux-border)' }}
                          data-testid={`client-proof-photo-${p.id}`}>
                          <img src={p.thumb_url || p.image_url} alt={p.filename || 'proof'} loading="lazy" className="w-full h-full object-cover" />
                          {p.selected && <span className="absolute top-1 right-1 w-5 h-5 rounded-full grid place-items-center" style={{ background: '#E8C97A' }}><Check className="w-3.5 h-3.5" style={{ color: '#0E0A06' }} /></span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
