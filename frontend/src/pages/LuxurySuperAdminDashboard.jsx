import React, { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  Users, UserPlus, ShieldCheck, ShieldOff,
  Search, TrendingUp, Crown, X, Check, Eye, FilePlus2,
  IndianRupee, BarChart3, Trophy, Tag, Calendar, Layers, Flag, Bell,
  Ban, Mail, Phone, UserCheck, Heart, LifeBuoy, Activity, Gavel, QrCode,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import LuxuryShell from '@/components/luxury/LuxuryShell';
// Direct (non-lazy) import: the "Created Links" tab was lazy-loaded, and a
// stale JS chunk after a deploy made it fail to load ("no page"). Bundling it
// avoids the chunk fetch entirely.
import EventCategoriesPanel from '@/components/EventCategoriesPanel';
import InvitationLinksPanel from '@/components/InvitationLinksPanel';
import StoragePoolPanel from '@/components/StoragePoolPanel';
import MandalaLoader from '@/components/luxury/MandalaLoader';
import ScrollSection from '@/components/luxury/ScrollSection';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import '@/styles/luxury.css';

// Pricing tab now redirects to the unified /super-admin/pricing hub.
// The legacy GuidedPricingFlow, SuperAdminPricingEditor, etc. have been
// consolidated into a single audience-aware page.

const PRICING_SUBTABS = [];

const PlansPricingHub = () => {
  const navigate = useNavigate();
  useEffect(() => { navigate('/super-admin/pricing'); }, [navigate]);
  return (
    <div data-testid="plans-pricing-hub" className="py-12 text-center">
      <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
        Redirecting to the unified Pricing Hub…
      </p>
    </div>
  );
};

// Lazy-load SuperAdminGiftCodes only when its tab is opened
const SuperAdminGiftCodes = lazy(() => import('./SuperAdminGiftCodes'));

// Embed the gift-codes admin component without its outer LuxuryShell.
// We just lazy-load SuperAdminGiftCodes inside an offset wrapper so its
// own back-button can take you back here.
const InlineGiftCodes = () => (
  <div className="-mx-1 -my-1" data-testid="inline-gift-codes-embed">
    <SuperAdminGiftCodes />
  </div>
);

const ExternalLink = ({ to, title, desc }) => (
  <div className="text-center py-12 px-6" data-testid="external-link-block">
    <h4 className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>{title}</h4>
    <p className="text-sm mb-5 max-w-xl mx-auto" style={{ color: 'var(--lux-text-muted)' }}>{desc}</p>
    <a
      href={to}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[11px] tracking-[0.3em] uppercase font-medium"
      style={{ background: '#D4AF37', color: '#1A0F08' }}
    >
      Open editor →
    </a>
  </div>
);

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  visible: (i = 0) => ({ opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] } }),
};

const LuxurySuperAdminDashboard = () => {
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();
  const [tab, setTab] = useState('admins');
  const [admins, setAdmins] = useState([]);
  // ── Normal-user (couple / guest) management — July 2025
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState('all');
  const [userDetailFor, setUserDetailFor] = useState(null);          // { user_id }
  const [allUsersSearch, setAllUsersSearch] = useState('');          // combined "Users" tab search
  const [photoGroups, setPhotoGroups] = useState([]);                // per-profile photo uploads
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoDetail, setPhotoDetail] = useState(null);              // { wedding_id } → modal
  const [notif, setNotif] = useState(null);                          // aggregated notifications
  // Buyers who asked for a feature we don't sell and left a phone number. Shown
  // as a badge because a lead nobody notices is a lead lost.
  const [wishNew, setWishNew] = useState(0);
  const [notifLoading, setNotifLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [analytics, setAnalytics] = useState({
    summary: null,
    series: [],
    leaderboard: [],
    range: 30,
  });
  const [analyticsBusy, setAnalyticsBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return; // wait for auth to hydrate from localStorage
    if (!admin) { navigate('/super-admin/login'); return; }
    if (admin.role !== 'super_admin' && admin.role !== 'SUPER_ADMIN') { navigate('/studio/dashboard'); return; }
    fetchAdmins();
    fetchAuditLogs();
    fetchAnalytics(30);
    fetchUsers();
    // Badge only — best-effort. A failure here must never blank the console.
    axios.get(`${API_URL}/api/admin/feature-wishes/summary`)
      .then((r) => setWishNew(Number(r.data?.new) || 0))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, authLoading]);

  // Lazy-load Photos / Notifications when their tab is first opened.
  useEffect(() => {
    if (tab === 'photos' && !photosLoading && photoGroups.length === 0) fetchPhotos();
    if (tab === 'notifications' && !notifLoading && !notif) fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const fetchAnalytics = async (days = 30) => {
    setAnalyticsBusy(true);
    try {
      const [sum, ts, lb] = await Promise.all([
        axios.get(`${API_URL}/api/super-admin/v2/revenue/summary?days=${days}`).then(r => r.data).catch(() => null),
        axios.get(`${API_URL}/api/super-admin/v2/revenue/timeseries?days=${days}`).then(r => r.data).catch(() => ({ series: [] })),
        axios.get(`${API_URL}/api/super-admin/v2/leaderboard/photographers?by=revenue`).then(r => r.data).catch(() => ({ items: [] })),
      ]);
      setAnalytics({
        summary: sum,
        series: ts?.series || [],
        leaderboard: lb?.items || [],
        range: days,
      });
    } finally {
      setAnalyticsBusy(false);
    }
  };

  const fetchAdmins = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/super-admin/admins`);
      setAdmins(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Photos — every user-uploaded gallery / face-match photo, grouped per event.
  const fetchPhotos = async () => {
    setPhotosLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/super-admin/gallery-uploads`);
      setPhotoGroups(res.data?.uploads || []);
    } catch (e) { console.error(e); setPhotoGroups([]); }
    finally { setPhotosLoading(false); }
  };

  // Notifications — aggregate event requests + portfolio requests + photo uploads.
  const fetchNotifications = async () => {
    setNotifLoading(true);
    try {
      const [ev, pf, ph] = await Promise.all([
        axios.get(`${API_URL}/api/admin/fulfillment/requests`).then((r) => r.data).catch(() => ({})),
        axios.get(`${API_URL}/api/admin/portfolio-build-requests`).then((r) => r.data).catch(() => ({})),
        axios.get(`${API_URL}/api/super-admin/gallery-uploads`).then((r) => r.data).catch(() => ({})),
      ]);
      const events = (ev.requests || ev.items || ev || []);
      const portfolios = (pf.requests || pf.items || pf || []);
      const photos = (ph.uploads || []);
      setNotif({
        events: Array.isArray(events) ? events : [],
        portfolios: Array.isArray(portfolios) ? portfolios : [],
        photos,
      });
    } catch (e) { console.error(e); setNotif({ events: [], portfolios: [], photos: [] }); }
    finally { setNotifLoading(false); }
  };

  // ── Normal-user management (July 2025)
  const fetchUsers = async (q, statusFilter) => {
    setUsersLoading(true);
    try {
      const params = {};
      const qVal = (q !== undefined ? q : userSearch).trim();
      if (qVal) params.q = qVal;
      const sf = statusFilter !== undefined ? statusFilter : userStatusFilter;
      if (sf && sf !== 'all') params.status = sf;
      const res = await axios.get(`${API_URL}/api/super-admin/users`, { params });
      setUsers(res.data?.users || []);
    } catch (e) {
      console.error(e);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  const toggleUserStatus = async (u, nextStatus) => {
    const wanted = nextStatus || (u.status === 'active' ? 'suspended' : 'active');
    const reason = wanted === 'active'
      ? 'Re-activated by super-admin'
      : window.prompt(`Reason for setting status to "${wanted}" (optional):`, '') || '';
    try {
      await axios.put(`${API_URL}/api/super-admin/users/${u.user_id}/status`, {
        status: wanted, reason,
      });
      fetchUsers();
    } catch (e) {
      alert(e.response?.data?.detail || 'Failed to update user status');
    }
  };

  const userStats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => (u.status || 'active') === 'active').length;
    const suspended = users.filter((u) => u.status === 'suspended').length;
    const blocked = users.filter((u) => u.status === 'blocked').length;
    return { total, active, suspended, blocked };
  }, [users]);

  const fetchAuditLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/audit-logs`);
      setAuditLogs(res.data || []);
    } catch (e) { /* optional */ }
  };

  const stats = useMemo(() => {
    const photographers = admins.filter((a) => a.role === 'admin');
    const activeCount  = photographers.filter((a) => a.status === 'active').length;
    return {
      photographers: photographers.length,
      active: activeCount,
    };
  }, [admins]);

  const filteredAdmins = useMemo(() => {
    const photographers = admins.filter((a) => a.role === 'admin');
    if (!search.trim()) return photographers;
    const q = search.toLowerCase();
    return photographers.filter((a) =>
      (a.email || '').toLowerCase().includes(q) ||
      (a.name || '').toLowerCase().includes(q)
    );
  }, [admins, search]);

  // Combined "Users" tab — every account (photographers + normal users) in one
  // clickable list. Both `admins` and `users` are fetched on mount.
  const allPeople = useMemo(() => {
    const photogs = admins.filter((a) => a.role === 'admin').map((a) => ({
      kind: 'photographer', id: a.id, name: a.name, email: a.email,
      status: a.status || 'active', phone: a.phone, created_at: a.created_at,
      count: a.profiles_count ?? 0, raw: a,
    }));
    const norms = users.map((u) => ({
      kind: 'user', id: u.user_id, name: u.name, email: u.email,
      status: u.status || 'active', phone: u.phone, created_at: u.created_at,
      count: u.profiles_count ?? 0, raw: u,
    }));
    const merged = [...photogs, ...norms];
    const q = allUsersSearch.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((p) => (p.email || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q));
  }, [admins, users, allUsersSearch]);

  const toggleStatus = async (a) => {
    const newStatus = a.status === 'active' ? 'suspended' : 'active';
    try {
      await axios.put(`${API_URL}/api/super-admin/admins/${a.id}/status`, { status: newStatus });
      fetchAdmins();
    } catch (e) { alert(e.response?.data?.detail || 'Failed to update status'); }
  };

  return (
    <LuxuryShell
      eyebrow="◆ Platform Sovereignty"
      title="Super Admin Console"
      showCredits={false}
      testid="luxury-super-admin-dashboard"
    >
      <div className="px-6 md:px-10 py-10 max-w-[1400px] mx-auto">
        {/* Header */}
        <ScrollSection className="mb-12">
          <span className="lux-eyebrow block mb-4">◆ Platform Control</span>
          <h1 className="font-display text-[2.6rem] md:text-[4rem] leading-[1.02] tracking-tight" style={{ color: 'var(--lux-text)' }}>
            Sovereign <span className="text-gold italic font-script">command.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[1.02rem]" style={{ color: 'var(--lux-text-muted)' }}>
            Manage every photographer, design, plan and feature flag from one console.
          </p>
        </ScrollSection>

        {/* Stat tiles */}
        <motion.div initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Stat label="Photographers"    value={stats.photographers} icon={Users}      testid="stat-photographers" />
          <Stat label="Active Studios"   value={stats.active}        icon={ShieldCheck} testid="stat-active" />
          <Stat label="Normal Users"     value={userStats.total}     icon={Heart}      testid="stat-users-total" />
        </motion.div>

        {/* Every created invitation link, visible on landing without a tab
            click. Hidden while the dedicated tab is open so it isn't shown
            twice on the same screen. */}
        {tab !== 'events' && (
          <div className="mb-6" data-testid="dashboard-links-overview">
            <InvitationLinksPanel compact />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { id: 'notifications', label: 'Notifications' },
            { id: 'analytics',  label: 'Analytics' },
            { id: 'admins',     label: 'Photographers' },
            { id: 'users',      label: 'Normal Users' },
            { id: 'audit',      label: 'Audit Log' },
            { id: 'plans',      label: 'Plans & Pricing' },
            { id: 'events',     label: 'Created Links' },
            { id: 'categories', label: 'Event Categories' },
            { id: 'gift_codes', label: 'Gift Codes' },
            { id: 'storage',    label: 'Storage' },
          ].map((t) => (
            <button
              key={t.id} onClick={() => setTab(t.id)}
              className="px-5 py-2 rounded-full text-xs tracking-[0.25em] uppercase transition-all"
              style={tab === t.id
                ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                : { background: 'transparent', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
              data-testid={`tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Action bar */}
        {tab === 'admins' && (
          <div className="lux-glass p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => navigate('/super-admin/pricing')} className="lux-btn" data-testid="pricing-hub-btn">
                <IndianRupee className="w-4 h-4" /> Pricing
              </button>
              <button onClick={() => navigate('/super-admin/fulfillment')} className="lux-btn lux-btn-ghost" data-testid="fulfillment-btn">
                <FilePlus2 className="w-4 h-4" /> Fulfillment
              </button>
              <button onClick={() => navigate('/super-admin/feature-flags')} className="lux-btn lux-btn-ghost" data-testid="feature-flags-btn">
                <Flag className="w-4 h-4" /> Feature Flags
              </button>
              <button onClick={() => navigate('/super-admin/support')} className="lux-btn lux-btn-ghost" data-testid="support-queue-btn">
                <LifeBuoy className="w-4 h-4" /> Support
              </button>
              <button onClick={() => navigate('/super-admin/system-health')} className="lux-btn lux-btn-ghost" data-testid="system-health-btn">
                <Activity className="w-4 h-4" /> System Health
              </button>
              <button onClick={() => navigate('/super-admin/investigation')} className="lux-btn lux-btn-ghost" data-testid="investigation-btn">
                <Search className="w-4 h-4" /> Investigate
              </button>
              <button onClick={() => navigate('/super-admin/bi')} className="lux-btn lux-btn-ghost" data-testid="bi-btn">
                <BarChart3 className="w-4 h-4" /> Business Intel
              </button>
              <button onClick={() => navigate('/super-admin/disputes')} className="lux-btn lux-btn-ghost" data-testid="disputes-btn">
                <Gavel className="w-4 h-4" /> Disputes
              </button>
              <button onClick={() => navigate('/super-admin/moderation')} className="lux-btn lux-btn-ghost" data-testid="moderation-btn">
                <ShieldOff className="w-4 h-4" /> Moderation
              </button>
              <button onClick={() => navigate('/super-admin/qr-analytics')} className="lux-btn lux-btn-ghost" data-testid="qr-analytics-btn">
                <QrCode className="w-4 h-4" /> QR Analytics
              </button>
              <button onClick={() => navigate('/super-admin/security')} className="lux-btn lux-btn-ghost" data-testid="security-btn">
                <ShieldCheck className="w-4 h-4" /> Security (MFA/RBAC)
              </button>
              <button onClick={() => navigate('/super-admin/delivery')} className="lux-btn lux-btn-ghost" data-testid="delivery-btn">
                <Mail className="w-4 h-4" /> Delivery
              </button>
              <button onClick={() => navigate('/super-admin/storage-analytics')} className="lux-btn lux-btn-ghost" data-testid="storage-analytics-btn">
                <Layers className="w-4 h-4" /> Storage
              </button>
              <button onClick={() => navigate('/super-admin/profitability')} className="lux-btn lux-btn-ghost" data-testid="profitability-btn">
                <IndianRupee className="w-4 h-4" /> Profit
              </button>
              <button onClick={() => navigate('/super-admin/face-ops')} className="lux-btn lux-btn-ghost" data-testid="face-ops-btn">
                <BarChart3 className="w-4 h-4" /> Face Ops
              </button>
              <button onClick={() => navigate('/super-admin/providers')} className="lux-btn lux-btn-ghost" data-testid="providers-btn">
                <Flag className="w-4 h-4" /> Providers
              </button>
              <button onClick={() => navigate('/super-admin/feature-requests')}
                className={wishNew > 0 ? 'lux-btn' : 'lux-btn lux-btn-ghost'}
                data-testid="feature-requests-btn"
                style={wishNew > 0 ? { border: '1px solid rgba(212,175,55,0.6)' } : undefined}>
                <Bell className="w-4 h-4" /> Feature Requests
                {wishNew > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                    style={{ background: '#D4AF37', color: '#16110C', fontWeight: 700 }}
                    data-testid="feature-requests-badge">
                    {wishNew}
                  </span>
                )}
              </button>
            </div>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-transparent outline-none text-sm"
                style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                data-testid="search-admins"
              />
            </div>
          </div>
        )}

        {/* Tab content */}
        {tab === 'analytics' && (
          <AnalyticsPanel data={analytics} busy={analyticsBusy} onRange={fetchAnalytics} />
        )}

        {tab === 'admins' && (
          loading ? (
            <div className="py-20 grid place-items-center"><MandalaLoader /></div>
          ) : filteredAdmins.length === 0 ? (
            <div className="lux-glass p-10 text-center">
              <p className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>No photographers yet</p>
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Create your first studio above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="admins-list">
              {filteredAdmins.map((a, i) => (
                <motion.div key={a.id} variants={fadeUp} custom={i} initial="hidden" animate="visible"
                  className="lux-glass p-6"
                  data-testid={`admin-row-${a.id}`}
                >
                  <div className="flex items-start justify-between mb-3 gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-xl mb-0.5 truncate" style={{ color: 'var(--lux-text)' }}>{a.name || a.email}</h3>
                      <p className="text-xs truncate" style={{ color: 'var(--lux-text-muted)' }}>{a.email}</p>
                    </div>
                    <span className="text-[9px] tracking-[0.25em] uppercase px-2 py-1 rounded-full shrink-0"
                      style={a.status === 'active'
                        ? { background: 'rgba(138,154,91,0.16)', color: '#A5B97A', border: '1px solid rgba(138,154,91,0.35)' }
                        : { background: 'rgba(139,0,0,0.18)', color: '#FFB0A0', border: '1px solid rgba(139,0,0,0.4)' }}>
                      {a.status}
                    </span>
                  </div>

                  <div className="lux-hairline mb-4" />

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <Mini label="Invitations" value={a.profiles_count ?? 0} />
                    <Mini label="Joined" value={a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'} small />
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    <ActionBtn icon={Eye}      label="Full details" onClick={() => navigate(`/super-admin/photographers/${a.id}`)} testid={`view-detail-${a.id}`} />
                    <ActionBtn icon={a.status === 'active' ? ShieldOff : ShieldCheck}
                      label={a.status === 'active' ? 'Suspend' : 'Activate'}
                      onClick={() => toggleStatus(a)} testid={`toggle-status-${a.id}`} danger={a.status === 'active'} />
                  </div>
                </motion.div>
              ))}
            </div>
          )
        )}

        {tab === 'users' && (
          <div data-testid="users-panel">
            {/* Action bar — search + status filter */}
            <div className="lux-glass p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2 flex-wrap" data-testid="users-status-filter">
                {[
                  { id: 'all',       label: 'All' },
                  { id: 'active',    label: 'Active' },
                  { id: 'suspended', label: 'Suspended' },
                  { id: 'blocked',   label: 'Blocked' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setUserStatusFilter(s.id); fetchUsers(undefined, s.id); }}
                    className="px-4 py-1.5 rounded-full text-[10px] tracking-[0.25em] uppercase"
                    style={userStatusFilter === s.id
                      ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 }
                      : { background: 'transparent', color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                    data-testid={`user-status-${s.id}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); fetchUsers(userSearch); }}
                className="relative w-full md:w-72"
              >
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name, email, phone"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-transparent outline-none text-sm"
                  style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                  data-testid="search-users"
                />
              </form>
            </div>

            {/* Mini user stat tiles */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <MiniStat label="Active"    value={userStats.active}       tone="ok"     testid="ustat-active" />
              <MiniStat label="Suspended" value={userStats.suspended}    tone="warn"   testid="ustat-suspended" />
              <MiniStat label="Blocked"   value={userStats.blocked}      tone="bad"    testid="ustat-blocked" />
            </div>

            {/* User list */}
            {usersLoading ? (
              <div className="py-20 grid place-items-center"><MandalaLoader /></div>
            ) : users.length === 0 ? (
              <div className="lux-glass p-10 text-center">
                <p className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>No users found</p>
                <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                  Couples haven't signed up yet, or your filter is too narrow.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="users-list">
                {users.map((u, i) => (
                  <motion.div
                    key={u.user_id}
                    variants={fadeUp} custom={i} initial="hidden" animate="visible"
                    className="lux-glass p-6"
                    data-testid={`user-row-${u.user_id}`}
                  >
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-display text-xl mb-0.5 truncate" style={{ color: 'var(--lux-text)' }}>
                          {u.name || u.email}
                        </h3>
                        <p className="text-xs truncate flex items-center gap-1.5" style={{ color: 'var(--lux-text-muted)' }}>
                          <Mail className="w-3 h-3 shrink-0" /> {u.email}
                        </p>
                        {u.phone && (
                          <p className="text-xs truncate mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--lux-text-muted)' }}>
                            <Phone className="w-3 h-3 shrink-0" /> {u.phone}
                          </p>
                        )}
                      </div>
                      <UserStatusPill status={u.status || 'active'} />
                    </div>

                    <div className="lux-hairline mb-4" />

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Mini label="Invitations" value={u.profiles_count || 0} />
                      <Mini label="Joined"      value={u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'} small />
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <ActionBtn icon={Eye} label="Full details"
                        onClick={() => setUserDetailFor(u)}
                        testid={`view-user-${u.user_id}`} />
                      {(u.status || 'active') === 'active' && (
                        <>
                          <ActionBtn icon={ShieldOff} label="Suspend"
                            onClick={() => toggleUserStatus(u, 'suspended')}
                            danger testid={`suspend-user-${u.user_id}`} />
                          <ActionBtn icon={Ban} label="Block"
                            onClick={() => toggleUserStatus(u, 'blocked')}
                            danger testid={`block-user-${u.user_id}`} />
                        </>
                      )}
                      {(u.status === 'suspended' || u.status === 'blocked') && (
                        <ActionBtn icon={UserCheck} label="Re-activate"
                          onClick={() => toggleUserStatus(u, 'active')}
                          testid={`activate-user-${u.user_id}`} />
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'all_users' && (
          <div data-testid="all-users-panel">
            <div className="lux-glass p-5 mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-4 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                <span>Total <b style={{ color: 'var(--lux-text)' }}>{allPeople.length}</b></span>
                <span>Photographers <b style={{ color: 'var(--lux-text)' }}>{allPeople.filter((p) => p.kind === 'photographer').length}</b></span>
                <span>Normal users <b style={{ color: 'var(--lux-text)' }}>{allPeople.filter((p) => p.kind === 'user').length}</b></span>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
                <input type="text" value={allUsersSearch} onChange={(e) => setAllUsersSearch(e.target.value)}
                  placeholder="Search all users by name or email"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-transparent outline-none text-sm"
                  style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                  data-testid="search-all-users" />
              </div>
            </div>

            {(loading || usersLoading) && allPeople.length === 0 ? (
              <div className="py-20 grid place-items-center"><MandalaLoader /></div>
            ) : allPeople.length === 0 ? (
              <div className="lux-glass p-10 text-center">
                <p className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>No users yet</p>
                <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>Photographers and couples will appear here once they sign up.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="all-users-list">
                {allPeople.map((p, i) => (
                  <motion.div key={`${p.kind}-${p.id}`} variants={fadeUp} custom={i} initial="hidden" animate="visible"
                    className="lux-glass p-6" data-testid={`all-user-row-${p.id}`}>
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[8px] tracking-[0.25em] uppercase px-2 py-0.5 rounded-full shrink-0"
                            style={p.kind === 'photographer'
                              ? { background: 'rgba(212,175,55,0.16)', color: '#E8C97A', border: '1px solid rgba(212,175,55,0.35)' }
                              : { background: 'rgba(120,140,200,0.16)', color: '#AEC0EE', border: '1px solid rgba(120,140,200,0.35)' }}>
                            {p.kind === 'photographer' ? 'Photographer' : 'Normal User'}
                          </span>
                        </div>
                        <h3 className="font-display text-xl mb-0.5 truncate" style={{ color: 'var(--lux-text)' }}>{p.name || p.email}</h3>
                        <p className="text-xs truncate flex items-center gap-1.5" style={{ color: 'var(--lux-text-muted)' }}><Mail className="w-3 h-3 shrink-0" /> {p.email}</p>
                        {p.phone && <p className="text-xs truncate mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--lux-text-muted)' }}><Phone className="w-3 h-3 shrink-0" /> {p.phone}</p>}
                      </div>
                      <span className="text-[9px] tracking-[0.25em] uppercase px-2 py-1 rounded-full shrink-0"
                        style={p.status === 'active'
                          ? { background: 'rgba(138,154,91,0.16)', color: '#A5B97A', border: '1px solid rgba(138,154,91,0.35)' }
                          : { background: 'rgba(139,0,0,0.18)', color: '#FFB0A0', border: '1px solid rgba(139,0,0,0.4)' }}>
                        {p.status}
                      </span>
                    </div>
                    <div className="lux-hairline mb-4" />
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <Mini label="Invitations" value={p.count} />
                      <Mini label="Joined" value={p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'} small />
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <ActionBtn icon={Eye} label="Full details"
                        onClick={() => p.kind === 'photographer' ? navigate(`/super-admin/photographers/${p.id}`) : setUserDetailFor(p.raw)}
                        testid={`view-all-user-${p.id}`} />
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'notifications' && (
          <div data-testid="notifications-panel">
            {notifLoading || !notif ? (
              <div className="py-20 grid place-items-center"><MandalaLoader /></div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <MiniStat label="Event requests"     value={notif.events.length}     tone="ok"   testid="notif-events" />
                  <MiniStat label="Portfolio requests" value={notif.portfolios.length} tone="warn" testid="notif-portfolios" />
                  <MiniStat label="Photo uploads"      value={notif.photos.length}     tone="ok"   testid="notif-photos" />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="lux-eyebrow">◆ Latest activity</span>
                  <button onClick={fetchNotifications} className="lux-btn lux-btn-ghost text-xs">Refresh</button>
                </div>
                {(notif.events.length + notif.portfolios.length + notif.photos.length) === 0 ? (
                  <div className="lux-glass p-10 text-center" style={{ color: 'var(--lux-text-muted)' }}>No requests or uploads yet.</div>
                ) : (
                  <div className="space-y-2" data-testid="notifications-list">
                    {notif.events.map((r, i) => (
                      <NotifRow key={`ev-${r.id || i}`} kind="Event request" tone="#A5B97A"
                        title={r.event_name || r.title || r.couple_name || r.buyer_name || r.id || 'Event request'}
                        sub={r.status || r.buyer_kind || ''} at={r.created_at || r.submitted_at}
                        onOpen={() => navigate('/super-admin/fulfillment')} />
                    ))}
                    {notif.portfolios.map((r, i) => (
                      <NotifRow key={`pf-${r.id || i}`} kind="Portfolio request" tone="#E8C97A"
                        title={r.studio_name || r.brand_name || r.title || r.id || 'Portfolio request'}
                        sub={r.status || ''} at={r.created_at || r.submitted_at}
                        onOpen={() => navigate('/super-admin/fulfillment')} />
                    ))}
                    {notif.photos.map((g, i) => (
                      <NotifRow key={`ph-${g.wedding_id || i}`} kind="Photo upload" tone="#AEC0EE"
                        title={g.profile_name || g.wedding_id}
                        sub={`${g.total} photos · ${g.guest_uploads} selfies`} at={g.last_at}
                        onOpen={() => { setTab('photos'); setPhotoDetail(g); }} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {tab === 'photos' && (
          <div data-testid="photos-panel">
            <div className="flex items-center justify-between mb-4">
              <span className="lux-eyebrow">◆ User-uploaded photos (AI face-match &amp; gallery)</span>
              <button onClick={fetchPhotos} className="lux-btn lux-btn-ghost text-xs">Refresh</button>
            </div>
            {photosLoading ? (
              <div className="py-20 grid place-items-center"><MandalaLoader /></div>
            ) : photoGroups.length === 0 ? (
              <div className="lux-glass p-10 text-center">
                <p className="font-display text-2xl mb-2" style={{ color: 'var(--lux-text)' }}>No photos uploaded yet</p>
                <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>When a user uploads photos or guests add face-match selfies, the event profile appears here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="photos-list">
                {photoGroups.map((g, i) => (
                  <motion.div key={g.wedding_id} variants={fadeUp} custom={i} initial="hidden" animate="visible"
                    className="lux-glass p-6" data-testid={`photo-group-${g.wedding_id}`}>
                    <div className="flex items-start justify-between mb-3 gap-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-[8px] tracking-[0.25em] uppercase px-2 py-0.5 rounded-full"
                          style={g.owner_kind === 'photographer'
                            ? { background: 'rgba(212,175,55,0.16)', color: '#E8C97A', border: '1px solid rgba(212,175,55,0.35)' }
                            : { background: 'rgba(120,140,200,0.16)', color: '#AEC0EE', border: '1px solid rgba(120,140,200,0.35)' }}>
                          {g.owner_kind}
                        </span>
                        <h3 className="font-display text-xl mt-1 truncate" style={{ color: 'var(--lux-text)' }}>{g.profile_name}</h3>
                      </div>
                      <span className="text-xs whitespace-nowrap" style={{ color: 'var(--lux-text-muted)' }}>
                        {g.last_at ? new Date(g.last_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <div className="lux-hairline mb-4" />
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <Mini label="Total" value={g.total} />
                      <Mini label="Gallery" value={g.gallery} />
                      <Mini label="Selfies" value={g.guest_uploads} />
                    </div>
                    <div className="text-[10px] mb-4 space-y-0.5" style={{ color: 'var(--lux-text-faint)' }}>
                      <div className="truncate" title={g.disk_paths?.gallery}>📁 Gallery: <code>{g.disk_paths?.gallery}</code></div>
                      <div className="truncate" title={g.disk_paths?.guest_uploads}>🤳 Selfies: <code>{g.disk_paths?.guest_uploads}</code></div>
                    </div>
                    <ActionBtn icon={Eye} label="View photos" onClick={() => setPhotoDetail(g)} testid={`view-photos-${g.wedding_id}`} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'audit' && (
          <div className="lux-glass p-6">
            <h3 className="font-display text-2xl mb-4" style={{ color: 'var(--lux-text)' }}>Audit Trail</h3>
            {auditLogs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No audit entries yet.</p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2" data-testid="audit-logs-list">
                {auditLogs.slice(0, 100).map((log) => (
                  <div key={log.id} className="px-4 py-3 rounded-lg flex items-center justify-between gap-4"
                    style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-sm truncate" style={{ color: 'var(--lux-text)' }}>{log.action || log.event}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--lux-text-muted)' }}>{log.details || log.description || ''}</div>
                    </div>
                    <div className="text-xs whitespace-nowrap" style={{ color: 'var(--lux-text-muted)' }}>
                      {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'plans' && (
          <div className="lux-glass p-6 sm:p-8" data-testid="plans-pricing-panel">
            <PlansPricingHub />
          </div>
        )}

        {/* "Created Links" now actually lists the created invitation links.
            It previously rendered EventCategoriesPanel — the event-category
            editor — which is a different thing entirely, so no admin screen
            listed the links at all. Categories moved to their own tab below. */}
        {tab === 'events' && <InvitationLinksPanel />}

        {tab === 'categories' && (
          <Suspense fallback={<div className="lux-glass p-12 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div>}>
            <EventCategoriesPanel />
          </Suspense>
        )}

        {/* BUG 5 FIX: render the Gift Codes admin panel (lazy-loaded
            from SuperAdminGiftCodes via the InlineGiftCodes wrapper). */}
        {tab === 'gift_codes' && (
          <Suspense fallback={<div className="lux-glass p-12 text-center" style={{ color: 'var(--lux-text-muted)' }}>Loading…</div>}>
            <InlineGiftCodes />
          </Suspense>
        )}

        {/* V1 multi-drive storage pool (see MULTI_DRIVE_STORAGE_DESIGN.md) */}
        {tab === 'storage' && <StoragePoolPanel />}
      </div>

      {showCreate && <CreateAdminModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); fetchAdmins(); }} />}
      {userDetailFor && (
        <UserDetailModal
          userRow={userDetailFor}
          onClose={() => setUserDetailFor(null)}
          onChange={() => fetchUsers()}
          toggleStatus={toggleUserStatus}
        />
      )}
      {photoDetail && (
        <PhotoUploadsModal group={photoDetail} onClose={() => setPhotoDetail(null)} />
      )}
    </LuxuryShell>
  );
};

// Notifications row — one activity item (event / portfolio / photo).
const NotifRow = ({ kind, tone, title, sub, at, onOpen }) => (
  <div className="lux-glass p-4 flex items-center gap-3" data-testid="notif-row">
    <span className="text-[8px] tracking-[0.22em] uppercase px-2 py-1 rounded-full shrink-0"
      style={{ background: `${tone}22`, color: tone, border: `1px solid ${tone}55` }}>{kind}</span>
    <div className="min-w-0 flex-1">
      <div className="text-sm truncate" style={{ color: 'var(--lux-text)' }}>{title}</div>
      {sub && <div className="text-[11px] truncate" style={{ color: 'var(--lux-text-muted)' }}>{sub}</div>}
    </div>
    <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--lux-text-faint)' }}>
      {at ? new Date(at).toLocaleString() : ''}
    </span>
    <button onClick={onOpen} className="lux-btn lux-btn-ghost text-xs shrink-0">Open</button>
  </div>
);

// Photo uploads modal — every photo for one event profile + storage folders.
const PhotoUploadsModal = ({ group, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const src = (u) => (u ? (u.startsWith('http') ? u : `${API_URL}${u}`) : null);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    axios.get(`${API_URL}/api/super-admin/gallery-uploads/${group.wedding_id}`)
      .then((r) => { if (alive) setData(r.data); })
      .catch(() => { if (alive) setData({ photos: [] }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [group.wedding_id]);
  const photos = data?.photos || [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(6,4,2,0.9)' }} onClick={onClose} data-testid="photo-uploads-modal">
      <div className="lux-glass max-w-5xl w-full max-h-[88vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4 gap-3">
          <div>
            <h3 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{group.profile_name}</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>{group.total} photos · {group.guest_uploads} face-match selfies · {group.gallery} gallery</p>
          </div>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--lux-text)' }} /></button>
        </div>
        <div className="text-[11px] mb-5 space-y-1 lux-glass p-3" style={{ color: 'var(--lux-text-faint)' }}>
          <div className="lux-eyebrow mb-1" style={{ color: 'var(--lux-text-muted)' }}>Storage folders</div>
          <div className="break-all">📁 Gallery photos: <code>{group.disk_paths?.gallery}</code></div>
          <div className="break-all">🤳 Face-match selfies: <code>{group.disk_paths?.guest_uploads}</code></div>
        </div>
        {loading ? (
          <div className="py-16 grid place-items-center"><MandalaLoader /></div>
        ) : photos.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--lux-text-muted)' }}>No photos found on disk for this profile.</div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {photos.map((p) => (
              <a key={p.id} href={src(p.url)} target="_blank" rel="noreferrer" className="relative rounded-lg overflow-hidden block" style={{ aspectRatio: '1' }} title={`${p.folder} · ${p.source || ''}`}>
                <img src={src(p.thumb_url || p.url)} alt="" loading="lazy" className="w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1 text-[8px] px-1 py-0.5 rounded"
                  style={{ background: 'rgba(0,0,0,0.6)', color: p.folder === 'guest_uploads' ? '#AEC0EE' : '#E8C97A' }}>
                  {p.folder === 'guest_uploads' ? 'selfie' : 'gallery'}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value, icon: Icon, testid }) => (
  <motion.div variants={fadeUp} className="lux-glass p-5 flex flex-col gap-3" data-testid={testid}>
    <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
      <Icon className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} /> {label}
    </div>
    <div className="font-display text-4xl text-gold leading-none">{value}</div>
  </motion.div>
);

const Mini = ({ label, value, highlight }) => (
  <div className="text-center">
    <div className="text-[9px] tracking-[0.25em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
    <div className={`font-display text-xl ${highlight ? 'text-gold' : ''}`} style={!highlight ? { color: 'var(--lux-text)' } : {}}>{value}</div>
  </div>
);

const ActionBtn = ({ icon: Icon, label, onClick, testid, danger }) => (
  <button onClick={onClick} data-testid={testid}
    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
    style={{
      background: 'transparent',
      color: danger ? '#FFB0A0' : 'var(--lux-text)',
      border: `1px solid ${danger ? 'rgba(139,0,0,0.4)' : 'var(--lux-border)'}`,
    }}
  >
    <Icon className="w-3 h-3" /> {label}
  </button>
);

const ModalShell = ({ title, eyebrow, onClose, children, testid }) => (
  <motion.div
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-[70] flex items-center justify-center p-4 luxe luxe-grain"
    style={{ background: 'rgba(8,5,3,0.7)', backdropFilter: 'blur(8px)' }}
    onClick={onClose}
    data-testid={testid}
  >
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      onClick={(e) => e.stopPropagation()}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="lux-glass relative w-full max-w-lg max-h-[90vh] overflow-y-auto p-8"
      style={{ background: 'var(--lux-chrome)' }}
    >
      <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full grid place-items-center"
        style={{ color: 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}>
        <X className="w-4 h-4" />
      </button>
      {eyebrow && <span className="lux-eyebrow block mb-3">◆ {eyebrow}</span>}
      <h2 className="font-display text-2xl md:text-3xl mb-6" style={{ color: 'var(--lux-text)' }}>{title}</h2>
      {children}
    </motion.div>
  </motion.div>
);

const labelStyle = { color: 'var(--lux-text-muted)' };
const inputStyle = {
  width: '100%', padding: '0.85rem 1rem', background: 'transparent', color: 'var(--lux-text)',
  border: '1px solid var(--lux-border)', borderRadius: '0.5rem', outline: 'none',
  fontFamily: 'Manrope, sans-serif', fontSize: '0.92rem', caretColor: '#D4AF37',
};

const CreateAdminModal = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  // Friendly error formatter — converts pydantic validation arrays into readable lines
  const friendlyError = (detail) => {
    if (!detail) return 'Failed to create photographer';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((d) => {
        const field = (d.loc || []).slice(-1)[0] || 'field';
        return `${field}: ${d.msg || 'invalid'}`;
      }).join(' · ');
    }
    return JSON.stringify(detail);
  };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    if ((form.password || '').length < 8) {
      setErr('Password must be at least 8 characters long');
      setBusy(false);
      return;
    }
    try {
      await axios.post(`${API_URL}/api/super-admin/admins`, {
        email: form.email, password: form.password, name: form.name,
      });
      onCreated();
    } catch (ex) { setErr(friendlyError(ex.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title="Create Photographer" eyebrow="New Studio" onClose={onClose} testid="create-admin-modal">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Studio Name"><input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} placeholder="Mani's Studio" data-testid="new-admin-name" /></Field>
        <Field label="Email"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} placeholder="studio@example.com" data-testid="new-admin-email" /></Field>
        <Field label="Password (min 8 characters)"><input type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={inputStyle} placeholder="At least 8 characters" data-testid="new-admin-password" /></Field>
        {err && <div className="text-sm px-3 py-2.5 rounded-md flex items-start gap-2" style={{ background: 'rgba(139,0,0,0.18)', color: '#FFD7C9', border: '1px solid rgba(139,0,0,0.4)' }} data-testid="create-admin-error">
          <X className="w-4 h-4 shrink-0 mt-0.5" /> {err}
        </div>}
        <button type="submit" disabled={busy} className="lux-btn w-full justify-center" data-testid="submit-create-admin">
          {busy ? 'Creating…' : 'Create Studio'} <Crown className="w-4 h-4" />
        </button>
      </form>
    </ModalShell>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={labelStyle}>{label}</span>
    {children}
  </label>
);

// ──────────────────────────────────────────────────────────────────
// Phase 8 — Analytics panel: summary tiles, revenue chart, leaderboard
// ──────────────────────────────────────────────────────────────────
const AnalyticsPanel = ({ data, busy, onRange }) => {
  const fmtINR = (n) => '₹' + (Number(n || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtNum = (n) => (Number(n || 0)).toLocaleString('en-IN');
  const summary = data.summary || { revenue_inr: 0, purchases: 0, days: data.range };
  const rangeOpts = [
    { v: 7, l: '7d' },
    { v: 30, l: '30d' },
    { v: 90, l: '90d' },
    { v: 365, l: '1y' },
  ];

  const tooltipStyle = {
    background: 'var(--lux-chrome)',
    border: '1px solid rgba(212,175,55,0.45)',
    borderRadius: 6,
    fontSize: 12,
    color: 'var(--lux-text)',
    padding: '8px 12px',
  };

  return (
    <div data-testid="analytics-panel">
      {/* Range selector */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-gold" />
          <h3 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>Revenue Analytics</h3>
        </div>
        <div className="lux-glass p-1 inline-flex gap-1" data-testid="analytics-range">
          {rangeOpts.map((r) => (
            <button
              key={r.v}
              onClick={() => onRange(r.v)}
              className="px-3 py-1.5 rounded text-[10px] tracking-[0.22em] uppercase"
              style={{
                background: data.range === r.v ? 'linear-gradient(135deg,#D4AF37,#B8941F)' : 'transparent',
                color: data.range === r.v ? '#16110C' : 'var(--lux-text)',
              }}
              data-testid={`range-${r.v}`}
            >
              {r.l}
            </button>
          ))}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="lux-glass p-5" data-testid="metric-revenue">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
            <IndianRupee className="w-3.5 h-3.5 text-gold" /> Revenue
          </div>
          <div className="font-display text-4xl mt-2 text-gold">{fmtINR(summary.revenue_inr)}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>last {summary.days || data.range} days</div>
        </div>
        <div className="lux-glass p-5" data-testid="metric-purchases">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
            <TrendingUp className="w-3.5 h-3.5 text-gold" /> Transactions
          </div>
          <div className="font-display text-4xl mt-2" style={{ color: 'var(--lux-text)' }}>{fmtNum(summary.purchases)}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>last {summary.days || data.range} days</div>
        </div>
      </div>

      {/* Revenue chart */}
      <div className="lux-glass p-5 mb-6" data-testid="revenue-chart">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Daily Revenue (₹)</h4>
          {busy && <span className="text-[10px] tracking-[0.22em] uppercase text-gold animate-pulse">Loading…</span>}
        </div>
        {data.series.length === 0 ? (
          <div className="h-64 grid place-items-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            No revenue data yet — purchases will populate this chart.
          </div>
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <AreaChart data={data.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,248,220,0.08)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--lux-text-muted)' }}
                  tickFormatter={(d) => { try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch { return d; } }}
                  axisLine={{ stroke: 'rgba(255,248,220,0.12)' }}
                  tickLine={false}
                  minTickGap={20}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--lux-text-muted)' }}
                  axisLine={{ stroke: 'rgba(255,248,220,0.12)' }}
                  tickLine={false}
                  tickFormatter={(n) => n >= 1000 ? `₹${(n / 1000).toFixed(1)}k` : `₹${n}`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(d) => { try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } }}
                  formatter={(v, n) => [n === 'revenue_inr' ? fmtINR(v) : fmtNum(v), n === 'revenue_inr' ? 'Revenue' : n]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue_inr"
                  stroke="#D4AF37"
                  strokeWidth={2}
                  fill="url(#rev-grad)"
                  isAnimationActive
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Daily revenue chart */}
      <div className="lux-glass p-5 mb-6" data-testid="revenue-chart">
        <h4 className="font-display text-lg mb-4" style={{ color: 'var(--lux-text)' }}>Daily Revenue (₹)</h4>
        {data.series.length === 0 ? (
          <div className="h-48 grid place-items-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            No data
          </div>
        ) : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={data.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,248,220,0.08)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--lux-text-muted)' }}
                  tickFormatter={(d) => { try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); } catch { return d; } }}
                  axisLine={{ stroke: 'rgba(255,248,220,0.12)' }} tickLine={false} minTickGap={20} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--lux-text-muted)' }}
                  axisLine={{ stroke: 'rgba(255,248,220,0.12)' }} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="lux-glass p-5" data-testid="leaderboard">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-gold" />
          <h4 className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Top Photographers (by revenue)</h4>
        </div>
        {data.leaderboard.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>
            No photographers ranked yet.
          </div>
        ) : (
          <div className="space-y-2">
            {data.leaderboard.slice(0, 10).map((row, idx) => (
              <div
                key={row.admin_id}
                className="flex items-center justify-between px-4 py-3 rounded-md"
                style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}
                data-testid={`leaderboard-row-${row.admin_id}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-7 h-7 rounded-full grid place-items-center font-display text-sm"
                    style={{
                      background: idx === 0 ? 'linear-gradient(135deg,#D4AF37,#B8941F)' : 'var(--lux-panel)',
                      color: idx === 0 ? '#16110C' : 'var(--lux-text)',
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="font-heading text-sm truncate" style={{ color: 'var(--lux-text)' }}>{row.name || '—'}</div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--lux-text-muted)' }}>{row.email || ''}</div>
                  </div>
                </div>
                <div className="font-display text-lg text-gold whitespace-nowrap">
                  {fmtINR(row.metric)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════════
// NORMAL-USER MANAGEMENT — supporting components (July 2025)
// ════════════════════════════════════════════════════════════════════
const MiniStat = ({ label, value, tone = 'gold', testid }) => {
  const TONES = {
    gold: { c: '#D4AF37', bg: 'rgba(212,175,55,0.10)' },
    ok:   { c: '#7FD18E', bg: 'rgba(127,209,142,0.10)' },
    warn: { c: '#E8B86B', bg: 'rgba(232,184,107,0.10)' },
    bad:  { c: '#FFB0A0', bg: 'rgba(255,176,160,0.10)' },
  };
  const t = TONES[tone] || TONES.gold;
  return (
    <div className="lux-glass p-4 flex flex-col gap-1" data-testid={testid}
      style={{ background: t.bg }}>
      <div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
      <div className="font-display text-2xl" style={{ color: t.c }}>{value}</div>
    </div>
  );
};

const UserStatusPill = ({ status }) => {
  const map = {
    active:    { c: '#7FD18E', bg: 'rgba(127,209,142,0.15)', label: 'Active' },
    suspended: { c: '#E8B86B', bg: 'rgba(232,184,107,0.15)', label: 'Suspended' },
    blocked:   { c: '#FFB0A0', bg: 'rgba(255,176,160,0.15)', label: 'Blocked' },
  };
  const s = map[status] || map.active;
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-[10px] tracking-[0.25em] uppercase shrink-0"
      style={{ color: s.c, background: s.bg, border: `1px solid ${s.c}40` }}
      data-testid={`user-status-pill-${status}`}
    >
      {s.label}
    </span>
  );
};

const UserDetailModal = ({ userRow, onClose, onChange, toggleStatus }) => {
  const [detail, setDetail] = useState(null);
  const [reqs, setReqs] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setBusy(true); setErr('');
      try {
        const res = await axios.get(`${API_URL}/api/super-admin/users/${userRow.user_id}`);
        if (alive) setDetail(res.data);
        // This user's event/invitation requests (normal-user buyer).
        try {
          const fr = await axios.get(`${API_URL}/api/admin/fulfillment/requests?buyer_kind=user`);
          const mine = (fr.data?.requests || []).filter((r) =>
            r.buyer_id === userRow.user_id || (r.buyer?.email && res.data?.user?.email && r.buyer.email === res.data.user.email));
          if (alive) setReqs(mine);
        } catch { /* ignore */ }
      } catch (e) {
        if (alive) setErr(e.response?.data?.detail || 'Failed to load user');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [userRow.user_id]);

  const user = detail?.user || userRow;
  const profiles = detail?.profiles || [];

  const handleStatus = async (next) => {
    await toggleStatus(user, next);
    // Refresh local view
    try {
      const res = await axios.get(`${API_URL}/api/super-admin/users/${userRow.user_id}`);
      setDetail(res.data);
    } catch (e) {/* ignore */}
    onChange?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 luxe luxe-grain"
      style={{ background: 'rgba(8,5,3,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      data-testid="user-detail-modal"
    >
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="lux-glass relative w-full max-w-3xl max-h-[92vh] overflow-y-auto p-8"
        style={{ background: 'var(--lux-chrome)' }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full grid place-items-center"
          style={{ color: 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}>
          <X className="w-4 h-4" />
        </button>

        <span className="lux-eyebrow block mb-3">◆ User Profile</span>
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-display text-3xl truncate" style={{ color: 'var(--lux-text)' }}>
              {user.name || user.email}
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>{user.email}</p>
            {user.phone && <p className="text-xs mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>📱 {user.phone}</p>}
          </div>
          <UserStatusPill status={user.status || 'active'} />
        </div>

        {busy && <p className="text-sm mt-4" style={{ color: 'var(--lux-text-muted)' }}>Loading…</p>}
        {err && <p className="text-sm mt-4" style={{ color: '#FFB0A0' }}>{err}</p>}

        {!busy && !err && (
          <>
            <div className="lux-hairline my-5" />
            {/* Top stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <Mini label="Invitations" value={profiles.length} />
              <Mini label="Auth"       value={user.auth_provider || 'email'} small />
              <Mini label="Joined"     value={user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'} small />
            </div>

            {/* Action row */}
            <div className="flex flex-wrap gap-2 mb-6">
              {(user.status || 'active') === 'active' && (
                <>
                  <button onClick={() => handleStatus('suspended')}
                    className="px-4 py-2 rounded-full text-xs tracking-[0.18em] uppercase"
                    style={{ color: '#E8B86B', border: '1px solid rgba(232,184,107,0.4)' }}
                    data-testid="ud-suspend"
                  >
                    <ShieldOff className="w-3.5 h-3.5 inline -mt-0.5 mr-1.5" /> Suspend
                  </button>
                  <button onClick={() => handleStatus('blocked')}
                    className="px-4 py-2 rounded-full text-xs tracking-[0.18em] uppercase"
                    style={{ color: '#FFB0A0', border: '1px solid rgba(255,176,160,0.4)' }}
                    data-testid="ud-block"
                  >
                    <Ban className="w-3.5 h-3.5 inline -mt-0.5 mr-1.5" /> Block
                  </button>
                </>
              )}
              {(user.status === 'suspended' || user.status === 'blocked') && (
                <button onClick={() => handleStatus('active')}
                  className="px-4 py-2 rounded-full text-xs tracking-[0.18em] uppercase"
                  style={{ color: '#7FD18E', border: '1px solid rgba(127,209,142,0.4)' }}
                  data-testid="ud-reactivate"
                >
                  <UserCheck className="w-3.5 h-3.5 inline -mt-0.5 mr-1.5" /> Re-activate
                </button>
              )}
            </div>

            {/* Invitations */}
            <h3 className="font-display text-xl mb-3" style={{ color: 'var(--lux-text)' }}>
              Invitations ({profiles.length})
            </h3>
            {profiles.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                This user hasn&apos;t created any invitations yet.
              </p>
            ) : (
              <div className="space-y-2 mb-6" data-testid="ud-profile-list">
                {profiles.slice(0, 20).map((p) => (
                  <div key={p.id || p.profile_id || p.slug} className="px-4 py-3 rounded-lg flex items-center justify-between gap-3"
                    style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-sm truncate" style={{ color: 'var(--lux-text)' }}>
                        {(p.bride_name || p.bride || '—')} &amp; {(p.groom_name || p.groom || '—')}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--lux-text-muted)' }}>
                        {p.event_type || 'wedding'} · {p.venue || p.city || ''} · {p.event_date ? new Date(p.event_date).toLocaleDateString() : '—'}
                      </div>
                    </div>
                    {p.slug && (
                      <a href={`/invite/${p.slug}`} target="_blank" rel="noreferrer"
                        className="text-[10px] tracking-[0.22em] uppercase text-gold whitespace-nowrap">
                        Open ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Requests — this user's paid event/invitation orders */}
            <h3 className="font-display text-xl mb-3" style={{ color: 'var(--lux-text)' }}>
              Requests ({reqs.length})
            </h3>
            {reqs.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>No requests from this user yet.</p>
            ) : (
              <div className="space-y-2" data-testid="ud-request-list">
                {reqs.slice(0, 20).map((r) => (
                  <div key={r.fulfillment_code || r.order_id} className="px-4 py-3 rounded-lg flex items-center justify-between gap-3"
                    style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}>
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-sm truncate" style={{ color: 'var(--lux-text)' }}>
                        {r.design_name || r.package_label || 'Invitation'} · {r.build_status || 'paid'}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--lux-text-muted)' }}>
                        {r.fulfillment_code} · ₹{(r.amount_inr || 0).toLocaleString('en-IN')}{r.live_url ? ' · delivered' : ''}
                      </div>
                    </div>
                    <Link to="/super-admin/fulfillment" className="text-[10px] tracking-[0.22em] uppercase text-gold whitespace-nowrap">Console ↗</Link>
                  </div>
                ))}
              </div>
            )}

          </>
        )}
      </motion.div>
    </motion.div>
  );
};


export default LuxurySuperAdminDashboard;
