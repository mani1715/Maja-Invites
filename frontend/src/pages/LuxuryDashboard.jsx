import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Crown, LogOut, Plus, Camera, Calendar,
  ExternalLink, Edit3, Eye, Search, Layers, MessageCircle,
  Image as ImageIcon, Link2, ChevronLeft, ChevronRight, Clock,
  AlertTriangle, Heart, Download, HardDrive as HardDriveIcon, QrCode, UserRound, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import CardMenu from '@/components/dashboard/CardMenu';
import PanelTabs from '@/components/PanelTabs';
import ReactivateLinkModal from '@/components/ReactivateLinkModal';
import QuickEditModal from '@/components/dashboard/QuickEditModal';
import BulkActionBar from '@/components/dashboard/BulkActionBar';
import NotificationsBell from '@/components/dashboard/NotificationsBell';
import { MASTER_THEMES, getThemeById } from '@/themes/masterThemes';
import HelpTour, { HelpTourTrigger } from '@/components/HelpTour';
import { PHOTOGRAPHER_STEPS } from '@/data/helpTourSteps';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fadeUp = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  visible: (i = 0) => ({ opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.65, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] } }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } };

const STATUS_CHIPS = [
  { key: 'all',        label: 'All' },
  { key: 'draft',      label: 'Draft' },
  { key: 'published',  label: 'Published' },
  { key: 'expiring',   label: 'Expiring soon' },
  { key: 'archived',   label: 'Archived' },
];

const SORT_OPTIONS = [
  { key: 'newest',      label: 'Newest first' },
  { key: 'oldest',      label: 'Oldest first' },
  { key: 'date_asc',    label: 'Wedding date ↑' },
  { key: 'date_desc',   label: 'Wedding date ↓' },
  { key: 'most_viewed', label: 'Most viewed' },
  { key: 'name_asc',    label: 'Couple A → Z' },
];

/**
 * ClientOrderCards — a card per invitation the studio has BOUGHT.
 *
 * "Your Weddings" only lists BUILT profiles, so a studio with three paid orders
 * and nothing published yet saw "No weddings yet · 0 TOTAL" and concluded their
 * clients had vanished. These are those clients: one card each, with whatever
 * details have been entered, the real build status, and the actions that are
 * genuinely available at that stage.
 *
 * "Upload photos into the QR gallery" needs a built profile to upload INTO — an
 * order awaiting its build has no gallery yet. Rather than show a button that
 * would 404, the card says what has to happen first.
 */
const ORDER_STAGE = {
  pending_info: { label: 'Waiting for your details', tone: '#E8C766' },
  awaiting_payment: { label: 'Payment pending', tone: '#EF6E6E' },
  building: { label: 'Our studio is building it', tone: '#9BD1FF' },
  delivered: { label: 'Link delivered', tone: '#8BE9A0' },
};

function ClientOrderCards({ orders, navigate }) {
  if (!orders || orders.length === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="client-order-cards">
      {orders.map((o) => {
        const info = o.info || {};
        const names = [info.bride_name, info.groom_name].filter(Boolean).join(' & ');
        const stage = ORDER_STAGE[o.build_status] || { label: o.build_status || 'In progress', tone: '#E8C766' };
        const hasProfile = !!o.profile_id;
        return (
          <div key={o.id} className="lux-glass p-5" data-testid={`client-card-${o.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-lg truncate" style={{ color: 'var(--lux-text)' }}>
                  {names || 'Details not entered yet'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>
                  {o.fulfillment_code ? `Code ${o.fulfillment_code}` : o.id}
                  {o.event_type ? ` · ${o.event_type}` : ''}
                </div>
              </div>
              <span className="text-[10px] px-2.5 py-1 rounded-full shrink-0 tracking-wide uppercase"
                style={{ background: 'rgba(255,255,255,0.05)', color: stage.tone, border: `1px solid ${stage.tone}55` }}>
                {stage.label}
              </span>
            </div>

            {/* Their event, as far as it has been entered. */}
            {(info.event_date || info.venue || info.city) && (
              <div className="mt-3 text-xs space-y-0.5" style={{ color: 'var(--lux-text-muted)' }}>
                {info.event_date && <div>{String(info.event_date).slice(0, 10)}</div>}
                {(info.venue || info.city) && <div>{[info.venue, info.city].filter(Boolean).join(', ')}</div>}
                {info.phone && <div>{info.phone}</div>}
              </div>
            )}

            <div className="lux-hairline my-3" />

            <div className="flex flex-wrap gap-2 text-xs">
              <button onClick={() => navigate(`/order/${o.id}/details`)}
                className="lux-btn text-[11px]" data-testid={`client-details-${o.id}`}>
                {names ? 'View / edit details' : 'Enter details'}
              </button>
              {hasProfile ? (
                <>
                  <button onClick={() => navigate(`/studio/profile/${o.profile_id}/live-gallery`)}
                    className="lux-btn lux-btn-ghost text-[11px]" data-testid={`client-upload-${o.id}`}>
                    Upload photos into QR
                  </button>
                  <button onClick={() => navigate(`/studio/profile/${o.profile_id}/qr-codes`)}
                    className="lux-btn lux-btn-ghost text-[11px]" data-testid={`client-qr-${o.id}`}>
                    QR &amp; password
                  </button>
                </>
              ) : (
                <span className="text-[11px] self-center" style={{ color: 'var(--lux-text-faint, var(--lux-text-muted))' }}>
                  Photo uploads open once we publish the link.
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * MyInvitationsStrip — bought invitations live in the store's order pipeline
 * (/order/pending), NOT in "Your Weddings" (which only lists built/published
 * profiles). Without this, a photographer who buys + submits details sees
 * "No weddings yet" and thinks their link vanished. This strip surfaces those
 * orders on the dashboard with a clear link to track/enter details.
 */
function MyInvitationsStrip({ navigate }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/api/store/my-orders`, { withCredentials: true })
      .then(({ data }) => { if (alive) setOrders((data?.orders || []).filter((o) => o.status === 'paid')); })
      .catch(() => { if (alive) setOrders([]); });
    return () => { alive = false; };
  }, []);
  if (!orders || orders.length === 0) return null;
  const pending = orders.filter((o) => o.build_status === 'pending_info').length;
  const building = orders.filter((o) => o.build_status === 'building').length;
  const delivered = orders.filter((o) => o.build_status === 'delivered').length;
  const bits = [
    pending && `${pending} awaiting your details`,
    building && `${building} being built`,
    delivered && `${delivered} delivered`,
  ].filter(Boolean).join(' · ');
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible"
      className="lux-glass p-5 mb-6 flex flex-wrap items-center justify-between gap-3"
      data-testid="dashboard-my-invitations">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-10 h-10 rounded-full grid place-items-center flex-shrink-0"
          style={{ background: 'rgba(212,175,55,0.12)' }}>
          <Clock className="w-5 h-5 text-gold" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>
            {orders.length} invitation{orders.length > 1 ? 's' : ''} you bought
          </div>
          <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{bits || 'in progress'}</div>
        </div>
      </div>
      <button onClick={() => navigate('/order/pending')} className="lux-btn text-sm" data-testid="dashboard-view-orders">
        {pending > 0 ? 'Enter details' : 'Track / view'} <ExternalLink className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

const LuxuryDashboard = () => {
  const navigate = useNavigate();
  const { admin, logout, loading: authLoading, refresh: refreshAuth } = useAuth();

  // List state (server-driven)
  const [items, setItems]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [totalPages, setPages]  = useState(1);
  const [page, setPage]         = useState(1);
  const [pageSize]              = useState(12);
  const [loading, setLoading]   = useState(true);

  // Filters
  const [status, setStatus] = useState('all');
  const [sort,   setSort]   = useState('newest');
  const [q,      setQ]      = useState('');
  const [qInput, setQInput] = useState('');

  // UI state
  const [selected,  setSelected]  = useState(new Set());
  const [editing,   setEditing]   = useState(null);
  // Paid orders = the studio's CLIENTS. "Your Weddings" only lists built
  // profiles, so without these an account with 3 bought invitations reads
  // "No weddings yet · 0 TOTAL".
  const [myOrders, setMyOrders] = useState([]);
  const [stats,     setStats]     = useState({});  // { profileId: {views, rsvps, wishes, ...} }
  // Phase 3 P0 — gate the "Store my photos" tile via super-admin feature toggle
  const [studioStorageEnabled, setStudioStorageEnabled] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!admin) return;
    const t = localStorage.getItem('admin_token');
    axios.get(`${API_URL}/api/admin/studio-storage/status`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
      .then((r) => { if (alive) setStudioStorageEnabled(!!r.data?.enabled); })
      .catch(() => { if (alive) setStudioStorageEnabled(false); });
    return () => { alive = false; };
  }, [admin]);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) { navigate('/studio/login'); return; }
    if (admin.role === 'super_admin') { navigate('/super-admin/dashboard'); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, authLoading]);

  // Debounced search → q
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350);
    return () => clearTimeout(t);
  }, [qInput]);

  // Reset to page 1 on filter change
  useEffect(() => { setPage(1); }, [status, sort, q]);

  // Best-effort: a failure here just means the client cards stay hidden.
  useEffect(() => {
    let alive = true;
    axios.get(`${API_URL}/api/store/my-orders`, { withCredentials: true })
      .then(({ data }) => {
        if (alive) setMyOrders((data?.orders || []).filter((o) => o.status === 'paid'));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const fetchPage = useCallback(async () => {
    if (!admin) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        status,
        sort,
        ...(q ? { q } : {}),
      });
      const res = await axios.get(`${API_URL}/api/admin/profiles/paginated?${params}`);
      const data = res.data || {};
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPages(data.total_pages || 1);
      setLoading(false);  // BUGFIX: stop the global loading spinner as soon
                          // as the card list arrives — quick-stats was
                          // previously held inside the same loading flag,
                          // so the whole dashboard stayed in spinner-mode
                          // until every per-profile stats call finished.
      // Fetch quick-stats for visible cards. Each card individually firing
      // setStats triggered a re-render per card (10 profiles → 10 renders
      // → visible jank). Batch into ONE setStats once Promise.allSettled
      // resolves so the dashboard only re-renders once.
      const cards = data.items || [];
      const missing = cards.filter((p) => !stats[p.id]);
      if (missing.length) {
        Promise.allSettled(
          missing.map((p) =>
            axios.get(`${API_URL}/api/admin/profiles/${p.id}/quick-stats`)
              .then((r) => [p.id, r.data])
              .catch(() => [p.id, null])
          )
        ).then((results) => {
          setStats((prev) => {
            const next = { ...prev };
            for (const r of results) {
              if (r.status === 'fulfilled' && r.value[1]) next[r.value[0]] = r.value[1];
            }
            return next;
          });
        });
      }
    } catch (e) {
      console.error('Failed to load profiles', e);
      setItems([]); setTotal(0); setPages(1);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, page, pageSize, status, sort, q]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const publishedCount  = items.filter((p) => p.status === 'PUBLISHED' || p.is_published).length;

  const toggleSel = (id) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const clearSel = () => setSelected(new Set());

  // Card actions ------------------------------------------------------------
  const doDuplicate = async (p) => {
    try {
      await axios.post(`${API_URL}/api/admin/profiles/${p.id}/duplicate`);
      fetchPage();
    } catch (_) { /* silent */ }
  };
  const doArchive = async (p) => {
    await axios.post(`${API_URL}/api/admin/profiles/bulk-action`, { ids: [p.id], action: 'archive' });
    fetchPage();
  };
  const doUnarchive = async (p) => {
    await axios.post(`${API_URL}/api/admin/profiles/bulk-action`, { ids: [p.id], action: 'unarchive' });
    fetchPage();
  };
  const doDelete = async (p) => {
    if (!window.confirm(`Move "${p.bride_name} & ${p.groom_name}" to trash?`)) return;
    await axios.post(`${API_URL}/api/admin/profiles/bulk-action`, { ids: [p.id], action: 'delete' });
    fetchPage();
  };
  const doCopyLink = async (p) => {
    const url = `${window.location.origin}/invite/${p.slug}`;
    try { await navigator.clipboard.writeText(url); }
    catch (_) { prompt('Copy this link:', url); }
  };
  const doDownloadQR = (p) => window.open(`/studio/profile/${p.id}/qr-codes`, '_blank');
  const doWhatsApp = (p) => {
    const url = `${window.location.origin}/invite/${p.slug}`;
    const text = encodeURIComponent(`You're invited! ${p.bride_name} & ${p.groom_name} ✨ ${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };
  const doViewAsGuest = (p) => window.open(`/invite/${p.slug}?preview=1`, '_blank');

  // Bulk --------------------------------------------------------------------
  // BUG 2 FIX: Bulk Publish used to call the generic /bulk-action endpoint
  // which sets status=PUBLISHED directly in Mongo, completely bypassing the
  // lifecycle service — photographers could publish unlimited invitations
  // for FREE by selecting many cards at once. We now loop publish through
  // the proper lifecycle endpoint that deducts credits. All other actions
  // (archive / unarchive / delete / unpublish) continue using bulk-action
  // because they do not touch credits.
  const bulkAction = async (action) => {
    if (selected.size === 0) return;
    if (action === 'delete' && !window.confirm(`Move ${selected.size} weddings to trash?`)) return;
    const ids = Array.from(selected);

    if (action === 'publish') {
      const failures = [];
      for (const id of ids) {
        try {
          await axios.post(`${API_URL}/api/weddings/${id}/publish`);
        } catch (e) {
          const msg = e?.response?.data?.detail || e?.message || 'Unknown error';
          failures.push(`#${id.slice(0, 8)}: ${msg}`);
        }
      }
      if (failures.length) {
        alert(
          `${ids.length - failures.length} of ${ids.length} published.\n\nErrors:\n` +
          failures.slice(0, 5).join('\n') +
          (failures.length > 5 ? `\n…and ${failures.length - 5} more` : '')
        );
      }
      clearSel();
      fetchPage();
      refreshAuth?.(); // refresh credit balance pill in nav
      return;
    }

    await axios.post(`${API_URL}/api/admin/profiles/bulk-action`, { ids, action });
    clearSel();
    fetchPage();
  };
  const exportCsv = async () => {
    const url = `${API_URL}/api/admin/profiles/export.csv${status !== 'all' ? `?status=${status}` : ''}`;
    window.open(url, '_blank');
  };

  // Quick edit save → refresh row + auth (credits unchanged but harmless)
  const onQuickSaved = () => {
    fetchPage();
    refreshAuth?.();
  };

  const handleLogout = () => { logout(); navigate('/'); };

  // Floating help tour state
  const [tourOpen, setTourOpen] = useState(false);

  // ------------------------------------------------------------------------
  return (
    <div className="luxe min-h-screen relative" data-testid="luxury-dashboard">
      {/* Top bar */}
      <motion.nav
        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-50 px-6 md:px-12 py-4 flex items-center justify-between border-b"
        style={{ background: 'var(--lux-chrome)', backdropFilter: 'blur(12px)', borderColor: 'var(--lux-border)' }}
      >
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
          <img src="/brand/maja-icon-64.png" alt="MAJA Invites"
            className="w-9 h-9 rounded-full object-cover"
            style={{ boxShadow: '0 0 0 1px var(--lux-border-strong), inset 0 0 0 1px rgba(232,199,102,0.18)' }} />
          <span className="font-display text-[1.25rem] tracking-wide" style={{ color: 'var(--lux-text)' }}>
            MAJA<span className="text-gold"> </span>Invites
          </span>
        </div>
        <div className="flex items-center gap-3 md:gap-5">
          <NotificationsBell />
          <div className="hidden sm:block text-right">
            <div className="text-xs tracking-widest uppercase" style={{ color: 'var(--lux-text-muted)' }}>Studio</div>
            <div className="font-heading text-sm" style={{ color: 'var(--lux-text)' }}>{admin?.name || admin?.email}</div>
          </div>
          <button onClick={handleLogout} className="lux-btn lux-btn-ghost text-xs" data-testid="dashboard-logout">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </button>
        </div>
      </motion.nav>

      <div className="px-6 md:px-12 py-10 md:py-14 max-w-[1400px] mx-auto relative z-10">
        <PanelTabs active="/studio/dashboard" />
        {/* Hero greeting */}
        <motion.div variants={stagger} initial="hidden" animate="visible" className="mb-10">
          <motion.span variants={fadeUp} className="lux-eyebrow block mb-4">◆ Studio Dashboard</motion.span>
          <motion.h1 variants={fadeUp} custom={1}
            className="font-display text-[2.4rem] md:text-[4rem] leading-[1.05] tracking-tight"
            style={{ color: 'var(--lux-text)' }}>
            Welcome back, <span className="text-gold italic font-script">{admin?.name?.split(' ')[0] || 'maestro'}.</span>
          </motion.h1>
          <motion.p variants={fadeUp} custom={2} className="mt-3 max-w-xl text-sm md:text-base"
            style={{ color: 'var(--lux-text-muted)' }}>
            Manage invitations, portfolios, client galleries, bookings and cloud storage — all from one studio.
          </motion.p>
        </motion.div>

        {/* Stat tiles */}
        <motion.div variants={stagger} initial="hidden" animate="visible"
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatTile icon={Camera} label="Total Invitations" value={total}   testid="stat-total" />
          <StatTile icon={Eye}    label="On this page"       value={publishedCount} subtitle="published" testid="stat-published" />
          <StatTile icon={Layers} label="Available Themes"   value={Object.keys(MASTER_THEMES).length} testid="stat-themes" />
          <StatTile icon={ImageIcon} label="Drafts on page" value={Math.max(total - publishedCount, 0)} testid="stat-drafts" />
        </motion.div>

        {/* Action bar */}
        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={1}
          className="lux-glass p-5 md:p-6 mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => navigate('/studio/designs')} className="lux-btn" data-testid="dashboard-browse-designs">
              <Layers className="w-4 h-4" /> Browse Designs
            </button>
            <button onClick={() => navigate('/order/pending')} className="lux-btn lux-btn-ghost" data-testid="dashboard-enter-details">
              <Edit3 className="w-4 h-4" /> Enter Details
            </button>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: 'var(--lux-text-muted)' }} />
            <input
              type="text" value={qInput} onChange={(e) => setQInput(e.target.value)}
              placeholder="Search couple, phone, email, slug, tag, city…"
              className="lux-input pl-10"
              data-testid="dashboard-search"
            />
          </div>
        </motion.div>

        {/* Bought invitations (store orders) — surfaced here so they're not lost */}
        <MyInvitationsStrip navigate={navigate} />

        {/* Filter chips + sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap gap-2" data-testid="status-chips">
            {STATUS_CHIPS.map((c) => (
              <button key={c.key}
                onClick={() => setStatus(c.key)}
                className={`lux-chip ${status === c.key ? 'is-active' : ''}`}
                data-testid={`status-chip-${c.key}`}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="lux-input" style={{ width: 'auto' }} data-testid="dashboard-sort">
              {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        {/* Weddings grid */}
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <div className="flex items-end justify-between mb-5">
            <h2 className="font-display text-2xl md:text-3xl" style={{ color: 'var(--lux-text)' }}>
              Your Weddings
            </h2>
            <span className="text-xs tracking-[0.2em] uppercase" style={{ color: 'var(--lux-text-muted)' }}
              data-testid="results-count">
              {total} total · page {page}/{totalPages}
            </span>
          </div>

          {loading ? (
            <div className="grid place-items-center py-20"><div className="lux-mandala" /></div>
          ) : items.length === 0 ? (
            <>
            {/* The studio's CLIENTS: invitations they bought that are not yet
                built. Shown here instead of a bare "No weddings yet", which read
                as "your clients are gone". */}
            {!q && myOrders.length > 0 && (
              <motion.div variants={fadeUp} className="mb-4" data-testid="dashboard-clients">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h3 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>
                    Your clients
                  </h3>
                  <span className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
                    {myOrders.length} invitation{myOrders.length === 1 ? '' : 's'} bought · not published yet
                  </span>
                </div>
                <ClientOrderCards orders={myOrders} navigate={navigate} />
              </motion.div>
            )}
            <motion.div variants={fadeUp} className="lux-glass p-12 text-center" data-testid="dashboard-empty">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
                style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid var(--lux-border-strong)' }}>
                <ImageIcon className="w-5 h-5" style={{ color: '#D4AF37' }} />
              </div>
              <h3 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>
                {q ? 'No matches' : (myOrders.length > 0 ? 'No published links yet' : 'No weddings yet')}
              </h3>
              <p className="text-sm mb-6" style={{ color: 'var(--lux-text-muted)' }}>
                {q ? 'Try a different search or clear filters.' : (myOrders.length > 0 ? 'Your clients are listed above. Each one moves into this list the moment our studio publishes its link.' : 'Built invitations appear here. Bought one? Track it under "Enter Details" above — it stays there until the studio publishes the link.')}
              </p>
              {!q && (
                <button onClick={() => navigate('/studio/designs')} className="lux-btn"
                  data-testid="dashboard-empty-create">
                  <Plus className="w-4 h-4" /> Create First Invitation
                </button>
              )}
            </motion.div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {items.map((p, i) => (
                <Card key={p.id} p={p} i={i}
                  selected={selected.has(p.id)}
                  onSelect={() => toggleSel(p.id)}
                  stats={stats[p.id]}
                  onQuickEdit={(prof) => setEditing(prof)}
                  onDuplicate={doDuplicate}
                  onArchive={doArchive}
                  onUnarchive={doUnarchive}
                  onDelete={doDelete}
                  onCopyLink={doCopyLink}
                  onDownloadQR={doDownloadQR}
                  onWhatsApp={doWhatsApp}
                  onViewAsGuest={doViewAsGuest}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2" data-testid="pagination">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="lux-btn lux-btn-ghost text-xs disabled:opacity-40" data-testid="page-prev">
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              {pageRange(page, totalPages).map((n, idx) => (
                n === '…'
                  ? <span key={idx} className="px-2 text-xs" style={{ color: 'var(--lux-text-faint)' }}>…</span>
                  : <button key={idx} onClick={() => setPage(n)}
                      className={`px-3 py-1.5 rounded-full text-xs ${n === page ? 'is-active lux-chip' : 'lux-chip'}`}
                      data-testid={`page-${n}`}>
                      {n}
                    </button>
              ))}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="lux-btn lux-btn-ghost text-xs disabled:opacity-40" data-testid="page-next">
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </motion.div>

      </div>

      <QuickEditModal open={!!editing} profile={editing} onClose={() => setEditing(null)} onSaved={onQuickSaved} />
      <BulkActionBar
        selectedCount={selected.size}
        context={status}
        onClear={clearSel}
        onDelete={() => bulkAction('delete')}
        onPublish={() => bulkAction('publish')}
        onUnpublish={() => bulkAction('unpublish')}
        onArchive={() => bulkAction('archive')}
        onUnarchive={() => bulkAction('unarchive')}
        onExportCsv={exportCsv}
      />

      {/* Floating "How to create your link" trigger + tour */}
      <div className="fixed bottom-5 right-5 z-40">
        <HelpTourTrigger
          onClick={() => setTourOpen(true)}
          label="How to create link"
          testId="photographer-help-tour-trigger"
        />
      </div>
      <HelpTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        steps={PHOTOGRAPHER_STEPS}
        title="Photographer studio walkthrough"
      />
    </div>
  );
};

// ------------------------------------ Card --------------------------------------
/**
 * BUG 1 FIX: route to the correct edit form based on invitation_category.
 * Wedding profiles → /admin/profile/:id/edit (LuxuryProfileForm).
 * Birthday / half-saree / puberty / dhoti profiles → /admin/celebration/:id/edit
 * (CelebrationProfileForm). Using the wrong form shows a blank/broken page.
 *
 * BUG 8 FIX: provide a human-readable label for the invitation category so
 * the dashboard card can show a small badge next to the couple/celebrant name.
 */
const getEditRoute = (p) => {
  const cat = p?.invitation_category || 'wedding';
  // BUG 1 FIX: CelebrationProfileForm reads `category` from useSearchParams().
  // Without it the form renders blank. Always include ?category= for non-wedding.
  if (cat !== 'wedding') return `/studio/celebration/${p.id}/edit?category=${cat}`;
  return `/studio/profile/${p.id}/edit`;
};

const CATEGORY_LABELS = {
  baby_birthday: 'Baby Birthday',
  half_saree:    'Half Saree',
  puberty:       'Puberty Ceremony',
  dhoti:         'Dhoti Ceremony',
};

const Card = ({
  p, i, selected, onSelect, stats,
  onQuickEdit, onDuplicate, onArchive, onUnarchive, onDelete,
  onCopyLink, onDownloadQR, onWhatsApp, onViewAsGuest,
}) => {
  const navigate = useNavigate();
  const theme = getThemeById(p.design_theme || p.theme_id || p.design_id);
  const isPublished = p.status === 'PUBLISHED' || p.is_published;
  const archived = !!p.archived_at;
  // Cards open COLLAPSED — just the couple + the event — and reveal their stats
  // and the full action row only when tapped, so the dashboard isn't a wall of
  // buttons. Owner's ask: "show only the names and event, then click → open →
  // all the options at the top."
  const [expanded, setExpanded] = useState(false);
  const [showReactivate, setShowReactivate] = useState(false);

  // Expiring soon (≤ 7 days) + already-expired detection
  let expiringDays = null;
  let isExpired = !!p.expired;
  if (p.expires_at) {
    const ms = new Date(p.expires_at).getTime() - Date.now();
    const days = Math.ceil(ms / 86400000);
    if (ms <= 0) isExpired = true;
    else if (days >= 0 && days <= 7) expiringDays = days;
  }

  const tags = p.tags || [];
  const bridePhone = p.contact_info?.bride_phone || '';
  const groomPhone = p.contact_info?.groom_phone || '';
  const bg = (p.cover_photo_id && p.media_url) || theme.heroImage || null;

  return (
    <motion.div variants={fadeUp} custom={i} whileHover={{ y: -3 }}
      className="lux-glass overflow-hidden flex flex-col relative"
      style={selected ? { boxShadow: '0 0 0 2px var(--lux-gold), 0 22px 50px -10px rgba(212,175,55,0.18)' } : {}}
      data-testid={`profile-card-${p.id}`}>

      {/* Theme thumbnail strip — uses theme paletteSwatch over an image-style backdrop */}
      <div className="relative h-24 overflow-hidden">
        {bg
          ? <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
          : null}
        <div className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${theme.paletteSwatch?.[0] || '#1A0F08'}, ${theme.paletteSwatch?.[2] || '#3A1F10'} 70%, ${theme.paletteSwatch?.[4] || '#D4AF37'})`, opacity: bg ? 0.7 : 1 }} />
        <div className="absolute top-2 left-2 flex items-center gap-2">
          <input type="checkbox" checked={selected} onChange={onSelect}
            data-testid={`card-select-${p.id}`}
            className="w-4 h-4 cursor-pointer" />
        </div>
        <div className="absolute top-2 right-2">
          <CardMenu
            profile={p}
            onQuickEdit={onQuickEdit} onDuplicate={onDuplicate}
            onArchive={onArchive} onUnarchive={onUnarchive} onDelete={onDelete}
            onCopyLink={onCopyLink} onDownloadQR={onDownloadQR}
            onWhatsApp={onWhatsApp} onViewAsGuest={onViewAsGuest}
          />
        </div>
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[9px] tracking-[0.2em] uppercase"
          style={{ background: 'rgba(14,10,6,0.7)', color: '#FFF8DC', backdropFilter: 'blur(6px)' }}>
          {theme.name}
        </div>
        <span className="absolute bottom-2 right-2 text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full"
          style={isPublished
            ? { background: 'rgba(212,175,55,0.18)', border: '1px solid var(--lux-gold)', color: '#D4AF37' }
            : { background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}>
          {archived ? 'Archived' : isPublished ? 'Published' : 'Draft'}
        </span>
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {/* Title — tap the card to reveal its stats + full action row */}
        <button type="button" onClick={() => setExpanded((v) => !v)}
          className="text-left w-full inline-flex items-start justify-between gap-2"
          data-testid={`card-toggle-${p.id}`} aria-expanded={expanded}>
          <h3 className="font-display text-[1.45rem] leading-tight" style={{ color: 'var(--lux-text)' }}>
            {p.bride_name || 'Bride'} <span className="text-gold italic font-script">&</span> {p.groom_name || 'Groom'}
          </h3>
          <ChevronRight className="w-4 h-4 mt-1.5 shrink-0 transition-transform"
            style={{ color: '#D4AF37', transform: expanded ? 'rotate(90deg)' : 'none' }} />
        </button>

        {/* BUG 8 FIX: invitation category badge — helps photographers
            instantly tell apart wedding cards from baby birthday / half
            saree / puberty / dhoti cards on a mixed-event dashboard. */}
        {p.invitation_category && p.invitation_category !== 'wedding' && (
          <span
            className="inline-block mt-1 text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(212,175,55,0.10)',
              border: '1px solid var(--lux-border)',
              color: 'var(--lux-text)',
            }}
            data-testid={`category-badge-${p.id}`}
          >
            {CATEGORY_LABELS[p.invitation_category] || p.invitation_category.replace(/_/g, ' ')}
          </span>
        )}

        {/* Date + city */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] mt-2"
          style={{ color: 'var(--lux-text-muted)' }}>
          {p.event_date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(p.event_date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
          {p.city && <span>· {p.city}</span>}
        </div>

        {/* Expiring banner */}
        {expiringDays != null && !archived && (
          <div className="mt-3 px-3 py-2 rounded-md flex items-center gap-2 text-xs"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#EF6E6E' }}
            data-testid={`expiring-banner-${p.id}`}>
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Expires in {expiringDays} day{expiringDays === 1 ? '' : 's'}</span>
            <button onClick={() => navigate(getEditRoute(p))}
              className="ml-auto text-[10px] underline" data-testid={`expiring-extend-${p.id}`}>
              Extend
            </button>
          </div>
        )}

        {!expanded && (
          <div className="mt-3 text-[10px] tracking-[0.2em] uppercase inline-flex items-center gap-1"
            style={{ color: 'var(--lux-text-muted)' }} data-testid={`card-tap-hint-${p.id}`}>
            Tap to open · stats & options
          </div>
        )}

        {expanded && (
        <div className="flex flex-col">
        {/* Contact (subtle) */}
        {(bridePhone || groomPhone) && (
          <div className="mt-2 text-[10px]" style={{ color: 'var(--lux-text-muted)' }}
            data-testid={`contact-${p.id}`}>
            {[bridePhone, groomPhone].filter(Boolean).join(' · ')}
          </div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1" data-testid={`tags-${p.id}`}>
            {tags.slice(0, 5).map((t) => (
              <span key={t} className="px-2 py-0.5 rounded-full text-[10px]"
                style={{ background: 'rgba(212,175,55,0.10)', color: '#E8C766', border: '1px solid rgba(212,175,55,0.3)' }}>
                #{t}
              </span>
            ))}
            {tags.length > 5 && (
              <span className="px-2 py-0.5 rounded-full text-[10px]" style={{ color: 'var(--lux-text-faint)' }}>
                +{tags.length - 5}
              </span>
            )}
          </div>
        )}

        {/* Inline counters */}
        <div className="mt-4 grid grid-cols-4 gap-2 text-center"
          style={{ borderTop: '1px solid var(--lux-border)', paddingTop: 12 }}
          data-testid={`stats-${p.id}`}>
          <Counter icon={Eye}     value={stats?.views ?? p.view_count ?? 0} label="Views" />
          <Counter icon={MessageCircle} value={stats?.rsvps ?? 0} label="RSVPs" />
          <Counter icon={Heart}   value={stats?.wishes ?? 0} label="Wishes" />
          <Counter icon={Camera}  value={stats?.gallery_views ?? 0} label="Photos" />
        </div>

        {/* Primary actions — surfaced at the TOP of the expanded card (order-first)
            so the options are the first thing the photographer sees on open. */}
        <div className="order-first flex flex-wrap gap-2 text-xs mb-3">
          {/* BUG 4 FIX: the "Get Invitation" button used to send photographers
              straight to /invitations even when the profile was still a
              DRAFT — they'd hit a paywall mid-flow with zero warning. We now
              swap the button for "Publish to Get Link" on drafts which jumps
              the photographer to the editor's Publish step where the cost
              breakdown + credit check is shown up-front. Published profiles
              keep the original "Get Invitation" behaviour. */}
          {isPublished ? (
            <ActionBtn onClick={() => navigate(`/studio/profile/${p.id}/client`)}
              icon={UserRound} label="Client" testid={`get-invitation-${p.id}`} primary />
          ) : (
            <ActionBtn
              onClick={() => {
                const ok = window.confirm(
                  'This invitation is still a draft. To get the shareable link, publish it first. Continue to the Publish step?'
                );
                if (ok) navigate(getEditRoute(p));
              }}
              icon={Link2}
              label="Publish to Get Link"
              testid={`publish-to-get-link-${p.id}`}
              primary
            />
          )}
          {isExpired && (
            <ActionBtn onClick={() => setShowReactivate(true)}
              icon={RefreshCw} label="Reactivate" testid={`reactivate-${p.id}`} primary />
          )}
          <ActionBtn onClick={() => navigate(getEditRoute(p))}
            icon={Edit3} label="Edit" testid={`edit-${p.id}`} />
          {/* Upload-during-event button → opens the Live Gallery manager
              for this profile. Photographers shoot during the function and
              push photos here; guests browse and download from the gallery
              behind the QR on the public link. Available for both draft
              and published profiles so the photographer can pre-stage. */}
          {/* Named for what it IS — the gallery behind the QR guests scan.
              "Upload Photos" gave no hint that these are the photos a guest
              collects by scanning, which is why it was reported missing. */}
          <ActionBtn onClick={() => navigate(`/studio/profile/${p.id}/live-gallery`)}
            icon={Camera} label="Upload to QR Gallery" testid={`upload-photos-${p.id}`} />
          {/* QR codes + the password a guest must enter after scanning. */}
          <ActionBtn onClick={() => navigate(`/studio/profile/${p.id}/qr-codes`)}
            icon={QrCode} label="QR & Password" testid={`qr-password-${p.id}`} />
          <ActionBtn onClick={() => navigate(`/studio/profile/${p.id}/rsvps`)}
            icon={MessageCircle} label="RSVPs" testid={`rsvp-${p.id}`} />
          {/* Consolidated "Your Wedding" overview: form details + RSVP tally +
              wishes moderation + live gallery + shagun + guest-upload link. */}
          <ActionBtn onClick={() => navigate(`/studio/wedding/${p.id}`)}
            icon={Eye} label="Wedding" testid={`wedding-overview-${p.id}`} primary />
          <ActionBtn
            onClick={async () => {
              // Feb 2026 — quick-download CSV without leaving the dashboard.
              // Mirrors GET /admin/profiles/{id}/rsvps/export.
              try {
                const token = localStorage.getItem('admin_token');
                const res = await axios.get(
                  `${API_URL}/api/admin/profiles/${p.id}/rsvps/export`,
                  { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' },
                );
                const url = window.URL.createObjectURL(new Blob([res.data]));
                const link = document.createElement('a');
                link.href = url;
                const safe = `${p.bride_name || ''}-${p.groom_name || ''}`.replace(/\s+/g, '');
                link.setAttribute('download', `rsvps_${safe || p.id}.csv`);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('RSVP download failed', e);
                window.alert('RSVP download failed. Please open the RSVPs page and try again.');
              }
            }}
            icon={Download}
            label="Download RSVPs"
            testid={`rsvp-download-${p.id}`}
          />
          <ActionBtn onClick={() => navigate(`/studio/profile/${p.id}/analytics`)}
            icon={Eye} label="Insights" testid={`analytics-${p.id}`} />
          {isPublished && p.slug && (
            <ActionBtn onClick={() => window.open(`/invite/${p.slug}`, '_blank')}
              icon={ExternalLink} label="Open" testid={`open-${p.id}`} primary />
          )}
        </div>
        </div>
        )}
      </div>
      {showReactivate && (
        <ReactivateLinkModal
          profileId={p.id}
          coupleName={[p.bride_name, p.groom_name].filter(Boolean).join(' & ')}
          onClose={() => setShowReactivate(false)}
          onDone={() => setShowReactivate(false)}
        />
      )}
    </motion.div>
  );
};

// ------------------------------------ Helpers --------------------------------------
const StatTile = ({ icon: Icon, label, value, subtitle, testid }) => (
  <motion.div variants={fadeUp} className="lux-glass p-5 flex flex-col gap-2" data-testid={testid}>
    <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase"
      style={{ color: 'var(--lux-text-muted)' }}>
      <Icon className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} /> {label}
    </div>
    <div className="font-display text-4xl text-gold leading-none">{value}</div>
    {subtitle && (
      <div className="text-[10px] tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>{subtitle}</div>
    )}
  </motion.div>
);

const Counter = ({ icon: Icon, value, label }) => (
  <div>
    <div className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--lux-text)' }}>
      <Icon className="w-3 h-3" style={{ color: '#D4AF37' }} />
      <span className="font-display">{value}</span>
    </div>
    <div className="text-[9px] tracking-[0.2em] uppercase mt-0.5"
      style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
  </div>
);

const ActionBtn = ({ icon: Icon, label, onClick, testid, primary }) => (
  <button onClick={onClick} data-testid={testid}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
    style={primary
      ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
      : { background: 'transparent', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}>
    <Icon className="w-3 h-3" /> {label}
  </button>
);

/** Build a compact pagination range like [1, '…', 4, 5, 6, '…', 12] */
function pageRange(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, 2, total - 1, total, cur - 1, cur, cur + 1]);
  const out = [];
  let last = 0;
  Array.from(pages).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b).forEach((n) => {
    if (n - last > 1) out.push('…');
    out.push(n);
    last = n;
  });
  return out;
}

export default LuxuryDashboard;
