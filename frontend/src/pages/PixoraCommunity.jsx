// PixoraCommunity — the photographer community hub (panel → Community).
// Real, working MVP over pixora_service.py: feed (post/like/comment),
// monthly challenge (submit/vote), leaderboard, hiring board, and a profile
// panel with computed reputation + auto-awarded achievements.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import PanelTabs from '@/components/PanelTabs';
import LearningHub from '@/components/LearningHub';
import PlanCapabilityBanner from '@/components/PlanCapabilityBanner';
import GlobalSearch from '@/components/GlobalSearch';
import StorageMeter from '@/components/StorageMeter';
import UpgradesStore from '@/components/UpgradesStore';
import { ReelsStudio, StoriesStudio } from '@/components/CommunityMedia';
import {
  Users, Heart, MessageCircle, Trophy, Crown, Briefcase, Camera, Loader2,
  Send, Award, TrendingUp, Plus, MapPin, GraduationCap, ShoppingBag,
  CalendarDays, Gift, BarChart3, Star, UserPlus, Check, Video, FileText,
  Pencil, Trash2, Save, Bell, Flag, BadgeCheck, ShieldCheck, Upload, Sparkles, X,
  Megaphone, DollarSign, Home as HomeIcon, Menu, ChevronRight, Clock,
  Bookmark, Share2, Eye, Filter, Compass, Flame, Settings as SettingsIcon,
} from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
// PHASE 1 (navigation restructure only): a "Coming soon" placeholder for the
// future sub-sections named in the spec (Reels/Stories/Teams/Presets/…). No
// functionality is built here — these are navigation entries only.
function ComingSoon({ title, note }) {
  return (
    <div className="lux-glass p-10 text-center" data-testid={`coming-soon-${String(title || '').toLowerCase().replace(/\s+/g, '-')}`}>
      <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: '#E8C97A' }} />
      <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>{title}</div>
      <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{note || 'Coming soon — part of a future Pixora update.'}</div>
    </div>
  );
}

// Home dashboard — assembles EXISTING data only (community score + stats from
// /api/pixora/me) with quick links into the other existing sections. No new
// backend, no new features.
function HomeDashboard({ go }) {
  const [me, setMe] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/me`, { headers: authHeaders() })
      .then(({ data }) => setMe(data)).catch(() => setMe(false));
  }, []);
  const s = (me && me.stats) || {};
  const quick = [
    { label: 'Notifications', desc: 'Alerts & recent activity', icon: Bell, g: 'home', k: 'notifications' },
    { label: 'Network', desc: 'New followers & suggested creators', icon: UserPlus, g: 'home', k: 'network' },
    { label: 'Upcoming events', desc: 'Community events & meetups', icon: CalendarDays, g: 'home', k: 'events' },
    { label: 'Post to Spotlight', desc: 'Share your work with the community', icon: Sparkles, g: 'spotlight', k: 'feed' },
  ];
  return (
    <div className="space-y-5" data-testid="pixora-home">
      <GlobalSearch />
      <StorageMeter />
      <div className="lux-glass p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="lux-eyebrow mb-1">◆ Community score</div>
          <div className="font-display text-4xl text-gold">{me ? (me.community_score?.score ?? me.reputation ?? 0) : '—'}</div>
          <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{me ? `Reputation · ${me.tier || ''}` : 'Loading…'}</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[['posts', 'Posts'], ['likes_received', 'Likes'], ['comments_made', 'Comments'], ['challenge_wins', 'Wins']].map(([k, l]) => (
            <div key={k} className="px-4 py-2 rounded-lg" style={{ background: 'var(--lux-panel)' }}>
              <div className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{s[k] ?? 0}</div>
              <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {quick.map((q) => {
          const I = q.icon;
          return (
            <button key={q.label} onClick={() => go(q.g, q.k)} className="lux-glass p-5 text-left hover:scale-[1.01] transition-transform" data-testid={`home-quick-${q.k}`}>
              <div className="flex items-center gap-2 mb-1"><I className="w-4 h-4" style={{ color: '#E8C97A' }} /><span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{q.label}</span></div>
              <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{q.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Profile › Portfolio → link out to the existing Portfolio builder + the public
// Pixora profile (/p/:slug), and show the shared storage meter.
function PortfolioLink() {
  const [slug, setSlug] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/portfolio/profile`, { headers: authHeaders() })
      .then(({ data }) => setSlug(data?.profile?.slug || null)).catch(() => {});
  }, []);
  return (
    <div className="space-y-4">
      <StorageMeter />
      <div className="lux-glass p-8 text-center" data-testid="pixora-portfolio-link">
        <Camera className="w-8 h-8 mx-auto mb-3" style={{ color: '#E8C97A' }} />
        <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>Your portfolio</div>
        <p className="text-sm mb-4" style={{ color: 'var(--lux-text-muted)' }}>Manage your public portfolio, designs and uploads in the Portfolio builder.</p>
        <div className="flex gap-2 justify-center flex-wrap">
          <a href="/studio/portfolio" className="lux-btn inline-flex"><Camera className="w-4 h-4" /> Open Portfolio builder</a>
          {slug && <a href={`/p/${slug}`} className="lux-btn lux-btn-ghost inline-flex" data-testid="pixora-view-public"><Sparkles className="w-4 h-4" /> View public profile</a>}
        </div>
      </div>
    </div>
  );
}
const KINDS = [
  { key: 'showcase', label: 'Showcase' },
  { key: 'critique_request', label: 'Ask for critique' },
  { key: 'tip', label: 'Share a tip' },
  { key: 'discussion', label: 'Discussion' },
];

export default function PixoraCommunity() {
  // PHASE 1 — 8-group information architecture (left sidebar + mobile drawer)
  // replacing the old 22-tab strip. Every EXISTING module is reused unchanged
  // and reachable; only navigation changed. New sub-entries render <ComingSoon>.
  const [group, setGroup] = useState('home');
  const [subByGroup, setSubByGroup] = useState({});   // remembers active sub per group
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [myId, setMyId] = useState(null);   // my studio_id → show edit/delete on my own content
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/me`, { headers: authHeaders() })
      .then(({ data }) => setMyId(data.studio_id)).catch(() => {});
    axios.get(`${API_URL}/api/pixora/notifications/unread-count`, { headers: authHeaders() })
      .then(({ data }) => setUnread(data.unread || 0)).catch(() => {});
    // P2: award the once-a-day community-score point on visiting the community
    axios.post(`${API_URL}/api/pixora/checkin`, {}, { headers: authHeaders() }).catch(() => {});
  }, []);

  const go = (gk, sk) => { setGroup(gk); if (sk) setSubByGroup((s) => ({ ...s, [gk]: sk })); setDrawerOpen(false); };

  // group → sub-items → the EXISTING component (or a ComingSoon placeholder).
  const GROUPS = [
    { key: 'home', label: 'Home', icon: HomeIcon, items: [
      { key: 'overview', label: 'Overview', node: <HomeDashboard go={go} /> },
      { key: 'notifications', label: 'Notifications', node: <Notifications onSeen={() => setUnread(0)} /> },
      { key: 'network', label: 'Network', node: <NetworkHub /> },
      { key: 'creators', label: 'Creators', node: <Creators /> },
      { key: 'events', label: 'Events', node: <Events /> },
    ] },
    { key: 'spotlight', label: 'Spotlight', icon: Sparkles, items: [
      { key: 'feed', label: 'Feed', node: <Feed myId={myId} /> },
      { key: 'following', label: 'Following', node: <Following /> },
      { key: 'discover', label: 'Discover', node: <Discover /> },
      { key: 'trending', label: 'Trending', node: <Trending /> },
      { key: 'reels', label: 'Reels', node: <ReelsStudio /> },
      { key: 'stories', label: 'Stories', node: <StoriesStudio /> },
      { key: 'saved', label: 'Saved', node: <Saved /> },
    ] },
    { key: 'connect', label: 'Connect', icon: UserPlus, items: [
      { key: 'hiring', label: 'Hiring', node: <Hiring myId={myId} /> },
      { key: 'mentors', label: 'Mentors', node: <Mentors /> },
      { key: 'vendors', label: 'Vendors', node: <VendorManager /> },
      { key: 'teams', label: 'Teams', node: <Teams /> },
      { key: 'collaborations', label: 'Collaborations', node: <Collaborations /> },
    ] },
    { key: 'studio', label: 'Studio Tools', icon: BarChart3, items: [
      { key: 'crm', label: 'CRM', node: <Crm /> },
      { key: 'ai_review', label: 'AI Review', node: <AiReview /> },
      { key: 'ai_assistant', label: 'AI Assistant', node: <BusinessAssistant /> },
      { key: 'analytics', label: 'Analytics', node: <Grow /> },
      { key: 'pricing', label: 'Pricing Intelligence', node: <PricingIntelligence /> },
      { key: 'clients', label: 'Client Management', node: <WorkspacesManager /> },
    ] },
    { key: 'growth', label: 'Growth', icon: TrendingUp, items: [
      { key: 'challenges', label: 'Challenges', node: <Challenge myId={myId} /> },
      { key: 'awards', label: 'Awards', node: <Awards /> },
      { key: 'verification', label: 'Verification', node: <Verification /> },
      { key: 'certifications', label: 'Certifications', node: <Certifications /> },
      { key: 'leaderboards', label: 'Leaderboards', node: <Leaderboard /> },
      { key: 'perks', label: 'Perks', node: <Perks /> },
    ] },
    { key: 'marketplace', label: 'Marketplace', icon: ShoppingBag, items: [
      { key: 'marketplace', label: 'Marketplace', node: <Marketplace /> },
      { key: 'upgrades', label: 'Upgrades', node: <UpgradesStore /> },
      { key: 'brand_deals', label: 'Brand Deals', node: <Campaigns myId={myId} /> },
      { key: 'resources', label: 'Resources', node: <MarketplaceKind kind="guide" label="Resources" /> },
      { key: 'presets', label: 'Presets', node: <MarketplaceKind kind="preset" label="Presets" /> },
      { key: 'templates', label: 'Templates', node: <MarketplaceKind kind="template" label="Templates" /> },
    ] },
    { key: 'learning', label: 'Learning Hub', icon: GraduationCap, items: [
      { key: 'all', label: 'All', node: <LearningHub /> },
      { key: 'photography', label: 'Photography', node: <LearningHub category="photography" /> },
      { key: 'editing', label: 'Editing', node: <LearningHub category="editing" /> },
      { key: 'business', label: 'Business', node: <LearningHub category="business" /> },
      { key: 'marketing', label: 'Marketing', node: <LearningHub category="marketing" /> },
      { key: 'ai_tools', label: 'AI Tools', node: <LearningHub category="ai_tools" /> },
      { key: 'gear', label: 'Gear Reviews', node: <LearningHub category="gear" /> },
      { key: 'guides', label: 'Guides', node: <Learn /> },
    ] },
    { key: 'profile', label: 'Profile', icon: Award, items: [
      { key: 'my_profile', label: 'My Profile', node: <Profile /> },
      { key: 'why_upgrade', label: 'Why Upgrade', node: <WhyUpgrade /> },
      { key: 'portfolio', label: 'Portfolio', node: <PortfolioLink /> },
      { key: 'settings', label: 'Settings', node: <CommunitySettings /> },
    ] },
  ];

  const g = GROUPS.find((x) => x.key === group) || GROUPS[0];
  const subKey = subByGroup[group] || g.items[0].key;
  const item = g.items.find((i) => i.key === subKey) || g.items[0];

  const SidebarNav = (
    <nav className="space-y-1" data-testid="pixora-sidebar">
      {GROUPS.map((gr) => {
        const I = gr.icon; const on = gr.key === group;
        return (
          <button key={gr.key} onClick={() => go(gr.key)} data-testid={`pixora-group-${gr.key}`}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition"
            style={{ background: on ? 'linear-gradient(135deg,rgba(232,201,122,0.16),rgba(212,175,55,0.06))' : 'transparent',
                     color: on ? 'var(--lux-text)' : 'var(--lux-text-muted)',
                     border: on ? '1px solid rgba(212,175,55,0.4)' : '1px solid transparent' }}>
            <I className="w-4 h-4 shrink-0" style={{ color: on ? '#E8C97A' : 'currentColor' }} />
            <span className="flex-1 text-left">{gr.label}</span>
            {gr.key === 'home' && unread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center" style={{ background: '#e5484d', color: '#fff' }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="luxe min-h-screen relative" style={{ background: 'var(--lux-bg, #0E0A06)' }}>
      <div className="px-4 md:px-10 py-6 md:py-10 max-w-[1280px] mx-auto relative z-10">
        <PanelTabs active="/studio/community" />
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <span className="lux-eyebrow block mb-2">◆ Pixora Community</span>
            <h1 className="font-display text-[1.6rem] md:text-[2.4rem] leading-tight" style={{ color: 'var(--lux-text)' }}>
              Where photographers <span className="text-gold italic font-script">grow.</span>
            </h1>
          </div>
          <button onClick={() => setDrawerOpen(true)} className="lux-btn lux-btn-ghost md:hidden shrink-0" data-testid="pixora-menu-btn">
            <Menu className="w-4 h-4" /> Menu
          </button>
        </div>

        <div className="flex gap-6">
          {/* Desktop: fixed left sidebar */}
          <aside className="hidden md:block w-56 shrink-0">
            <div className="lux-glass p-3 sticky top-6">{SidebarNav}</div>
          </aside>

          {/* Right content area */}
          <section className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: 'var(--lux-text-muted)' }} data-testid="pixora-breadcrumb">
              <span>Community</span><ChevronRight className="w-3 h-3" />
              <span style={{ color: '#E8C97A' }}>{g.label}</span><ChevronRight className="w-3 h-3" />
              <span style={{ color: 'var(--lux-text)' }}>{item.label}</span>
            </div>
            <PlanCapabilityBanner />
            <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar">
              {g.items.map((it) => {
                const on = it.key === subKey;
                return (
                  <button key={it.key} onClick={() => setSubByGroup((s) => ({ ...s, [group]: it.key }))} data-testid={`pixora-sub-${it.key}`}
                    className={`relative shrink-0 px-4 py-2 rounded-xl text-xs uppercase tracking-wide ${on ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`}>
                    {it.label}
                    {it.key === 'notifications' && unread > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] flex items-center justify-center" style={{ background: '#e5484d', color: '#fff' }} data-testid="pixora-unread-badge">{unread > 9 ? '9+' : unread}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {item.node}
          </section>
        </div>
      </div>

      {/* Mobile: collapsible drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" data-testid="pixora-drawer">
          <div className="absolute inset-0" style={{ background: 'rgba(6,4,2,0.7)' }} onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[85%] p-4 overflow-y-auto" style={{ background: 'var(--lux-bg,#0E0A06)', borderRight: '1px solid var(--lux-border)' }}>
            <div className="flex items-center justify-between mb-4">
              <span className="lux-eyebrow">◆ Community</span>
              <button onClick={() => setDrawerOpen(false)} data-testid="pixora-drawer-close"><X className="w-5 h-5" style={{ color: 'var(--lux-text-muted)' }} /></button>
            </div>
            {SidebarNav}
          </div>
        </div>
      )}
    </div>
  );
}

// Stage 3 — verification badge. level 1-4 → colour + label.
const VERIFY_META = {
  1: { label: 'Verified Photographer', color: '#4FA3FF' },
  2: { label: 'Verified Studio', color: '#3ECf8E' },
  3: { label: 'Premium Studio', color: '#E8C97A' },
  4: { label: 'Elite Pixora Professional', color: '#C08CFF' },
};
function VerifiedBadge({ level, showLabel = false, size = 14 }) {
  const lv = Number(level) || 0;
  if (!lv) return null;
  const m = VERIFY_META[lv] || VERIFY_META[1];
  return (
    <span className="inline-flex items-center gap-1" title={m.label} data-testid={`verified-badge-${lv}`}>
      <BadgeCheck style={{ width: size, height: size, color: m.color }} />
      {showLabel && <span className="text-[11px]" style={{ color: m.color }}>{m.label}</span>}
    </span>
  );
}

const VENDOR_BLANK = { business_name: '', owner_name: '', category: '', description: '', country: 'India', state: '', city: '', experience_years: '', price_min_inr: '', price_max_inr: '', services: '', phone: '', email: '', website: '', instagram: '', availability_status: 'Available', profile_photo: '', cover_photo: '' };
const WS_BOOK_STAGES = ['inquiry', 'quotation', 'negotiation', 'accepted', 'rejected', 'confirmed', 'completed', 'cancelled', 'disputed'];
function WorkspaceDetail({ id, onBack }) {
  const [d, setD] = useState(null);
  const [an, setAn] = useState(null);
  const [guests, setGuests] = useState({ guests: [], counts: {} });
  const [activity, setActivity] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [task, setTask] = useState('');
  const [guest, setGuest] = useState('');
  const [comment, setComment] = useState('');
  const [bookVendor, setBookVendor] = useState('');
  const [ms, setMs] = useState([]);
  const [msTitle, setMsTitle] = useState('');
  const load = useCallback(async () => {
    try {
      const [w, a, g, act, m] = await Promise.all([
        axios.get(`${API_URL}/api/pixora/workspaces/${id}`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/pixora/workspaces/${id}/analytics`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/pixora/workspaces/${id}/guests`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/pixora/workspaces/${id}/activity`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/pixora/workspaces/${id}/milestones`, { headers: authHeaders() }).catch(() => ({ data: { milestones: [] } })),
      ]);
      setD(w.data); setAn(a.data); setGuests(g.data); setActivity(act.data.activity || []); setMs(m.data.milestones || []);
    } catch (e) { onBack(); }
  }, [id, onBack]);
  const addMs = async () => { if (!msTitle.trim()) return; await axios.post(`${API_URL}/api/pixora/workspaces/${id}/milestones`, { title: msTitle }, { headers: authHeaders() }); setMsTitle(''); load(); };
  const cycleMs = async (m) => { const nx = { pending: 'in_progress', in_progress: 'done', done: 'pending' }[m.status] || 'pending'; await axios.put(`${API_URL}/api/pixora/milestones/${m.id}`, { title: m.title, due_date: m.due_date || '', status: nx }, { headers: authHeaders() }); load(); };
  useEffect(() => { load(); axios.get(`${API_URL}/api/pixora/vendors`).then(({ data }) => setVendors(data.vendors || [])).catch(() => {}); }, [load]);
  const toggleTask = async (t) => { await axios.put(`${API_URL}/api/pixora/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' }, { headers: authHeaders() }); load(); };
  const addTask = async () => { if (!task.trim()) return; await axios.post(`${API_URL}/api/pixora/workspaces/${id}/tasks`, { title: task }, { headers: authHeaders() }); setTask(''); load(); };
  const addGuest = async () => { if (!guest.trim()) return; await axios.post(`${API_URL}/api/pixora/workspaces/${id}/guests`, { name: guest, status: 'invited' }, { headers: authHeaders() }); setGuest(''); load(); };
  const book = async () => { if (!bookVendor) return; try { await axios.post(`${API_URL}/api/pixora/workspaces/${id}/bookings`, { vendor_id: bookVendor }, { headers: authHeaders() }); setBookVendor(''); load(); } catch (e) { alert(e?.response?.data?.detail || 'Failed'); } };
  const setBooking = async (b, status) => { await axios.post(`${API_URL}/api/pixora/bookings/${b.id}/status`, { status }, { headers: authHeaders() }); load(); };
  const sendComment = async () => { if (!comment.trim()) return; await axios.post(`${API_URL}/api/pixora/workspaces/${id}/comment`, { text: comment }, { headers: authHeaders() }); setComment(''); load(); };
  if (!d) return <Spinner />;
  const w = d.workspace;
  const Bar = ({ label, pct }) => (
    <div><div className="flex justify-between text-[11px] mb-0.5" style={{ color: 'var(--lux-text-muted)' }}><span>{label}</span><span>{pct}%</span></div><div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--lux-panel)' }}><div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} /></div></div>
  );
  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-xs lux-eyebrow" style={{ color: '#E8C97A' }}>← All weddings</button>
      <div className="lux-glass p-5">
        <h2 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>{w.wedding_name}</h2>
        <div className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>{[w.bride_name, w.groom_name].filter(Boolean).join(' & ')}{w.wedding_date ? ` · ${w.wedding_date}` : ''}{w.location ? ` · ${w.location}` : ''} · {w.my_role}</div>
        {an && <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <Bar label={`Tasks (${an.tasks_done}/${an.tasks_total})`} pct={an.task_progress} />
          <Bar label={`Bookings confirmed (${an.bookings_confirmed}/${an.bookings_total})`} pct={an.booking_progress} />
          <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Budget {inr(an.budget)} · committed {inr(an.committed)} · remaining {inr(an.remaining)}</div>
          <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Guests {an.guests_confirmed}/{an.guests_total} confirmed</div>
        </div>}
      </div>

      <div className="lux-glass p-4">
        <div className="lux-eyebrow mb-2">◆ Checklist</div>
        <div className="flex gap-2 mb-2"><input value={task} onChange={(e) => setTask(e.target.value)} placeholder="Add task" className="lux-input flex-1" /><button onClick={addTask} className="lux-btn text-xs"><Plus className="w-3.5 h-3.5" /></button></div>
        <div className="space-y-1 max-h-64 overflow-y-auto">{(d.tasks || []).map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm" data-testid={`ws-task-${t.id}`}>
            <input type="checkbox" checked={t.status === 'done'} onChange={() => toggleTask(t)} />
            <span style={{ color: t.status === 'done' ? 'var(--lux-text-faint)' : 'var(--lux-text)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
            {t.phase && <span className="text-[9px] uppercase px-1.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{t.phase}</span>}
          </label>
        ))}</div>
      </div>

      <div className="lux-glass p-4">
        <div className="lux-eyebrow mb-2">◆ Milestones</div>
        <div className="flex gap-2 mb-2"><input value={msTitle} onChange={(e) => setMsTitle(e.target.value)} placeholder="Add milestone" className="lux-input flex-1" /><button onClick={addMs} className="lux-btn text-xs"><Plus className="w-3.5 h-3.5" /></button></div>
        <div className="space-y-1">{ms.map((m) => (
          <button key={m.id} onClick={() => cycleMs(m)} className="flex items-center gap-2 text-sm w-full text-left" data-testid={`ws-ms-${m.id}`}>
            <span className="w-2 h-2 rounded-full" style={{ background: m.status === 'done' ? '#3ECf8E' : m.status === 'in_progress' ? '#E8C97A' : '#9ca3af' }} />
            <span className="flex-1" style={{ color: 'var(--lux-text-muted)' }}>{m.title}</span>
            <span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>{m.status}</span>
          </button>
        ))}</div>
      </div>

      <div className="lux-glass p-4">
        <div className="lux-eyebrow mb-2">◆ Vendor bookings</div>
        <div className="flex gap-2 mb-3">
          <select value={bookVendor} onChange={(e) => setBookVendor(e.target.value)} className="lux-input flex-1"><option value="">Book a vendor…</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.business_name} ({v.category})</option>)}</select>
          <button onClick={book} className="lux-btn text-xs">Inquire</button>
        </div>
        <div className="space-y-2">{(d.bookings || []).map((b) => (
          <div key={b.id} className="flex items-center gap-2 text-sm" data-testid={`ws-booking-${b.id}`}>
            <span className="flex-1" style={{ color: 'var(--lux-text)' }}>{b.vendor_name}</span>
            <select value={b.status} onChange={(e) => setBooking(b, e.target.value)} className="lux-input text-xs capitalize">{WS_BOOK_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
        ))}</div>
      </div>

      <div className="lux-glass p-4">
        <div className="lux-eyebrow mb-2">◆ Guests {Object.keys(guests.counts || {}).length > 0 && <span style={{ color: 'var(--lux-text-faint)' }}>· {Object.entries(guests.counts).map(([k, v]) => `${v} ${k}`).join(', ')}</span>}</div>
        <div className="flex gap-2"><input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Add guest" className="lux-input flex-1" /><button onClick={addGuest} className="lux-btn text-xs"><Plus className="w-3.5 h-3.5" /></button></div>
      </div>

      <div className="lux-glass p-4">
        <div className="lux-eyebrow mb-2">◆ Activity</div>
        <div className="flex gap-2 mb-2"><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" className="lux-input flex-1" /><button onClick={sendComment} className="lux-btn lux-btn-ghost text-xs"><Send className="w-3.5 h-3.5" /></button></div>
        <div className="space-y-1 max-h-52 overflow-y-auto">{activity.map((a) => (
          <div key={a.id} className="text-xs" style={{ color: 'var(--lux-text-muted)' }}><b style={{ color: '#E8C97A' }}>{a.actor_name}</b> {a.text}</div>
        ))}</div>
      </div>
    </div>
  );
}

function WorkspacesManager() {
  const [list, setList] = useState(null);
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ wedding_name: '', bride_name: '', groom_name: '', wedding_date: '', location: '', budget_inr: '', guest_count: '' });
  const load = useCallback(async () => { try { const { data } = await axios.get(`${API_URL}/api/pixora/workspaces`, { headers: authHeaders() }); setList(data.workspaces || []); } catch (e) { setList([]); } }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    if (!form.wedding_name.trim()) return;
    try { await axios.post(`${API_URL}/api/pixora/workspaces`, { ...form, budget_inr: Number(form.budget_inr) || 0, guest_count: Number(form.guest_count) || 0 }, { headers: authHeaders() }); setCreating(false); setForm({ wedding_name: '', bride_name: '', groom_name: '', wedding_date: '', location: '', budget_inr: '', guest_count: '' }); load(); }
    catch (e) { alert('Could not create'); }
  };
  if (sel) return <WorkspaceDetail id={sel} onBack={() => { setSel(null); load(); }} />;
  if (list === null) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="lux-glass p-4 flex items-center justify-between">
        <div><div className="lux-eyebrow flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Wedding workspaces</div><p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>Each wedding is a project — tasks, bookings, team, budget, guests in one place.</p></div>
        <button onClick={() => setCreating((v) => !v)} className="lux-btn" data-testid="ws-new"><Plus className="w-4 h-4" /> New wedding</button>
      </div>
      {creating && (
        <div className="lux-glass p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={form.wedding_name} onChange={(e) => setForm({ ...form, wedding_name: e.target.value })} placeholder="Wedding name *" className="lux-input sm:col-span-2" />
          <input value={form.bride_name} onChange={(e) => setForm({ ...form, bride_name: e.target.value })} placeholder="Bride name" className="lux-input" />
          <input value={form.groom_name} onChange={(e) => setForm({ ...form, groom_name: e.target.value })} placeholder="Groom name" className="lux-input" />
          <input type="date" value={form.wedding_date} onChange={(e) => setForm({ ...form, wedding_date: e.target.value })} className="lux-input" />
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="lux-input" />
          <input type="number" value={form.budget_inr} onChange={(e) => setForm({ ...form, budget_inr: e.target.value })} placeholder="Budget ₹" className="lux-input" />
          <input type="number" value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: e.target.value })} placeholder="Guest count" className="lux-input" />
          <button onClick={create} className="lux-btn sm:col-span-2 justify-center" data-testid="ws-create">Create workspace (auto-adds checklist)</button>
        </div>
      )}
      {list.length === 0 ? <Empty label="No weddings yet. Create your first workspace." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((w) => (
            <button key={w.id} onClick={() => setSel(w.id)} className="lux-glass p-4 text-left" data-testid={`ws-${w.id}`}>
              <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{w.wedding_name}</div>
              <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>{[w.bride_name, w.groom_name].filter(Boolean).join(' & ')}{w.wedding_date ? ` · ${w.wedding_date}` : ''} · {w.status} · {w.my_role}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function VendorManager() {
  const [vendor, setVendor] = useState(undefined); // undefined=loading
  const [reviews, setReviews] = useState([]);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(VENDOR_BLANK);
  const [msg, setMsg] = useState('');
  const [resp, setResp] = useState({});
  const load = useCallback(async () => {
    try {
      const [me, c] = await Promise.all([
        axios.get(`${API_URL}/api/pixora/vendor/me`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/pixora/vendor-categories`).catch(() => ({ data: { categories: [] } })),
      ]);
      setVendor(me.data.vendor || null); setReviews(me.data.reviews || []); setCats(c.data.categories || []);
      if (me.data.vendor) {
        const v = me.data.vendor;
        setForm({ ...VENDOR_BLANK, ...v, services: (v.services || []).join(', '), phone: v.contact?.phone || '', email: v.contact?.email || '' });
      }
    } catch (e) { setVendor(null); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    if (!form.business_name.trim()) { setMsg('Business name is required'); return; }
    try {
      await axios.post(`${API_URL}/api/pixora/vendor`, {
        ...form, experience_years: Number(form.experience_years) || 0,
        price_min_inr: Number(form.price_min_inr) || 0, price_max_inr: Number(form.price_max_inr) || 0,
        services: form.services.split(',').map((s) => s.trim()).filter(Boolean),
        contact: { phone: form.phone, email: form.email },
      }, { headers: authHeaders() });
      setMsg('Saved — submitted for admin review.'); load();
    } catch (e) { setMsg(e?.response?.data?.detail || 'Could not save'); }
  };
  const respond = async (rid) => {
    try { await axios.post(`${API_URL}/api/pixora/vendor-reviews/${rid}/respond`, { text: resp[rid] || '' }, { headers: authHeaders() }); setResp((r) => ({ ...r, [rid]: '' })); load(); }
    catch (e) { alert('Could not respond'); }
  };
  if (vendor === undefined) return <Spinner />;
  const statusColor = { approved: '#3ECf8E', pending: '#E8C97A', rejected: '#ff8a8a', suspended: '#ff8a8a' };
  return (
    <div className="space-y-5">
      <div className="lux-glass p-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="lux-eyebrow flex items-center gap-1.5"><ShoppingBag className="w-3.5 h-3.5" /> Vendor profile</div>
          <p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>List your business in the wedding vendor marketplace. Reused with your portfolio — single source of truth.</p>
        </div>
        {vendor && <span className="text-xs px-3 py-1 rounded-full capitalize" style={{ background: `${statusColor[vendor.status] || '#9ca3af'}22`, color: statusColor[vendor.status] || '#9ca3af' }}>{vendor.status}{vendor.rating ? ` · ★${vendor.rating} (${vendor.review_count})` : ''}</span>}
      </div>
      <div className="lux-glass p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Business name *" className="lux-input" />
        <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Owner name" className="lux-input" />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="lux-input"><option value="">Category…</option>{cats.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}</select>
        <input value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value })} placeholder="Availability" className="lux-input" />
        <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="lux-input" />
        <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" className="lux-input" />
        <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Country" className="lux-input" />
        <input value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} type="number" placeholder="Experience (yrs)" className="lux-input" />
        <input value={form.price_min_inr} onChange={(e) => setForm({ ...form, price_min_inr: e.target.value })} type="number" placeholder="Price from ₹" className="lux-input" />
        <input value={form.price_max_inr} onChange={(e) => setForm({ ...form, price_max_inr: e.target.value })} type="number" placeholder="Price to ₹" className="lux-input" />
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="lux-input" />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="lux-input" />
        <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website" className="lux-input" />
        <input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="Instagram" className="lux-input" />
        <input value={form.services} onChange={(e) => setForm({ ...form, services: e.target.value })} placeholder="Services (comma-separated)" className="lux-input sm:col-span-2" />
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Description" className="lux-input sm:col-span-2" />
        <div className="sm:col-span-2 flex items-center gap-3">
          <button onClick={save} className="lux-btn" data-testid="vendor-save"><Save className="w-4 h-4" /> Save vendor profile</button>
          {msg && <span className="text-xs" style={{ color: '#E8C97A' }}>{msg}</span>}
        </div>
      </div>

      {reviews.length > 0 && (
        <div>
          <div className="lux-eyebrow mb-2">◆ Your reviews</div>
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="lux-glass p-3" data-testid={`vendor-review-${r.id}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span style={{ color: '#E8C97A' }}>★{r.rating}</span>
                  <span className="flex-1" style={{ color: 'var(--lux-text-muted)' }}>{r.text}</span>
                  {r.verified && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(62,207,142,0.15)', color: '#3ECf8E' }}>verified</span>}
                </div>
                {r.response ? <div className="text-xs mt-1 pl-3" style={{ color: 'var(--lux-text-faint)', borderLeft: '2px solid var(--lux-border)' }}>You: {r.response.text}</div> : (
                  <div className="flex gap-2 mt-2">
                    <input value={resp[r.id] || ''} onChange={(e) => setResp((s) => ({ ...s, [r.id]: e.target.value }))} placeholder="Reply…" className="lux-input flex-1 text-sm" />
                    <button onClick={() => respond(r.id)} className="lux-btn lux-btn-ghost text-xs">Reply</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WhyUpgrade() {
  const [plans, setPlans] = useState(null);
  const [cur, setCur] = useState('');
  useEffect(() => {
    axios.get(`${API_URL}/api/subscriptions/plans`, { headers: authHeaders() })
      .then(({ data }) => setPlans((data.plans || []).filter((p) => p.product === 'portfolio'))).catch(() => setPlans([]));
    axios.get(`${API_URL}/api/portfolio/tier`, { headers: authHeaders() }).then(({ data }) => setCur(data.tier || '')).catch(() => {});
  }, []);
  if (plans === null) return <Spinner />;
  const freeCard = { tier: 'Free', storage_gb: 0, features: ['Public portfolio + slug URL', 'Community: feed, follow, posts', 'Verification eligible', 'AI portfolio review', 'CRM (clients + follow-ups)'], _free: true };
  const cards = [freeCard, ...plans];
  const isCurrent = (t) => (t || '').toLowerCase() === (cur || 'normal').toLowerCase() || (t === 'Free' && (cur === 'normal' || !cur));
  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="lux-eyebrow flex items-center justify-center gap-1.5 mb-2"><Crown className="w-4 h-4" /> Why go Premium</div>
        <h2 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>Unlock more storage, designs & studio tools</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>Verified premium studios rank higher, get the studio-built portfolio, and win more bookings.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((p, i) => {
          const cp = p.cycle_prices?.monthly || {};
          const current = isCurrent(p.tier);
          return (
            <div key={i} className="lux-glass p-5 flex flex-col" style={{ border: `1px solid ${p.tier === 'Premium' || (p.tier || '').toLowerCase() === 'premium' ? 'var(--lux-gold)' : 'var(--lux-border)'}` }} data-testid={`why-plan-${p.tier}`}>
              <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>{p.tier}{current && <span className="text-[9px] ml-2 px-2 py-0.5 rounded-full" style={{ background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#16110C' }}>CURRENT</span>}</div>
              {!p._free && <div className="font-display text-2xl text-gold mb-1">{cp.inr != null ? inr(cp.inr) : '—'}<span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>/mo</span></div>}
              {p.storage_gb > 0 && <div className="text-xs mb-2" style={{ color: '#E8C97A' }}>{p.storage_gb >= 1024 ? `${(p.storage_gb / 1024).toFixed(0)} TB` : `${p.storage_gb} GB`} storage</div>}
              {p._free && <div className="text-xs mb-2" style={{ color: 'var(--lux-text-muted)' }}>500 MB storage</div>}
              <ul className="space-y-1 flex-1 mb-3">
                {(p.features || []).slice(0, 7).map((f, j) => (
                  <li key={j} className="text-[12px] flex gap-1.5" style={{ color: 'var(--lux-text-muted)' }}><Check className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: '#E8C97A' }} />{String(f).replace(/_/g, ' ')}</li>
                ))}
              </ul>
              {!current && !p._free && <a href="/studio/plans" className="lux-btn justify-center" data-testid={`why-upgrade-${p.tier}`}><Sparkles className="w-4 h-4" /> Upgrade</a>}
            </div>
          );
        })}
      </div>
      <div className="text-center"><a href="/studio/plans" className="text-xs lux-eyebrow" style={{ color: '#E8C97A' }}>◆ See all plans & billing options →</a></div>
    </div>
  );
}

function NetworkHub() {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/connections`, { headers: authHeaders() }); setData(data); }
    catch (e) { setData({ incoming: [], outgoing: [], accepted: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const respond = async (cid, action) => {
    try { await axios.post(`${API_URL}/api/pixora/connections/${cid}/respond`, { action }, { headers: authHeaders() }); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Failed'); }
  };
  if (data === null) return <Spinner />;
  const { incoming = [], outgoing = [], accepted = [] } = data;
  const Row = ({ c, children }) => (
    <div className="lux-glass p-3 flex items-center gap-3" data-testid={`conn-${c.id}`}>
      <UserPlus className="w-4 h-4" style={{ color: '#E8C97A' }} />
      <div className="flex-1">
        <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{c.other_name}</div>
        <div className="text-[11px] capitalize" style={{ color: 'var(--lux-text-muted)' }}>{c.type}{c.message ? ` · ${c.message}` : ''}</div>
      </div>
      {children}
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="lux-eyebrow flex items-center gap-1.5"><UserPlus className="w-3.5 h-3.5" /> Your professional network</div>
      <Chapters />
      <div>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}>Requests to you</div>
        {incoming.length === 0 ? <Empty label="No pending requests." /> : incoming.map((c) => (
          <Row key={c.id} c={c}>
            <button onClick={() => respond(c.id, 'accept')} className="lux-btn text-xs" data-testid={`conn-accept-${c.id}`}>Accept</button>
            <button onClick={() => respond(c.id, 'decline')} className="lux-btn lux-btn-ghost text-xs">Decline</button>
          </Row>
        ))}
      </div>
      {outgoing.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}>Sent (pending)</div>
          {outgoing.map((c) => <Row key={c.id} c={c}><span className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>pending</span></Row>)}
        </div>
      )}
      <div>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}>Connections</div>
        {accepted.length === 0 ? <Empty label="No connections yet. Send requests from the Leaderboard." /> : accepted.map((c) => (
          <Row key={c.id} c={c}><Check className="w-4 h-4" style={{ color: '#3ECf8E' }} /></Row>
        ))}
      </div>
    </div>
  );
}

function BusinessAssistant() {
  const [report, setReport] = useState(null);   // null=loading, false=none, obj
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/business-assistant`, { headers: authHeaders() }); setReport(data.report || false); }
    catch (e) { setReport(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const generate = async () => {
    setBusy(true);
    try { const { data } = await axios.post(`${API_URL}/api/pixora/business-assistant/generate`, {}, { headers: authHeaders() }); setReport(data.report); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not generate report'); }
    setBusy(false);
  };
  if (report === null) return <Spinner />;
  const r = report || null;
  const b = r?.signals || {};
  const fb = r?.fallback || {};
  return (
    <div className="space-y-5">
      <div className="lux-glass p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="lux-eyebrow flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> AI Business Assistant</div>
          <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>Pricing, packages, marketing and growth advice from your real portfolio + CRM data.</p>
        </div>
        <button onClick={generate} disabled={busy} className="lux-btn" data-testid="ba-generate">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} {r ? 'Refresh' : 'Generate'}
        </button>
      </div>

      {!r ? (
        <Empty label="No report yet. Click “Generate” for tailored business advice." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3" data-testid="ba-signals">
            {[['Clients', b.clients_total || 0], ['Conversion', `${b.conversion_pct || 0}%`], ['Booked pipeline', inr(b.booked_value_inr || 0)]].map(([l, v]) => (
              <div key={l} className="lux-glass p-4 text-center">
                <div className="font-display text-2xl text-gold">{v}</div>
                <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>{l}</div>
              </div>
            ))}
          </div>

          {r.ai_summary && (
            <div className="lux-glass p-5" data-testid="ba-ai">
              <div className="lux-eyebrow mb-2">◆ Consultant report</div>
              <p className="text-sm whitespace-pre-line" style={{ color: 'var(--lux-text)' }}>{r.ai_summary}</p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <div className="lux-glass p-4">
              <div className="lux-eyebrow mb-2">◆ Pricing guidance</div>
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{fb.pricing}</p>
            </div>
            <div className="lux-glass p-4">
              <div className="lux-eyebrow mb-2">◆ Growth</div>
              <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{fb.growth}</p>
            </div>
            <div className="lux-glass p-4">
              <div className="lux-eyebrow mb-2">◆ Package ideas</div>
              <ul className="space-y-1">{(fb.packages || []).map((p, i) => <li key={i} className="text-sm flex gap-1.5" style={{ color: 'var(--lux-text-muted)' }}><Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#E8C97A' }} />{p}</li>)}</ul>
            </div>
            <div className="lux-glass p-4">
              <div className="lux-eyebrow mb-2">◆ Marketing actions</div>
              <ul className="space-y-1">{(fb.marketing || []).map((p, i) => <li key={i} className="text-sm flex gap-1.5" style={{ color: 'var(--lux-text-muted)' }}><Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#E8C97A' }} />{p}</li>)}</ul>
            </div>
          </div>
          {r.generated_at && <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>Last generated {new Date(r.generated_at).toLocaleString('en-IN')}</div>}
        </>
      )}
    </div>
  );
}

const CRM_STATUSES = ['lead', 'contacted', 'quoted', 'booked', 'shooting', 'delivered', 'completed', 'lost'];
const CRM_STAGES = ['inquiry', 'meeting', 'quotation', 'booking', 'shoot', 'delivery', 'review', 'repeat'];
const CRM_STATUS_COLOR = { lead: '#9ca3af', contacted: '#4FA3FF', quoted: '#E8C97A', booked: '#3ECf8E', shooting: '#5eead4', delivered: '#3ECf8E', completed: '#22c55e', lost: '#ff8a8a' };
const CRM_BLANK = { name: '', phone: '', email: '', event_type: '', event_date: '', status: 'lead', budget_inr: '', payment_status: 'unpaid', contract_status: 'none', notes: '', follow_up_date: '' };

function Crm() {
  const [clients, setClients] = useState(null);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(CRM_BLANK);
  const [selId, setSelId] = useState(null);
  const [fu, setFu] = useState(null);   // follow-ups + top leads (lead management)
  const load = useCallback(async () => {
    try {
      const [cl, f] = await Promise.all([
        axios.get(`${API_URL}/api/pixora/crm/clients${filter ? `?status=${filter}` : ''}`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/pixora/crm/followups`, { headers: authHeaders() }).catch(() => ({ data: {} })),
      ]);
      setClients(cl.data.clients || []); setCounts(cl.data.counts || {});
      setFu(f.data || {});
    } catch (e) { setClients([]); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    if (!form.name.trim()) return;
    try { await axios.post(`${API_URL}/api/pixora/crm/clients`, { ...form, budget_inr: Number(form.budget_inr) || 0 }, { headers: authHeaders() }); setForm(CRM_BLANK); setAdding(false); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not add client'); }
  };
  if (clients === null) return <Spinner />;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-4">
      <div className="lux-glass p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="lux-eyebrow flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Client CRM</div>
          <p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>{total} client{total === 1 ? '' : 's'} · manage leads, bookings and follow-ups.</p>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="lux-btn" data-testid="crm-add"><Plus className="w-4 h-4" /> Add client</button>
      </div>

      {adding && (
        <div className="lux-glass p-4 space-y-2" data-testid="crm-add-form">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Client name *" className="lux-input" data-testid="crm-name" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="lux-input" />
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className="lux-input" />
            <input value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })} placeholder="Event type (Wedding, Haldi…)" className="lux-input" />
            <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="lux-input" />
            <input value={form.budget_inr} onChange={(e) => setForm({ ...form, budget_inr: e.target.value })} type="number" placeholder="Budget ₹" className="lux-input" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="lux-input">{CRM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <input type="date" value={form.follow_up_date} onChange={(e) => setForm({ ...form, follow_up_date: e.target.value })} className="lux-input" title="Follow-up date" />
          </div>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Notes" className="lux-input w-full" />
          <div className="flex gap-2"><button onClick={create} className="lux-btn" data-testid="crm-save">Save client</button><button onClick={() => setAdding(false)} className="lux-btn lux-btn-ghost">Cancel</button></div>
        </div>
      )}

      {/* Automated lead management: due follow-ups + priority leads */}
      {fu && (fu.count > 0 || (fu.top_leads || []).length > 0) && (
        <div className="lux-glass p-4" data-testid="crm-leadmgmt">
          {fu.count > 0 && (
            <div className="mb-3">
              <div className="lux-eyebrow mb-2">◆ Follow-ups due {fu.overdue_count > 0 && <span style={{ color: '#ff8a8a' }}>· {fu.overdue_count} overdue</span>}</div>
              <div className="flex flex-wrap gap-2">
                {(fu.followups || []).slice(0, 8).map((c) => (
                  <button key={c.id} onClick={() => setSelId(c.id)} className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5"
                    style={{ border: `1px solid ${c.overdue ? '#ff8a8a' : 'var(--lux-gold)'}`, color: c.overdue ? '#ff8a8a' : '#E8C97A' }} data-testid={`crm-followup-${c.id}`}>
                    {c.name} · {c.follow_up_date}{c.overdue ? ' (overdue)' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
          {(fu.top_leads || []).length > 0 && (
            <div>
              <div className="lux-eyebrow mb-2">◆ Priority leads</div>
              <div className="flex flex-wrap gap-2">
                {fu.top_leads.map((c) => (
                  <button key={c.id} onClick={() => setSelId(c.id)} className="px-3 py-1.5 rounded-full text-xs" style={{ border: '1px solid var(--lux-border)', color: 'var(--lux-text-muted)' }}>
                    {c.name} <span className="text-gold">· {c.priority}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFilter('')} className="px-3 py-1 rounded-full text-xs" style={{ border: `1px solid ${!filter ? 'var(--lux-gold)' : 'var(--lux-border)'}`, color: 'var(--lux-text)' }}>All ({total})</button>
        {CRM_STATUSES.map((s) => counts[s] ? (
          <button key={s} onClick={() => setFilter(s)} className="px-3 py-1 rounded-full text-xs capitalize" style={{ border: `1px solid ${filter === s ? 'var(--lux-gold)' : 'var(--lux-border)'}`, color: CRM_STATUS_COLOR[s] }}>{s} ({counts[s]})</button>
        ) : null)}
      </div>

      {clients.length === 0 ? <Empty label="No clients yet. Add your first client to start tracking bookings." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {clients.map((c) => (
            <button key={c.id} onClick={() => setSelId(c.id)} className="lux-glass p-4 text-left" data-testid={`crm-client-${c.id}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium flex items-center gap-1.5" style={{ color: 'var(--lux-text)' }}>
                  {c.name}
                  {c.source === 'portfolio' && <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.18)', color: '#E8C97A' }} title="Came in through your public portfolio">Portfolio</span>}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full capitalize" style={{ background: `${CRM_STATUS_COLOR[c.status] || '#9ca3af'}22`, color: CRM_STATUS_COLOR[c.status] || '#9ca3af' }}>{c.status}</span>
              </div>
              <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--lux-text-muted)' }}>
                {c.event_type && <span>{c.event_type}</span>}
                {c.event_date && <span>{c.event_date}</span>}
                {c.phone && <span>{c.phone}</span>}
                {c.budget_inr > 0 && <span className="text-gold">{inr(c.budget_inr)}</span>}
              </div>
              <div className="text-[11px] mt-1 flex flex-wrap gap-x-3" style={{ color: 'var(--lux-text-faint)' }}>
                <span>Payment: {c.payment_status}</span><span>Contract: {c.contract_status}</span>
                {c.follow_up_date && <span style={{ color: '#E8C97A' }}>Follow-up {c.follow_up_date}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {selId && <CrmClientDetail clientId={selId} onClose={() => setSelId(null)} onChange={load} />}
    </div>
  );
}

function CrmClientDetail({ clientId, onClose, onChange }) {
  const [client, setClient] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [edit, setEdit] = useState(null);
  const [ev, setEv] = useState({ stage: 'inquiry', note: '' });
  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/pixora/crm/clients/${clientId}`, { headers: authHeaders() });
      setClient(data.client); setEdit(data.client); setTimeline(data.timeline || []);
    } catch (e) { onClose(); }
  }, [clientId, onClose]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    try { await axios.put(`${API_URL}/api/pixora/crm/clients/${clientId}`, { ...edit, budget_inr: Number(edit.budget_inr) || 0 }, { headers: authHeaders() }); onChange?.(); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not save'); }
  };
  const del = async () => {
    if (!window.confirm('Delete this client and their timeline?')) return;
    try { await axios.delete(`${API_URL}/api/pixora/crm/clients/${clientId}`, { headers: authHeaders() }); onChange?.(); onClose(); }
    catch (e) { alert('Could not delete'); }
  };
  const addEvent = async () => {
    try { await axios.post(`${API_URL}/api/pixora/crm/clients/${clientId}/timeline`, ev, { headers: authHeaders() }); setEv({ stage: ev.stage, note: '' }); load(); }
    catch (e) { alert('Could not add event'); }
  };
  const delEvent = async (id) => {
    try { await axios.delete(`${API_URL}/api/pixora/crm/timeline/${id}`, { headers: authHeaders() }); load(); }
    catch (e) { /* ignore */ }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(6,4,2,0.9)' }} onClick={onClose} data-testid="crm-detail">
      <div className="w-full max-w-2xl rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: 'var(--lux-panel, #16110C)', border: '1px solid var(--lux-gold)' }} onClick={(e) => e.stopPropagation()}>
        {!edit ? <Spinner /> : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{client?.name}</h3>
              <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--lux-text-muted)' }} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {[['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['event_type', 'Event type']].map(([k, l]) => (
                <label key={k} className="block"><span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>{l}</span><input value={edit[k] || ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} className="lux-input w-full" /></label>
              ))}
              <label className="block"><span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>Event date</span><input type="date" value={edit.event_date || ''} onChange={(e) => setEdit({ ...edit, event_date: e.target.value })} className="lux-input w-full" /></label>
              <label className="block"><span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>Budget ₹</span><input type="number" value={edit.budget_inr || ''} onChange={(e) => setEdit({ ...edit, budget_inr: e.target.value })} className="lux-input w-full" /></label>
              <label className="block"><span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>Status</span><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })} className="lux-input w-full">{CRM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="block"><span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>Payment</span><select value={edit.payment_status} onChange={(e) => setEdit({ ...edit, payment_status: e.target.value })} className="lux-input w-full">{['unpaid', 'advance', 'partial', 'paid'].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="block"><span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>Contract</span><select value={edit.contract_status} onChange={(e) => setEdit({ ...edit, contract_status: e.target.value })} className="lux-input w-full">{['none', 'sent', 'signed'].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="block"><span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>Follow-up date</span><input type="date" value={edit.follow_up_date || ''} onChange={(e) => setEdit({ ...edit, follow_up_date: e.target.value })} className="lux-input w-full" /></label>
            </div>
            <label className="block mb-3"><span className="text-[10px] uppercase" style={{ color: 'var(--lux-text-faint)' }}>Notes</span><textarea rows={2} value={edit.notes || ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className="lux-input w-full" /></label>
            <div className="flex gap-2 mb-5">
              <button onClick={save} className="lux-btn" data-testid="crm-detail-save"><Save className="w-4 h-4" /> Save</button>
              <button onClick={del} className="lux-btn lux-btn-ghost" style={{ color: '#ff8a8a' }} data-testid="crm-detail-delete"><Trash2 className="w-4 h-4" /> Delete</button>
            </div>

            <div className="lux-eyebrow mb-2">◆ Client timeline</div>
            <div className="flex gap-2 mb-3">
              <select value={ev.stage} onChange={(e) => setEv({ ...ev, stage: e.target.value })} className="lux-input capitalize" data-testid="crm-stage">{CRM_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              <input value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder="Note (optional)" className="lux-input flex-1" />
              <button onClick={addEvent} className="lux-btn lux-btn-ghost"><Plus className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              {timeline.length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>No timeline events yet.</div> : timeline.map((t) => (
                <div key={t.id} className="flex items-start gap-2 text-sm" data-testid={`crm-tl-${t.id}`}>
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded-full mt-0.5" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{t.stage}</span>
                  <span className="flex-1" style={{ color: 'var(--lux-text-muted)' }}>{t.note}<span className="text-[10px] ml-2" style={{ color: 'var(--lux-text-faint)' }}>{t.created_at ? new Date(t.created_at).toLocaleDateString('en-IN') : ''}</span></span>
                  <button onClick={() => delEvent(t.id)} className="hover:text-red-400" style={{ color: 'var(--lux-text-faint)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const REVIEW_SUBS = [
  ['profile_completeness', 'Profile completeness', 30],
  ['gallery', 'Gallery', 25],
  ['testimonials', 'Testimonials', 15],
  ['categories', 'Categories', 10],
  ['engagement', 'Engagement', 10],
  ['polish', 'Design & published', 10],
];
function AiReview() {
  const [review, setReview] = useState(null);   // null=loading, false=none, obj=review
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/portfolio-review`, { headers: authHeaders() }); setReview(data.review || false); }
    catch (e) { setReview(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const generate = async () => {
    setBusy(true);
    try { const { data } = await axios.post(`${API_URL}/api/pixora/portfolio-review/generate`, {}, { headers: authHeaders() }); setReview(data.review); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not generate review'); }
    setBusy(false);
  };
  if (review === null) return <Spinner />;
  const r = review || null;
  const scoreColor = (s) => (s >= 75 ? '#3ECf8E' : s >= 50 ? '#E8C97A' : '#ff8a8a');
  return (
    <div className="space-y-5">
      <div className="lux-glass p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="lux-eyebrow flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI Portfolio Review</div>
          <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>An honest score of your real portfolio + a prioritized roadmap to grow bookings.</p>
        </div>
        <button onClick={generate} disabled={busy} className="lux-btn" data-testid="ai-review-generate">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {r ? 'Refresh review' : 'Generate review'}
        </button>
      </div>

      {!r ? (
        <Empty label="No review yet. Click “Generate review” to analyze your portfolio." />
      ) : (
        <>
          <div className="lux-glass p-6 flex items-center gap-6 flex-wrap" data-testid="ai-review-score">
            <div className="text-center">
              <div className="font-display text-5xl" style={{ color: scoreColor(r.overall) }}>{r.overall}</div>
              <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>out of 100</div>
            </div>
            <div className="flex-1 min-w-[240px] space-y-2">
              {REVIEW_SUBS.map(([k, label, max]) => {
                const v = r.subscores?.[k] || 0;
                return (
                  <div key={k}>
                    <div className="flex justify-between text-[11px] mb-0.5" style={{ color: 'var(--lux-text-muted)' }}><span>{label}</span><span>{v}/{max}</span></div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--lux-panel)' }}>
                      <div style={{ width: `${max ? (v / max) * 100 : 0}%`, height: '100%', background: 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {r.ai_summary && (
            <div className="lux-glass p-5" data-testid="ai-review-summary">
              <div className="lux-eyebrow mb-2">◆ Your report card</div>
              <p className="text-sm whitespace-pre-line" style={{ color: 'var(--lux-text)' }}>{r.ai_summary}</p>
            </div>
          )}

          {(r.suggestions || []).length > 0 && (
            <div className="lux-glass p-5">
              <div className="lux-eyebrow mb-3">◆ Improvement roadmap</div>
              <ul className="space-y-2">
                {r.suggestions.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
                    <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#E8C97A' }} /> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.generated_at && <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>Last generated {new Date(r.generated_at).toLocaleString('en-IN')}</div>}
        </>
      )}
    </div>
  );
}

function Verification() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ requested_level: 1, gov_id_url: '', business_proof_url: '', website: '', instagram: '', portfolio_link: '', phone: '', email: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/verification/me`, { headers: authHeaders() }); setData(data); }
    catch (e) { setData({ status: {} }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const upload = async (field, file) => {
    if (!file) return;
    setUploading(field);
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('slot', 'verification');
      const { data } = await axios.post(`${API_URL}/api/admin/upload-image`, fd, { headers: authHeaders() });
      setForm((f) => ({ ...f, [field]: data?.url || '' }));
    } catch (e) { alert('Upload failed'); }
    setUploading('');
  };
  const submit = async () => {
    setBusy(true);
    try { await axios.post(`${API_URL}/api/pixora/verification/apply`, { ...form, requested_level: Number(form.requested_level) }, { headers: authHeaders() }); await load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not submit'); }
    setBusy(false);
  };
  if (data === null) return <Spinner />;
  const st = data.status || {};
  const levels = data.levels || [{ level: 1, label: 'Verified Photographer' }, { level: 2, label: 'Verified Studio' }, { level: 3, label: 'Premium Studio' }, { level: 4, label: 'Elite Pixora Professional' }];

  if (st.verified) {
    return (
      <div className="lux-glass p-8 text-center" data-testid="verification-approved">
        <VerifiedBadge level={st.level} size={40} />
        <h2 className="font-display text-2xl mt-3" style={{ color: 'var(--lux-text)' }}>You're verified</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>{st.level_label} · your badge now shows across the community and your portfolio.</p>
      </div>
    );
  }
  if (st.status === 'pending') {
    return <div className="lux-glass p-8 text-center" data-testid="verification-pending"><ShieldCheck className="w-9 h-9 mx-auto mb-2" style={{ color: '#E8C97A' }} /><h2 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>Application under review</h2><p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>Our team is reviewing your verification. You'll be notified once it's decided.</p></div>;
  }
  return (
    <div className="lux-glass p-6 space-y-4" data-testid="verification-form">
      <div>
        <h2 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>Get verified</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>Verified members earn trust, rank higher, and become eligible for awards.</p>
        {st.status === 'rejected' && <p className="text-xs mt-2" style={{ color: '#ff9a9a' }}>Your previous application wasn't approved. You can re-apply below.</p>}
      </div>
      <label className="block">
        <span className="lux-eyebrow block mb-1.5">Requested level</span>
        <select value={form.requested_level} onChange={(e) => setForm({ ...form, requested_level: e.target.value })} className="lux-input w-full" data-testid="verify-level">
          {levels.map((l) => <option key={l.level} value={l.level}>{l.label}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[['gov_id_url', 'Government ID'], ['business_proof_url', 'Business proof (optional)']].map(([field, label]) => (
          <div key={field}>
            <span className="lux-eyebrow block mb-1.5">{label}</span>
            {form[field] ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: '#3ECf8E' }}><Check className="w-4 h-4" /> Uploaded</div>
            ) : (
              <label className="lux-btn lux-btn-ghost text-xs cursor-pointer inline-flex">
                {uploading === field ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
                <input type="file" accept="image/*" className="hidden" onChange={(e) => upload(field, e.target.files?.[0])} data-testid={`verify-${field}`} />
              </label>
            )}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[['website', 'Website'], ['instagram', 'Instagram'], ['portfolio_link', 'Portfolio link'], ['phone', 'Phone'], ['email', 'Email']].map(([k, l]) => (
          <label key={k} className="block">
            <span className="lux-eyebrow block mb-1.5">{l}</span>
            <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="lux-input w-full" data-testid={`verify-${k}`} />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="lux-eyebrow block mb-1.5">Anything else</span>
        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className="lux-input w-full" />
      </label>
      <button onClick={submit} disabled={busy} className="lux-btn" data-testid="verify-submit">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Submit application
      </button>
    </div>
  );
}

const REPORT_REASONS = [
  ['spam', 'Spam'], ['fake', 'Fake content'], ['abuse', 'Abuse'],
  ['copyright', 'Copyright'], ['inappropriate', 'Inappropriate'], ['other', 'Other'],
];

// Reusable "report content" flag. targetType ∈ post|comment|gig|event|submission|member
function ReportButton({ targetType, targetId, className = '' }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const send = async (reason) => {
    setOpen(false);
    try {
      await axios.post(`${API_URL}/api/pixora/report`, { target_type: targetType, target_id: targetId, reason }, { headers: authHeaders() });
      setDone(true);
    } catch (e) { alert(e?.response?.data?.detail || 'Could not submit report'); }
  };
  if (done) return <span className={`text-[10px] ${className}`} style={{ color: 'var(--lux-text-faint)' }}>Reported ✓</span>;
  return (
    <span className={`relative inline-flex ${className}`}>
      <button onClick={() => setOpen((v) => !v)} title="Report" className="hover:text-red-400" data-testid={`pixora-report-${targetType}-${targetId}`}>
        <Flag className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-5 z-20 rounded-lg p-1 shadow-lg" style={{ background: 'var(--lux-panel, #16110C)', border: '1px solid var(--lux-border)', minWidth: 140 }}>
          <div className="text-[10px] px-2 py-1" style={{ color: 'var(--lux-text-faint)' }}>Report reason</div>
          {REPORT_REASONS.map(([k, l]) => (
            <button key={k} onClick={() => send(k)} className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-white/5" style={{ color: 'var(--lux-text-muted)' }} data-testid={`pixora-report-reason-${k}`}>{l}</button>
          ))}
        </div>
      )}
    </span>
  );
}

function Notifications({ onSeen }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/pixora/notifications`, { headers: authHeaders() });
      setRows(data.notifications || []);
      if ((data.unread || 0) > 0) {
        await axios.post(`${API_URL}/api/pixora/notifications/read`, {}, { headers: authHeaders() }).catch(() => {});
      }
      onSeen?.();
    } catch (e) { setRows([]); }
  }, [onSeen]);
  useEffect(() => { load(); }, [load]);
  if (rows === null) return <Spinner />;
  if (rows.length === 0) return <Empty label="No notifications yet. Follows, likes, comments and RSVPs will show up here." />;
  const when = (iso) => { try { return new Date(iso).toLocaleString('en-IN'); } catch { return ''; } };
  return (
    <div className="space-y-2" data-testid="pixora-notifications">
      {rows.map((n) => (
        <div key={n.id} className="lux-glass p-3 flex items-start gap-3" style={{ opacity: n.read ? 0.7 : 1 }} data-testid={`pixora-notif-${n.id}`}>
          <Bell className="w-4 h-4 mt-0.5 shrink-0" style={{ color: n.read ? 'var(--lux-text-faint)' : '#E8C97A' }} />
          <div className="flex-1">
            <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{n.text}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--lux-text-faint)' }}>{when(n.created_at)}</div>
          </div>
          {!n.read && <span className="w-2 h-2 rounded-full mt-1.5" style={{ background: '#E8C97A' }} />}
        </div>
      ))}
    </div>
  );
}

// CreatorRow - shared card for Suggested / Featured creators.
function CreatorRow({ c, onFollow, followed }) {
  return (
    <div className="lux-glass p-4 flex items-center gap-3" data-testid={`creator-${c.studio_id}`}>
      <a href={c.url || '#'} className="shrink-0 no-underline">
        {c.avatar ? <img src={c.avatar} alt="" loading="lazy" className="w-12 h-12 rounded-full object-cover" />
          : <span className="w-12 h-12 rounded-full grid place-items-center"
              style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A' }}>
              {(c.name || '?').charAt(0).toUpperCase()}
            </span>}
      </a>
      <div className="min-w-0 flex-1">
        <div className="text-sm truncate flex items-center gap-1" style={{ color: 'var(--lux-text)' }}>
          {c.name}
          {!!c.verified_level && <BadgeCheck className="w-3.5 h-3.5" style={{ color: '#E8C97A' }} />}
        </div>
        <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
          {c.reason}{c.city ? ` \u00b7 ${c.city}` : ''}
        </div>
      </div>
      {onFollow && (
        <button onClick={() => onFollow(c.studio_id)}
          className={`min-h-[44px] !text-[11px] ${followed ? 'lux-btn lux-btn-ghost' : 'lux-btn'}`}
          data-testid={`creator-follow-${c.studio_id}`}>
          {followed ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
          {followed ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  );
}

// Creators - Suggested (personalised) + Featured (paid / awarded / verified).
function Creators() {
  const [sug, setSug] = useState(null);
  const [feat, setFeat] = useState(null);
  const [done, setDone] = useState({});

  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/creators/suggested`, { headers: authHeaders() })
      .then(({ data }) => setSug(data.creators || [])).catch(() => setSug([]));
    axios.get(`${API_URL}/api/pixora/creators/featured`, { headers: authHeaders() })
      .then(({ data }) => setFeat(data.creators || [])).catch(() => setFeat([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const follow = async (sid) => {
    setDone((d) => ({ ...d, [sid]: true }));
    try { await axios.post(`${API_URL}/api/pixora/follow/${sid}`, {}, { headers: authHeaders() }); }
    catch (_) { setDone((d) => ({ ...d, [sid]: false })); }
  };

  return (
    <div data-testid="pixora-creators">
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Suggested for you</h3>
      {sug === null ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />
        : sug.length === 0 ? <Empty label="No suggestions yet - post and follow a little first." />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {sug.map((c) => <CreatorRow key={c.studio_id} c={c} onFollow={follow} followed={!!done[c.studio_id]} />)}
          </div>
        )}

      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Featured</h3>
      {feat === null ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />
        : feat.length === 0 ? <Empty label="No featured creators right now." />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {feat.map((c) => <CreatorRow key={c.studio_id} c={c} onFollow={follow} followed={!!done[c.studio_id]} />)}
          </div>
        )}
    </div>
  );
}

// CommunitySettings - notification + privacy preferences. There was no Settings
// screen in the community at all before this.
function CommunitySettings() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/settings`, { headers: authHeaders() })
      .then(({ data: d }) => setData(d)).catch(() => setData(null));
  }, []);

  if (!data) return <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />;
  const st = data.settings || {};
  const set = (k, v) => setData((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));

  const save = async () => {
    setBusy(true); setSaved(false);
    try {
      await axios.put(`${API_URL}/api/pixora/settings`, data.settings, { headers: authHeaders() });
      setSaved(true);
    } catch (e) { alert(e?.response?.data?.detail || 'Could not save settings.'); }
    setBusy(false);
  };

  const GROUPS = [
    ['Notifications', [
      ['notify_follow', 'New followers'], ['notify_like', 'Likes'],
      ['notify_comment', 'Comments'], ['notify_save', 'Saves'],
      ['notify_marketplace', 'Marketplace activity'],
    ]],
    ['Privacy', [
      ['profile_public', 'Public profile (visible to visitors)'],
      ['show_in_discover', 'Show me in Discover'],
      ['allow_messages', 'Allow collaboration requests'],
    ]],
  ];

  return (
    <div data-testid="pixora-settings">
      {GROUPS.map(([title, rows]) => (
        <div key={title} className="lux-glass p-5 mb-4">
          <h3 className="font-display text-lg mb-3" style={{ color: 'var(--lux-text)' }}>{title}</h3>
          {rows.map(([k, label]) => (
            <label key={k} className="flex items-center justify-between gap-3 py-2 min-h-[44px] text-sm"
              style={{ color: 'var(--lux-text-muted)' }}>
              <span>{label}</span>
              <input type="checkbox" checked={!!st[k]} onChange={(e) => set(k, e.target.checked)}
                data-testid={`setting-${k}`} />
            </label>
          ))}
        </div>
      ))}

      <div className="lux-glass p-5 mb-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
        <div className="mb-1">Studio: <span style={{ color: 'var(--lux-text)' }}>{data.account?.name}</span></div>
        {data.account?.slug && (
          <div>Public link: <a href={`/p/${data.account.slug}`} style={{ color: '#E8C97A' }}>/p/{data.account.slug}</a></div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="lux-btn min-h-[44px] disabled:opacity-60"
          data-testid="settings-save">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save settings
        </button>
        {saved && <span className="text-sm" style={{ color: '#8AC47F' }}>Saved.</span>}
      </div>
    </div>
  );
}

// PricingIntelligence - the backend has returned suggested min/max, peer average
// and peer count all along; there was simply no screen reading it.
function PricingIntelligence() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/pricing-intelligence`, { headers: authHeaders() })
      .then(({ data: d }) => setData(d))
      .catch((e) => setErr(e?.response?.data?.detail || 'Could not load pricing intelligence.'));
  }, []);
  if (err) return <Empty label={err} />;
  if (!data) return <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />;
  const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  return (
    <div data-testid="pixora-pricing-intelligence">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        {[['Suggested from', data.suggested_min], ['Suggested to', data.suggested_max],
          ['Peer average', data.peer_avg]].map(([label, v]) => (
          <div key={label} className="lux-glass p-5">
            <div className="text-[11px] uppercase tracking-[0.18em] mb-1" style={{ color: 'var(--lux-text-faint)' }}>{label}</div>
            <div className="font-display text-2xl" style={{ color: '#E8C97A' }}>{inr(v)}</div>
          </div>
        ))}
      </div>
      <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
        Based on {data.peers ?? 0} comparable {(data.peers === 1) ? 'studio' : 'studios'}
        {data.city ? ` in ${data.city}` : ''}. Guidance only - your pricing stays yours.
      </p>
    </div>
  );
}

// Teams - GET/POST/DELETE /api/pixora/team existed with no screen.
function Teams() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ name: '', role: '', email: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/team`, { headers: authHeaders() })
      .then(({ data }) => setRows(data.team || data.members || []))
      .catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await axios.post(`${API_URL}/api/pixora/team`, form, { headers: authHeaders() });
      setForm({ name: '', role: '', email: '' });
      load();
    } catch (e) { alert(e?.response?.data?.detail || 'Could not add the member.'); }
    setBusy(false);
  };
  const remove = async (id) => {
    await axios.delete(`${API_URL}/api/pixora/team/${id}`, { headers: authHeaders() });
    load();
  };

  return (
    <div data-testid="pixora-teams">
      <div className="lux-glass p-4 mb-5 grid grid-cols-1 md:grid-cols-4 gap-2">
        {[['name', 'Name'], ['role', 'Role (second shooter, editor…)'], ['email', 'Email']].map(([k, ph]) => (
          <input key={k} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            placeholder={ph}
            className="min-h-[44px] rounded-lg bg-transparent px-3 text-sm outline-none"
            style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
            data-testid={`team-${k}`} />
        ))}
        <button onClick={add} disabled={busy || !form.name.trim()}
          className="lux-btn min-h-[44px] !text-xs disabled:opacity-50" data-testid="team-add">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add member
        </button>
      </div>
      {rows === null ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />
        : rows.length === 0 ? <Empty label="No team members yet." />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows.map((m) => (
              <div key={m.id} className="lux-glass p-4 flex items-center justify-between gap-3"
                data-testid={`team-row-${m.id}`}>
                <div className="min-w-0">
                  <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{m.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
                    {m.role || 'Team member'}{m.email ? ` · ${m.email}` : ''}
                  </div>
                </div>
                <button onClick={() => remove(m.id)} className="lux-btn lux-btn-ghost !text-[11px] min-h-[44px]"
                  data-testid={`team-remove-${m.id}`}>
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// Collaborations - /connections request+respond existed with no screen.
function Collaborations() {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/connections`, { headers: authHeaders() })
      .then(({ data }) => setRows(data.connections || []))
      .catch(() => setRows([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const respond = async (cid, accept) => {
    await axios.post(`${API_URL}/api/pixora/connections/${cid}/respond`,
      { accept }, { headers: authHeaders() });
    load();
  };

  const incoming = (rows || []).filter((c) => c.status === 'pending');
  const active = (rows || []).filter((c) => c.status === 'accepted');

  return (
    <div data-testid="pixora-collaborations">
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Requests</h3>
      {rows === null ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />
        : incoming.length === 0 ? <Empty label="No collaboration requests." />
        : incoming.map((c) => (
          <div key={c.id} className="lux-glass p-4 mb-2 flex items-center justify-between gap-3"
            data-testid={`collab-req-${c.id}`}>
            <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{c.from_name || c.requester || 'A studio'}</div>
            <div className="flex gap-2">
              <button onClick={() => respond(c.id, true)} className="lux-btn min-h-[44px] !text-[11px]">
                <Check className="w-3.5 h-3.5" /> Accept
              </button>
              <button onClick={() => respond(c.id, false)} className="lux-btn lux-btn-ghost min-h-[44px] !text-[11px]">
                Decline
              </button>
            </div>
          </div>
        ))}
      <h3 className="font-display text-lg mt-6 mb-2" style={{ color: 'var(--lux-text)' }}>Collaborators</h3>
      {active.length === 0 ? <Empty label="No active collaborations yet." />
        : active.map((c) => (
          <div key={c.id} className="lux-glass p-4 mb-2 text-sm" style={{ color: 'var(--lux-text)' }}
            data-testid={`collab-active-${c.id}`}>
            {c.from_name || c.to_name || 'Studio'}
          </div>
        ))}
    </div>
  );
}

// MarketplaceKind - Resources / Presets / Templates are filtered views over the
// listings the backend already stores; they were never separate features.
function MarketplaceKind({ kind, label }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/marketplace`, { headers: authHeaders() })
      .then(({ data }) => setRows((data.listings || []).filter((l) => !kind || l.kind === kind)))
      .catch(() => setRows([]));
  }, [kind]);
  if (rows === null) return <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />;
  if (!rows.length) return <Empty label={`No ${label.toLowerCase()} listed yet.`} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid={`marketplace-${kind || 'all'}`}>
      {rows.map((l) => (
        <div key={l.id} className="lux-glass overflow-hidden" data-testid={`listing-${l.id}`}>
          {l.preview_url && <img src={l.preview_url} alt="" loading="lazy" className="w-full max-h-40 object-cover" />}
          <div className="p-4">
            <div className="text-sm mb-1" style={{ color: 'var(--lux-text)' }}>{l.title}</div>
            <div className="text-[11px] mb-2" style={{ color: 'var(--lux-text-faint)' }}>{l.description}</div>
            <div className="font-display text-lg" style={{ color: '#E8C97A' }}>
              {l.price_inr ? `₹${Number(l.price_inr).toLocaleString('en-IN')}` : 'Free'}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// PostGrid - shared renderer for Following / Trending so the three feeds stay
// visually identical and only their data source differs.
function PostGrid({ rows, empty, showScore }) {
  if (rows === null) return <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />;
  if (!rows.length) return <Empty label={empty} />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {rows.map((p) => (
        <div key={p.id} className="lux-glass overflow-hidden" data-testid={`grid-card-${p.id}`}>
          {p.image_url ? <img src={p.image_url} alt="" loading="lazy" className="w-full max-h-56 object-cover" />
            : p.video_url ? <video src={p.video_url} muted playsInline preload="metadata" className="w-full max-h-56 bg-black object-cover" />
            : null}
          <div className="p-3">
            <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{p.title || p.body}</div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--lux-text-faint)' }}>
              {p.author}{p.location ? ` · ${p.location}` : ''}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>
              <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" />{p.like_count ?? 0}</span>
              <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{p.comment_count ?? 0}</span>
              <span className="inline-flex items-center gap-1"><Bookmark className="w-3 h-3" />{p.save_count ?? 0}</span>
              <span className="inline-flex items-center gap-1"><Share2 className="w-3 h-3" />{p.share_count ?? 0}</span>
              <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{p.view_count ?? 0}</span>
              {showScore && p.trend_score != null && (
                <span className="inline-flex items-center gap-1" style={{ color: '#E8C97A' }}
                  title="Likes x1 + Comments x3 + Saves x5 + Shares x7 + Views x2">
                  <Flame className="w-3 h-3" />{p.trend_score}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Following - posts from studios you follow. The follow graph always existed;
// there was simply no feed query that used it.
function Following() {
  const [rows, setRows] = useState(null);
  const [count, setCount] = useState(0);
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/following`, { headers: authHeaders() })
      .then(({ data }) => { setRows(data.posts || []); setCount(data.following_count || 0); })
      .catch(() => setRows([]));
  }, []);
  return (
    <div data-testid="pixora-following">
      <p className="text-sm mb-4" style={{ color: 'var(--lux-text-muted)' }}>
        Following {count} {count === 1 ? 'studio' : 'studios'}.
      </p>
      <PostGrid rows={rows} empty="Nothing here yet - follow a few photographers and their work shows up." />
    </div>
  );
}

// Trending - spec time windows, ranked by the spec weights.
function Trending() {
  const [rows, setRows] = useState(null);
  const [win, setWin] = useState('7d');
  const WINDOWS = [['24h', '24 hours'], ['7d', '7 days'], ['30d', '30 days'], ['all', 'All time']];
  useEffect(() => {
    setRows(null);
    axios.get(`${API_URL}/api/pixora/trending`, { headers: authHeaders(), params: { window: win } })
      .then(({ data }) => setRows(data.posts || []))
      .catch(() => setRows([]));
  }, [win]);
  return (
    <div data-testid="pixora-trending">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {WINDOWS.map(([k, label]) => (
          <button key={k} onClick={() => setWin(k)}
            className="px-3 py-2 min-h-[44px] rounded-xl text-xs uppercase tracking-[0.12em]"
            style={win === k ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06' }
                             : { color: 'var(--lux-text-muted)' }}
            data-testid={`trending-window-${k}`}>
            {label}
          </button>
        ))}
      </div>
      <PostGrid rows={rows} showScore empty="Nothing trending in this window yet." />
    </div>
  );
}

// Discover - structured photographer search. Replaces a substring scan that had
// no filters at all.
function Discover() {
  const [rows, setRows] = useState(null);
  const [f, setF] = useState({ city: '', category: '', verified: false, min_followers: 0, q: '' });
  const [cats, setCats] = useState([]);

  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/post-meta`)
      .then(({ data }) => setCats(data.categories || [])).catch(() => setCats([]));
  }, []);

  const run = useCallback(() => {
    setRows(null);
    axios.get(`${API_URL}/api/pixora/discover`, { headers: authHeaders(), params: f })
      .then(({ data }) => setRows(data.photographers || []))
      .catch(() => setRows([]));
  }, [f]);
  useEffect(() => { const t = setTimeout(run, 250); return () => clearTimeout(t); }, [run]);

  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  return (
    <div data-testid="pixora-discover">
      <div className="lux-glass p-4 mb-5 grid grid-cols-1 md:grid-cols-5 gap-2">
        <input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Name or keyword"
          className="min-h-[44px] rounded-lg bg-transparent px-3 text-sm outline-none"
          style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
          data-testid="discover-q" />
        <input value={f.city} onChange={(e) => set('city', e.target.value)} placeholder="City or state"
          className="min-h-[44px] rounded-lg bg-transparent px-3 text-sm outline-none"
          style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
          data-testid="discover-city" />
        <select value={f.category} onChange={(e) => set('category', e.target.value)}
          className="min-h-[44px] rounded-lg px-2 text-sm outline-none"
          style={{ color: 'var(--lux-text)', background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}
          data-testid="discover-category">
          <option value="">Any category</option>
          {cats.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select value={f.min_followers} onChange={(e) => set('min_followers', Number(e.target.value))}
          className="min-h-[44px] rounded-lg px-2 text-sm outline-none"
          style={{ color: 'var(--lux-text)', background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}
          data-testid="discover-followers">
          <option value={0}>Any following</option>
          <option value={10}>10+ followers</option>
          <option value={50}>50+ followers</option>
          <option value={100}>100+ followers</option>
        </select>
        <label className="flex items-center gap-2 text-sm min-h-[44px]" style={{ color: 'var(--lux-text-muted)' }}>
          <input type="checkbox" checked={f.verified} onChange={(e) => set('verified', e.target.checked)}
            data-testid="discover-verified" />
          Verified only
        </label>
      </div>

      {rows === null ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />
        : rows.length === 0 ? <Empty label="No photographers match those filters." />
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rows.map((r) => (
              <a key={r.studio_id} href={r.url || '#'} className="lux-glass p-4 no-underline flex items-center gap-3"
                data-testid={`discover-card-${r.studio_id}`}>
                {r.avatar ? <img src={r.avatar} alt="" loading="lazy" className="w-12 h-12 rounded-full object-cover" />
                  : <span className="w-12 h-12 rounded-full grid place-items-center"
                      style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A' }}>
                      {(r.name || '?').charAt(0).toUpperCase()}
                    </span>}
                <div className="min-w-0">
                  <div className="text-sm truncate flex items-center gap-1" style={{ color: 'var(--lux-text)' }}>
                    {r.name}
                    {!!r.verified_level && <BadgeCheck className="w-3.5 h-3.5" style={{ color: '#E8C97A' }} />}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>
                    {r.city || '—'} · {r.followers} followers · score {r.community_score}
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
    </div>
  );
}

// Saved — the bookmark tab. Backed by pixora_saves + optional collections.
function Saved() {
  const [rows, setRows] = useState(null);
  const [cols, setCols] = useState([]);
  const [active, setActive] = useState('');      // '' = everything
  const [newCol, setNewCol] = useState('');

  const load = useCallback(async () => {
    const params = active ? { collection_id: active } : {};
    const [s, c] = await Promise.all([
      axios.get(`${API_URL}/api/pixora/saved`, { headers: authHeaders(), params }),
      axios.get(`${API_URL}/api/pixora/collections`, { headers: authHeaders() }),
    ]);
    setRows(s.data.posts || []);
    setCols(c.data.collections || []);
  }, [active]);
  useEffect(() => { load(); }, [load]);

  const addCol = async () => {
    const name = newCol.trim();
    if (!name) return;
    await axios.post(`${API_URL}/api/pixora/collections`, { name }, { headers: authHeaders() });
    setNewCol(''); load();
  };
  const unsave = async (id) => {
    await axios.post(`${API_URL}/api/pixora/posts/${id}/save`, {}, { headers: authHeaders() });
    load();
  };

  return (
    <div data-testid="pixora-saved">
      <div className="lux-glass p-4 mb-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <button onClick={() => setActive('')}
            className="px-3 py-2 min-h-[44px] rounded-xl text-xs uppercase tracking-[0.12em]"
            style={!active ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06' }
                           : { color: 'var(--lux-text-muted)' }}>
            All
          </button>
          {cols.map((c) => (
            <button key={c.id} onClick={() => setActive(c.id)}
              className="px-3 py-2 min-h-[44px] rounded-xl text-xs uppercase tracking-[0.12em]"
              style={active === c.id ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06' }
                                     : { color: 'var(--lux-text-muted)' }}>
              {c.name} <span className="opacity-70">{c.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input value={newCol} onChange={(e) => setNewCol(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCol(); }}
            placeholder="New collection (Poses, Lighting…)"
            className="flex-1 min-h-[44px] rounded-lg px-3 text-sm"
            style={{ background: 'var(--lux-panel)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
            data-testid="saved-new-collection" />
          <button onClick={addCol} className="lux-btn min-h-[44px] !text-xs"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
      </div>

      {rows === null ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#E8C97A' }} />
        : rows.length === 0 ? (
          <div className="lux-glass p-10 text-center" data-testid="saved-empty">
            <Bookmark className="w-8 h-8 mx-auto mb-3" style={{ color: '#E8C97A' }} />
            <div className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>Nothing saved yet</div>
            <div className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
              Tap the bookmark on any post to keep it here.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rows.map((p) => (
              <div key={p.id} className="lux-glass overflow-hidden" data-testid={`saved-card-${p.id}`}>
                {p.image_url ? <img src={p.image_url} alt="" className="w-full max-h-56 object-cover" />
                  : p.video_url ? <video src={p.video_url} muted playsInline preload="metadata" className="w-full max-h-56 bg-black object-cover" />
                  : null}
                <div className="p-3">
                  <div className="text-sm mb-1" style={{ color: 'var(--lux-text)' }}>{p.title || p.body}</div>
                  <div className="text-[11px] mb-2" style={{ color: 'var(--lux-text-faint)' }}>{p.author}</div>
                  <button onClick={() => unsave(p.id)} className="lux-btn lux-btn-ghost !text-[11px] min-h-[44px]"
                    data-testid={`saved-remove-${p.id}`}>
                    <Bookmark className="w-3.5 h-3.5" fill="currentColor" /> Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function Feed({ myId }) {
  const [posts, setPosts] = useState(null);
  const [kind, setKind] = useState('showcase');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imgFile, setImgFile] = useState(null);          // optional photo attachment (Basic+)
  const [extraFiles, setExtraFiles] = useState([]);      // Phase 9 - carousel frames 2..10
  const [tagText, setTagText] = useState('');            // "#candid hyderabad" → tags[]
  // Phase 2 — the spec's Create Post fields. Category + location are what
  // Discover filters on; camera/lens are what other photographers look for.
  const [meta, setMeta] = useState({ category: '', location: '', camera: '', lens: '' });
  const [cats, setCats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [openComments, setOpenComments] = useState(null);
  const [editId, setEditId] = useState(null);            // post being edited
  const [edit, setEdit] = useState({ title: '', body: '', kind: 'showcase' });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await axios.get(`${API_URL}/api/pixora/feed`, { headers: authHeaders() });
    setPosts(data.posts || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Category vocabulary comes from the server so the composer and Discover can
  // never drift from POST_CATEGORIES.
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/post-meta`)
      .then(({ data }) => setCats(data.categories || [])).catch(() => setCats([]));
  }, []);

  const post = async () => {
    if (!title.trim() && !body.trim() && !imgFile) return;
    setBusy(true);
    try {
      // A photo attachment is uploaded first (server measures & registers the real size,
      // so create_post reads it from the registry). Photo posts require a Basic plan.
      let image_url = null, size_bytes = 0;
      if (imgFile) {
        const fd = new FormData(); fd.append('file', imgFile);
        const up = await axios.post(`${API_URL}/api/pixora/media/upload`, fd,
          { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
        image_url = up.data.url; size_bytes = up.data.size_bytes;
      }
      // Carousel frames upload the same way; the server charges each one.
      const images = [];
      for (const f of extraFiles) {
        const fd = new FormData(); fd.append('file', f);
        const up = await axios.post(`${API_URL}/api/pixora/media/upload`, fd,
          { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' } });
        images.push(up.data.url);
      }
      // Tags: accept "#candid, hyderabad candid" in any shape — split on comma or
      // space, drop the '#', dedupe. The server normalises again and caps at 12.
      const tags = [...new Set(String(tagText || '')
        .split(/[,\s]+/).map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 12);
      // A clip makes it a Reel — that's what the public Reels tab reads.
      const isVideoFile = !!(imgFile && /^video\//.test(imgFile.type || ''));
      await axios.post(`${API_URL}/api/pixora/posts`, {
        kind: isVideoFile ? 'reel' : kind, title, body,
        image_url: isVideoFile ? null : image_url,
        video_url: isVideoFile ? image_url : null,
        tags, size_bytes,
        category: meta.category || null, location: meta.location || null,
        camera: meta.camera || null, lens: meta.lens || null,
        images,
      }, { headers: authHeaders() });
      setTitle(''); setBody(''); setImgFile(null); setExtraFiles([]); setTagText('');
      setMeta({ category: '', location: '', camera: '', lens: '' });
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) {
      alert(e?.response?.data?.detail || 'Could not post. Adding a photo needs a Basic plan or more storage.');
    }
    setBusy(false);
  };
  const like = async (id) => { await axios.post(`${API_URL}/api/pixora/posts/${id}/like`, {}, { headers: authHeaders() }); load(); };
  const save = async (id) => { await axios.post(`${API_URL}/api/pixora/posts/${id}/save`, {}, { headers: authHeaders() }); load(); };
  const share = async (p) => {
    // Record the share server-side (it is the heaviest ranking signal) and put
    // the link somewhere the user can actually paste it.
    const url = `${window.location.origin}${p.author_url || '/community'}`;
    try {
      if (navigator.share) await navigator.share({ title: p.title || 'MAJA Community', url });
      else await navigator.clipboard.writeText(url);
    } catch (_) { /* dismissed */ }
    try { await axios.post(`${API_URL}/api/pixora/posts/${p.id}/share`, { channel: 'link' }, { headers: authHeaders() }); } catch (_) {}
    load();
  };
  const startEdit = (p) => { setEditId(p.id); setEdit({ title: p.title || '', body: p.body || '', kind: p.kind || 'showcase' }); };
  const saveEdit = async (id) => {
    try { await axios.put(`${API_URL}/api/pixora/posts/${id}`, edit, { headers: authHeaders() }); setEditId(null); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not update post'); }
  };
  const removePost = async (id) => {
    if (!window.confirm('Delete this post? This also removes its comments.')) return;
    try { await axios.delete(`${API_URL}/api/pixora/posts/${id}`, { headers: authHeaders() }); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not delete post'); }
  };

  if (posts === null) return <Spinner />;
  return (
    <div className="space-y-5">
      <div className="lux-glass p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {KINDS.map((k) => (
            <button key={k.key} onClick={() => setKind(k.key)} data-testid={`pixora-kind-${k.key}`}
              className="px-3 py-1.5 rounded-full text-xs" style={{ border: `1px solid ${kind === k.key ? 'var(--lux-gold)' : 'var(--lux-border)'}`, background: kind === k.key ? 'rgba(212,175,55,0.12)' : 'transparent', color: 'var(--lux-text)' }}>
              {k.label}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="lux-input w-full mb-2" data-testid="pixora-post-title" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share something with the community…" rows={3} className="lux-input w-full mb-3" data-testid="pixora-post-body" />
        <div className="flex items-center gap-2 flex-wrap">
          <label className="lux-btn lux-btn-ghost text-xs cursor-pointer" data-testid="pixora-post-photo">
            <Camera className="w-4 h-4" /> {imgFile ? 'Change photo' : 'Add photo'}
            {/* a video here becomes a Reel — the public Reels tab reads exactly this */}
            <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden"
              onChange={(e) => setImgFile(e.target.files?.[0] || null)} />
          </label>
          {imgFile && <span className="text-xs truncate max-w-[160px]" style={{ color: 'var(--lux-text-muted)' }}>{imgFile.name}</span>}
          {imgFile && /^video\//.test(imgFile.type || '') && (
            <span className="rounded-full px-2 py-0.5 text-[9px] uppercase tracking-[0.18em]"
              style={{ background: 'rgba(212,175,55,0.16)', color: '#E8C97A' }}>Reel</span>
          )}
          {imgFile && <button onClick={() => { setImgFile(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-xs" style={{ color: '#e5484d' }}>remove</button>}
          {/* Phase 9 - extra carousel frames. `multi_image_post` was already a
              paid Basic capability with no way to actually post more than one. */}
          <label className="text-xs cursor-pointer" style={{ color: 'var(--lux-text-muted)' }}
            data-testid="pixora-post-carousel">
            + Add more photos
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => setExtraFiles(Array.from(e.target.files || []).slice(0, 9))} />
          </label>
          {extraFiles.length > 0 && (
            <span className="text-xs" style={{ color: '#E8C97A' }}>
              +{extraFiles.length} frame{extraFiles.length === 1 ? '' : 's'}
              <button onClick={() => setExtraFiles([])} className="ml-2" style={{ color: '#e5484d' }}>clear</button>
            </span>
          )}
          <button onClick={post} disabled={busy} className="lux-btn ml-auto" data-testid="pixora-post-submit">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Post
          </button>
        </div>
        {/* tags — how couples discover this post on the public feed */}
        <input value={tagText} onChange={(e) => setTagText(e.target.value)}
          placeholder="Tags: candid, hyderabad, pre-wedding  (helps couples find this post)"
          className="mt-2 w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none"
          style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
          data-testid="pixora-post-tags" />

        {/* Phase 2 — shoot details. Optional, but category + location are what
            make a post findable in Discover. */}
        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          <select value={meta.category}
            onChange={(e) => setMeta((m) => ({ ...m, category: e.target.value }))}
            className="min-h-[44px] rounded-lg px-2 text-sm outline-none"
            style={{ color: 'var(--lux-text)', background: 'var(--lux-panel)', border: '1px solid var(--lux-border)' }}
            data-testid="pixora-post-category">
            <option value="">Category…</option>
            {cats.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
          </select>
          {[['location', 'Location'], ['camera', 'Camera'], ['lens', 'Lens']].map(([k, label]) => (
            <input key={k} value={meta[k]}
              onChange={(e) => setMeta((m) => ({ ...m, [k]: e.target.value }))}
              placeholder={label}
              className="min-h-[44px] rounded-lg bg-transparent px-3 text-sm outline-none"
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
              data-testid={`pixora-post-${k}`} />
          ))}
        </div>
      </div>

      {posts.length === 0 ? <Empty label="No posts yet. Be the first to share." /> : posts.map((p) => (
        <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="lux-glass p-5" data-testid={`pixora-post-${p.id}`}>
          <div className="flex items-center gap-2 mb-2">
            <Camera className="w-4 h-4" style={{ color: '#E8C97A' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>{p.author}</span>
            <VerifiedBadge level={p.author_verified_level} />
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{p.kind.replace(/_/g, ' ')}</span>
            {myId && p.studio_id === myId && editId !== p.id && (
              <span className="ml-auto flex items-center gap-1">
                <button onClick={() => startEdit(p)} className="p-1 hover:text-gold" title="Edit" data-testid={`pixora-post-edit-${p.id}`}><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => removePost(p.id)} className="p-1 hover:text-red-400" title="Delete" data-testid={`pixora-post-delete-${p.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
              </span>
            )}
            {myId && p.studio_id !== myId && (
              <span className="ml-auto flex items-center" style={{ color: 'var(--lux-text-muted)' }}>
                <ReportButton targetType="post" targetId={p.id} />
              </span>
            )}
          </div>
          {editId === p.id ? (
            <div className="space-y-2 mb-3">
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Title" className="lux-input w-full" data-testid={`pixora-post-edit-title-${p.id}`} />
              <textarea value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={3} className="lux-input w-full" data-testid={`pixora-post-edit-body-${p.id}`} />
              <div className="flex gap-2">
                <button onClick={() => saveEdit(p.id)} className="lux-btn text-xs" data-testid={`pixora-post-save-${p.id}`}><Save className="w-3.5 h-3.5" /> Save</button>
                <button onClick={() => setEditId(null)} className="lux-btn lux-btn-ghost text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {p.title && <div className="font-display text-lg mb-1" style={{ color: 'var(--lux-text)' }}>{p.title}</div>}
              {p.body && <p className="text-sm mb-3" style={{ color: 'var(--lux-text-muted)' }}>{p.body}</p>}
              {p.images && p.images.length > 1 ? (
                // Carousel: horizontal snap strip - no library, and it degrades
                // to a plain scroll on anything that lacks scroll-snap.
                <div className="mb-3 flex gap-2 overflow-x-auto snap-x snap-mandatory rounded-lg"
                  data-testid={`pixora-carousel-${p.id}`}>
                  {p.images.map((u, i) => (
                    <img key={u + i} src={u} alt="" loading="lazy"
                      className="snap-center shrink-0 w-full max-h-80 object-cover rounded-lg" />
                  ))}
                </div>
              ) : p.image_url ? (
                <img src={p.image_url} alt="" className="rounded-lg mb-3 max-h-80 w-full object-cover" />
              ) : null}
              {/* Video posts (kind="reel") carry video_url and no image_url — without
                  this branch a successfully-posted reel rendered as an empty card. */}
              {p.video_url && (
                <video src={p.video_url} controls playsInline preload="metadata"
                  poster={p.image_url || undefined}
                  className="rounded-lg mb-3 max-h-80 w-full bg-black object-contain"
                  data-testid={`pixora-video-${p.id}`} />
              )}
            </>
          )}
          {/* shoot details — category / where / gear */}
          {(p.category || p.location || p.camera || p.lens) && (
            <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]"
              style={{ color: 'var(--lux-text-faint)' }} data-testid={`pixora-meta-${p.id}`}>
              {p.category && (
                <span className="rounded-full px-2 py-0.5 uppercase tracking-[0.14em]"
                  style={{ background: 'rgba(212,175,55,0.14)', color: '#E8C97A' }}>{p.category}</span>
              )}
              {p.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{p.location}</span>}
              {p.camera && <span className="inline-flex items-center gap-1"><Camera className="w-3 h-3" />{p.camera}</span>}
              {p.lens && <span>{p.lens}</span>}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
            <button onClick={() => like(p.id)} className="flex items-center gap-1 hover:text-gold"
              style={p.viewer_liked ? { color: '#E8697A' } : undefined}
              aria-pressed={!!p.viewer_liked} data-testid={`pixora-like-${p.id}`}>
              <Heart className="w-4 h-4" fill={p.viewer_liked ? 'currentColor' : 'none'} /> {p.like_count}
            </button>
            <button onClick={() => setOpenComments(openComments === p.id ? null : p.id)} className="flex items-center gap-1 hover:text-gold"><MessageCircle className="w-4 h-4" /> {p.comment_count}</button>
            {/* Phase 1 — save/share were not expressible before; the model had no
                place to put them. Save is weighted 5x a like in ranking. */}
            <button onClick={() => save(p.id)} className="flex items-center gap-1 hover:text-gold"
              style={p.viewer_saved ? { color: '#E8C97A' } : undefined}
              aria-pressed={!!p.viewer_saved} data-testid={`pixora-save-${p.id}`}>
              <Bookmark className="w-4 h-4" fill={p.viewer_saved ? 'currentColor' : 'none'} /> {p.save_count ?? 0}
            </button>
            <button onClick={() => share(p)} className="flex items-center gap-1 hover:text-gold"
              data-testid={`pixora-share-${p.id}`}>
              <Share2 className="w-4 h-4" /> {p.share_count ?? 0}
            </button>
            <span className="flex items-center gap-1" title="Views" data-testid={`pixora-views-${p.id}`}>
              <Eye className="w-4 h-4" /> {p.view_count ?? 0}
            </span>
          </div>
          {openComments === p.id && <Comments postId={p.id} onChange={load} myId={myId} postOwnerId={p.studio_id} />}
          {p.kind === 'critique_request' && <CritiquePanel postId={p.id} />}
        </motion.div>
      ))}
    </div>
  );
}

function Comments({ postId, onChange, myId, postOwnerId }) {
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const load = useCallback(async () => {
    const { data } = await axios.get(`${API_URL}/api/pixora/posts/${postId}/comments`);
    setRows(data.comments || []);
  }, [postId]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    if (!text.trim()) return;
    await axios.post(`${API_URL}/api/pixora/posts/${postId}/comment`, { body: text }, { headers: authHeaders() });
    setText(''); load(); onChange?.();
  };
  const saveEdit = async (id) => {
    if (!editText.trim()) return;
    try { await axios.put(`${API_URL}/api/pixora/comments/${id}`, { body: editText }, { headers: authHeaders() }); setEditId(null); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not edit comment'); }
  };
  const remove = async (id) => {
    if (!window.confirm('Delete this comment?')) return;
    try { await axios.delete(`${API_URL}/api/pixora/comments/${id}`, { headers: authHeaders() }); load(); onChange?.(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not delete comment'); }
  };
  return (
    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: '1px solid var(--lux-border)' }}>
      {(rows || []).map((c) => {
        const mine = myId && c.studio_id === myId;
        const canDelete = mine || (myId && postOwnerId === myId);
        return (
          <div key={c.id} className="text-xs flex items-start gap-2 group" data-testid={`pixora-comment-${c.id}`}>
            {editId === c.id ? (
              <div className="flex-1 flex gap-2">
                <input value={editText} onChange={(e) => setEditText(e.target.value)} className="lux-input flex-1 text-xs" data-testid={`pixora-comment-edit-${c.id}`} />
                <button onClick={() => saveEdit(c.id)} className="lux-btn lux-btn-ghost px-2" title="Save"><Save className="w-3 h-3" /></button>
                <button onClick={() => setEditId(null)} className="text-[10px]" style={{ color: 'var(--lux-text-muted)' }}>Cancel</button>
              </div>
            ) : (
              <>
                <span className="flex-1"><b style={{ color: '#E8C97A' }}>{c.author}</b> <span style={{ color: 'var(--lux-text-muted)' }}>{c.body}</span></span>
                <span className="flex items-center gap-1 opacity-60 group-hover:opacity-100" style={{ color: 'var(--lux-text-muted)' }}>
                  {mine && <button onClick={() => { setEditId(c.id); setEditText(c.body); }} title="Edit" data-testid={`pixora-comment-edit-btn-${c.id}`}><Pencil className="w-3 h-3" /></button>}
                  {canDelete && <button onClick={() => remove(c.id)} title="Delete" className="hover:text-red-400" data-testid={`pixora-comment-delete-${c.id}`}><Trash2 className="w-3 h-3" /></button>}
                  {myId && !mine && <ReportButton targetType="comment" targetId={c.id} />}
                </span>
              </>
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment…" className="lux-input flex-1 text-sm" data-testid={`pixora-comment-input-${postId}`} />
        <button onClick={send} className="lux-btn lux-btn-ghost"><Send className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  );
}

function Challenge({ myId }) {
  const [data, setData] = useState(null);
  const [caption, setCaption] = useState('');
  const load = useCallback(async () => {
    const { data } = await axios.get(`${API_URL}/api/pixora/challenges`, { headers: authHeaders() });
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);
  const submit = async () => {
    if (!data?.active) return;
    await axios.post(`${API_URL}/api/pixora/challenges/submit`, { challenge_id: data.active.id, caption }, { headers: authHeaders() });
    setCaption(''); load();
  };
  const vote = async (id) => { await axios.post(`${API_URL}/api/pixora/submissions/${id}/vote`, {}, { headers: authHeaders() }); load(); };
  const removeSub = async (id) => {
    if (!window.confirm('Delete your submission?')) return;
    try { await axios.delete(`${API_URL}/api/pixora/submissions/${id}`, { headers: authHeaders() }); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not delete submission'); }
  };
  if (data === null) return <Spinner />;
  if (!data.active) return <Empty label="No active challenge right now." />;
  return (
    <div className="space-y-5">
      <div className="lux-glass p-5">
        <div className="flex items-center gap-2 mb-1"><Trophy className="w-5 h-5" style={{ color: '#E8C97A' }} /><span className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{data.active.title}</span></div>
        <p className="text-sm mb-4" style={{ color: 'var(--lux-text-muted)' }}>{data.active.prompt}</p>
        <div className="flex gap-2">
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption your entry…" className="lux-input flex-1" data-testid="pixora-challenge-caption" />
          <button onClick={submit} className="lux-btn" data-testid="pixora-challenge-submit"><Plus className="w-4 h-4" /> Enter</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(data.submissions || []).map((s) => (
          <div key={s.id} className="lux-glass p-4" data-testid={`pixora-submission-${s.id}`}>
            {s.image_url && <img src={s.image_url} alt="" className="rounded-lg mb-2 w-full h-40 object-cover" />}
            <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{s.caption || 'Untitled'}</div>
            <div className="text-xs mb-2" style={{ color: 'var(--lux-text-muted)' }}>by {s.author}</div>
            <div className="flex items-center gap-3">
              <button onClick={() => vote(s.id)} className="flex items-center gap-1 text-xs hover:text-gold" style={{ color: 'var(--lux-text-muted)' }}><Heart className="w-4 h-4" /> {s.vote_count}</button>
              {myId && s.studio_id === myId && (
                <button onClick={() => removeSub(s.id)} className="flex items-center gap-1 text-xs hover:text-red-400" style={{ color: 'var(--lux-text-muted)' }} title="Delete" data-testid={`pixora-submission-delete-${s.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Leaderboard() {
  const [rows, setRows] = useState(null);
  const [following, setFollowing] = useState([]);
  const load = useCallback(() => {
    axios.get(`${API_URL}/api/pixora/leaderboard`, { headers: authHeaders() }).then(({ data }) => setRows(data.leaderboard || []));
    axios.get(`${API_URL}/api/pixora/network`, { headers: authHeaders() }).then(({ data }) => setFollowing(data.following || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const follow = async (id) => { await axios.post(`${API_URL}/api/pixora/follow/${id}`, {}, { headers: authHeaders() }); load(); };
  const connect = async (id) => {
    try { const { data } = await axios.post(`${API_URL}/api/pixora/connections/request`, { recipient: id, type: 'connect' }, { headers: authHeaders() });
      alert(data.already ? 'A request is already pending with this studio.' : 'Connection request sent.'); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not send request'); }
  };
  if (rows === null) return <Spinner />;
  if (rows.length === 0) return <Empty label="No ranked studios yet — post to climb the board." />;
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const isFollowing = following.includes(r.studio_id);
        return (
          <div key={r.studio_id} className="lux-glass p-4 flex items-center gap-4" data-testid={`pixora-rank-${r.rank}`}>
            <span className="font-display text-2xl w-8 text-center" style={{ color: r.rank <= 3 ? '#E8C97A' : 'var(--lux-text-faint)' }}>{r.rank}</span>
            <div className="flex-1">
              <div className="text-sm font-medium" style={{ color: 'var(--lux-text)' }}>{r.name}</div>
              <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{r.tier} · {r.posts} posts</div>
            </div>
            <button onClick={() => follow(r.studio_id)} className="lux-btn lux-btn-ghost text-xs shrink-0" data-testid={`pixora-follow-${r.studio_id}`}>
              {isFollowing ? <><Check className="w-3.5 h-3.5" /> Following</> : <><UserPlus className="w-3.5 h-3.5" /> Follow</>}
            </button>
            <button onClick={() => connect(r.studio_id)} className="lux-btn lux-btn-ghost text-xs shrink-0" data-testid={`pixora-connect-${r.studio_id}`}>Connect</button>
            <span className="font-display text-xl text-gold flex items-center gap-1"><Crown className="w-4 h-4" /> {r.reputation}</span>
          </div>
        );
      })}
    </div>
  );
}

function Hiring({ myId }) {
  const [gigs, setGigs] = useState(null);
  const [form, setForm] = useState({ title: '', location: '', budget_inr: '', description: '' });
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ title: '', location: '', budget_inr: '', description: '' });
  const load = useCallback(async () => { const { data } = await axios.get(`${API_URL}/api/pixora/gigs`, { headers: authHeaders() }); setGigs(data.gigs || []); }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    if (!form.title.trim()) return;
    await axios.post(`${API_URL}/api/pixora/gigs`, { ...form, budget_inr: Number(form.budget_inr) || 0 }, { headers: authHeaders() });
    setForm({ title: '', location: '', budget_inr: '', description: '' }); setCreating(false); load();
  };
  const apply = async (id) => { await axios.post(`${API_URL}/api/pixora/gigs/${id}/apply`, {}, { headers: authHeaders() }); load(); };
  const startEdit = (g) => { setEditId(g.id); setEdit({ title: g.title || '', location: g.location || '', budget_inr: g.budget_inr || '', description: g.description || '' }); };
  const saveEdit = async (id) => {
    try { await axios.put(`${API_URL}/api/pixora/gigs/${id}`, { ...edit, budget_inr: Number(edit.budget_inr) || 0 }, { headers: authHeaders() }); setEditId(null); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not update gig'); }
  };
  const removeGig = async (id) => {
    if (!window.confirm('Delete this gig?')) return;
    try { await axios.delete(`${API_URL}/api/pixora/gigs/${id}`, { headers: authHeaders() }); load(); }
    catch (e) { alert(e?.response?.data?.detail || 'Could not delete gig'); }
  };
  if (gigs === null) return <Spinner />;
  return (
    <div className="space-y-4">
      <button onClick={() => setCreating((v) => !v)} className="lux-btn" data-testid="pixora-gig-new"><Plus className="w-4 h-4" /> Post a gig</button>
      {creating && (
        <div className="lux-glass p-4 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Gig title (e.g. Second shooter, Dec wedding)" className="lux-input w-full" data-testid="pixora-gig-title" />
          <div className="flex gap-2">
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="lux-input flex-1" />
            <input value={form.budget_inr} onChange={(e) => setForm({ ...form, budget_inr: e.target.value })} placeholder="Budget ₹" type="number" className="lux-input w-32" />
          </div>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Details…" rows={2} className="lux-input w-full" />
          <button onClick={create} className="lux-btn" data-testid="pixora-gig-create">Publish gig</button>
        </div>
      )}
      {gigs.length === 0 ? <Empty label="No open gigs right now." /> : gigs.map((g) => (
        <div key={g.id} className="lux-glass p-5" data-testid={`pixora-gig-${g.id}`}>
          {editId === g.id ? (
            <div className="space-y-2">
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Gig title" className="lux-input w-full" data-testid={`pixora-gig-edit-title-${g.id}`} />
              <div className="flex gap-2">
                <input value={edit.location} onChange={(e) => setEdit({ ...edit, location: e.target.value })} placeholder="Location" className="lux-input flex-1" />
                <input value={edit.budget_inr} onChange={(e) => setEdit({ ...edit, budget_inr: e.target.value })} placeholder="Budget ₹" type="number" className="lux-input w-32" />
              </div>
              <textarea value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} rows={2} className="lux-input w-full" />
              <div className="flex gap-2">
                <button onClick={() => saveEdit(g.id)} className="lux-btn text-xs" data-testid={`pixora-gig-save-${g.id}`}><Save className="w-3.5 h-3.5" /> Save</button>
                <button onClick={() => setEditId(null)} className="lux-btn lux-btn-ghost text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{g.title}</div>
                  <div className="text-xs flex items-center gap-2 mt-1" style={{ color: 'var(--lux-text-muted)' }}>
                    <span>by {g.poster}</span>{g.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {g.location}</span>}{g.budget_inr > 0 && <span className="text-gold">{inr(g.budget_inr)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {myId && g.studio_id === myId ? (
                    <>
                      <button onClick={() => startEdit(g)} className="p-1.5 hover:text-gold" title="Edit" data-testid={`pixora-gig-edit-${g.id}`}><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => removeGig(g.id)} className="p-1.5 hover:text-red-400" title="Delete" data-testid={`pixora-gig-delete-${g.id}`}><Trash2 className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => apply(g.id)} className="lux-btn lux-btn-ghost text-xs" data-testid={`pixora-gig-apply-${g.id}`}>Apply ({g.applicant_count})</button>
                      {myId && <span style={{ color: 'var(--lux-text-muted)' }}><ReportButton targetType="gig" targetId={g.id} /></span>}
                    </>
                  )}
                </div>
              </div>
              {g.description && <p className="text-sm mt-2" style={{ color: 'var(--lux-text-muted)' }}>{g.description}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const NOTIF_LABELS = { like: 'Likes', comment: 'Comments', follow: 'New followers', event_rsvp: 'Event RSVPs', achievement: 'Achievements', connection: 'Connection requests', verification: 'Verification', gig_application: 'Gig applications', moderation: 'Moderation notices' };
function TalentApply() {
  const [t, setT] = useState(undefined);
  const [form, setForm] = useState({ headline: '', specialties: '', showreel_url: '', rate_card: '', bio: '' });
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/talent/me`, { headers: authHeaders() }); setT(data.talent || null); if (data.talent) setForm({ ...data.talent, specialties: (data.talent.specialties || []).join(', ') }); }
    catch (e) { setT(null); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    try { await axios.post(`${API_URL}/api/pixora/talent`, { ...form, specialties: form.specialties.split(',').map((s) => s.trim()).filter(Boolean) }, { headers: authHeaders() }); setMsg('Submitted for review'); load(); }
    catch (e) { setMsg('Failed'); }
  };
  if (t === undefined) return null;
  const sc = { approved: '#3ECf8E', pending: '#E8C97A', rejected: '#ff8a8a' };
  return (
    <div className="lux-glass p-5" data-testid="talent-apply">
      <div className="flex items-center justify-between mb-3">
        <div className="lux-eyebrow flex items-center gap-1.5"><Crown className="w-3.5 h-3.5" /> Pixora Talent</div>
        {t && <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: `${sc[t.status] || '#9ca3af'}22`, color: sc[t.status] || '#9ca3af' }}>{t.status}{t.featured ? ' · featured' : ''}</span>}
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--lux-text-muted)' }}>Apply to be represented as Pixora Talent — featured to premium clients and brands.</p>
      <div className="space-y-2">
        <input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Headline (e.g. Award-winning candid storyteller)" className="lux-input w-full" />
        <input value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} placeholder="Specialties (comma-separated)" className="lux-input w-full" />
        <input value={form.showreel_url} onChange={(e) => setForm({ ...form, showreel_url: e.target.value })} placeholder="Showreel URL" className="lux-input w-full" />
        <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={2} placeholder="Short bio" className="lux-input w-full" />
        <div className="flex items-center gap-3"><button onClick={save} className="lux-btn text-xs" data-testid="talent-save"><Save className="w-3.5 h-3.5" /> {t ? 'Update' : 'Apply'}</button>{msg && <span className="text-xs" style={{ color: '#E8C97A' }}>{msg}</span>}</div>
      </div>
    </div>
  );
}

function NotificationPrefs() {
  const [types, setTypes] = useState([]);
  const [prefs, setPrefs] = useState({});
  const [msg, setMsg] = useState('');
  useEffect(() => {
    axios.get(`${API_URL}/api/push/preferences`, { headers: authHeaders() }).then(({ data }) => { setTypes(data.types || []); setPrefs(data.prefs || {}); }).catch(() => {});
  }, []);
  const toggle = (t) => setPrefs((p) => ({ ...p, [t]: p[t] === false ? true : false }));
  const save = async () => { try { await axios.put(`${API_URL}/api/push/preferences`, { prefs }, { headers: authHeaders() }); setMsg('Saved'); setTimeout(() => setMsg(''), 1500); } catch (e) { setMsg('Failed'); } };
  const enableDevice = async () => {
    try {
      if ('Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (_) { /* */ } }
      const token = `web_${Math.random().toString(36).slice(2)}_${Date.now()}`;
      await axios.post(`${API_URL}/api/push/register`, { token, platform: 'web' }, { headers: authHeaders() });
      setMsg('Device registered for notifications'); setTimeout(() => setMsg(''), 2000);
    } catch (e) { setMsg('Could not register device'); }
  };
  if (!types.length) return null;
  return (
    <div className="lux-glass p-5" data-testid="notif-prefs">
      <div className="flex items-center justify-between mb-3">
        <div className="lux-eyebrow flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> Notification preferences</div>
        <button onClick={enableDevice} className="lux-btn lux-btn-ghost text-xs" data-testid="notif-enable-device">Enable on this device</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {types.map((t) => (
          <label key={t} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: 'var(--lux-panel)' }}>
            <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{NOTIF_LABELS[t] || t}</span>
            <input type="checkbox" checked={prefs[t] !== false} onChange={() => toggle(t)} data-testid={`notif-${t}`} />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={save} className="lux-btn text-xs" data-testid="notif-save"><Save className="w-3.5 h-3.5" /> Save preferences</button>
        {msg && <span className="text-xs" style={{ color: '#3ECf8E' }}>{msg}</span>}
      </div>
    </div>
  );
}

function Profile() {
  const [me, setMe] = useState(null);
  useEffect(() => { axios.get(`${API_URL}/api/pixora/me`, { headers: authHeaders() }).then(({ data }) => setMe(data)).catch(() => setMe(false)); }, []);
  if (me === null) return <Spinner />;
  if (me === false) return <Empty label="Sign in to your studio to view your community profile." />;
  return (
    <div className="space-y-5">
      <div className="lux-glass p-6 text-center">
        <div className="font-display text-3xl text-gold mb-1">{me.reputation}</div>
        <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--lux-text-muted)' }}>Reputation · {me.tier}</div>
        <div className="text-sm flex items-center justify-center gap-1.5" style={{ color: 'var(--lux-text)' }}>
          {me.name}
          {me.verification?.level > 0 && <VerifiedBadge level={me.verification.level} />}
        </div>
        {me.verification?.level > 0 && <div className="text-[11px] mt-1" style={{ color: VERIFY_META[me.verification.level]?.color }}>{me.verification.level_label}</div>}
        <div className="flex justify-center gap-5 mt-4 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
          <span>{me.stats.posts} posts</span><span>{me.stats.likes_received} likes</span><span>{me.stats.comments_made} comments</span><span>{me.stats.challenge_wins} wins</span>
        </div>
      </div>

      {/* P2: Community Score with breakdown */}
      {me.community_score && (
        <div className="lux-glass p-5" data-testid="community-score">
          <div className="flex items-center justify-between mb-3">
            <div className="lux-eyebrow">◆ Community Score</div>
            <div className="font-display text-2xl text-gold">{me.community_score.score}</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {[
              ['profile_completion', 'Profile'], ['portfolio_published', 'Published'],
              ['posts', 'Posts'], ['followers', 'Followers'], ['daily_logins', 'Daily logins'],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between px-2 py-1 rounded" style={{ background: 'var(--lux-panel)' }}>
                <span style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
                <span style={{ color: 'var(--lux-text)' }}>+{me.community_score.breakdown?.[k] || 0}</span>
              </div>
            ))}
          </div>
          <div className="text-[11px] mt-2" style={{ color: 'var(--lux-text-faint)' }}>Profile 20 · Published 50 · Post 5 · Follower 1 · Daily login 1. Visit daily to keep growing.</div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {me.achievements.map((a) => (
          <div key={a.key} className="lux-glass p-4 text-center" style={{ opacity: a.unlocked ? 1 : 0.4 }} data-testid={`pixora-ach-${a.key}`}>
            <Award className="w-6 h-6 mx-auto mb-1" style={{ color: a.unlocked ? '#E8C97A' : 'var(--lux-text-faint)' }} />
            <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{a.label}</div>
            <div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{a.desc}</div>
          </div>
        ))}
      </div>
      <TalentApply />
      <NotificationPrefs />
      <Certifications />
      <TeamSection />
      <VideoTestimonials />
    </div>
  );
}

function Certifications() {
  const [certs, setCerts] = useState([]);
  useEffect(() => { axios.get(`${API_URL}/api/pixora/certifications`, { headers: authHeaders() }).then(({ data }) => setCerts(data.certifications || [])).catch(() => {}); }, []);
  if (certs.length === 0) return null;
  return (
    <div>
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Certifications</h3>
      <div className="flex flex-wrap gap-2">
        {certs.map((c) => (
          <span key={c.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }} data-testid={`pixora-cert-${c.content_id}`}>
            <GraduationCap className="w-3.5 h-3.5" /> {c.title}
          </span>
        ))}
      </div>
    </div>
  );
}

function TeamSection() {
  const [team, setTeam] = useState([]);
  const [form, setForm] = useState({ name: '', role: '' });
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/team`, { headers: authHeaders() }).then(({ data }) => setTeam(data.team || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const add = async () => { if (!form.name.trim()) return; await axios.post(`${API_URL}/api/pixora/team`, form, { headers: authHeaders() }); setForm({ name: '', role: '' }); load(); };
  const del = async (id) => { await axios.delete(`${API_URL}/api/pixora/team/${id}`, { headers: authHeaders() }); load(); };
  return (
    <div>
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Team</h3>
      <div className="flex gap-2 mb-3">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="lux-input flex-1" data-testid="pixora-team-name" />
        <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Role" className="lux-input flex-1" />
        <button onClick={add} className="lux-btn" data-testid="pixora-team-add"><Plus className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {team.map((m) => (
          <div key={m.id} className="lux-glass p-3 flex items-center justify-between" data-testid={`pixora-team-${m.id}`}>
            <div><div className="text-sm" style={{ color: 'var(--lux-text)' }}>{m.name}</div><div className="text-[11px]" style={{ color: 'var(--lux-text-muted)' }}>{m.role}</div></div>
            <button onClick={() => del(m.id)} className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoTestimonials() {
  const [videos, setVideos] = useState([]);
  const [form, setForm] = useState({ client_name: '', video_url: '' });
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/testimonial-videos`, { headers: authHeaders() }).then(({ data }) => setVideos(data.videos || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const add = async () => { if (!form.video_url.trim()) return; await axios.post(`${API_URL}/api/pixora/testimonial-videos`, form, { headers: authHeaders() }); setForm({ client_name: '', video_url: '' }); load(); };
  return (
    <div>
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Video testimonials</h3>
      <div className="flex gap-2 mb-3">
        <input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} placeholder="Client name" className="lux-input flex-1" />
        <input value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="Video URL (YouTube/Vimeo)" className="lux-input flex-1" data-testid="pixora-video-url" />
        <button onClick={add} className="lux-btn" data-testid="pixora-video-add"><Video className="w-4 h-4" /></button>
      </div>
      <div className="space-y-2">
        {videos.map((v) => (
          <a key={v.id} href={v.video_url} target="_blank" rel="noreferrer" className="lux-glass p-3 flex items-center gap-2 text-sm" style={{ color: 'var(--lux-text)' }} data-testid={`pixora-video-${v.id}`}>
            <Video className="w-4 h-4" style={{ color: '#E8C97A' }} /> {v.client_name || 'Client'} {v.event_type && <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>· {v.event_type}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}

function CritiquePanel({ postId }) {
  const [data, setData] = useState(null);
  const [body, setBody] = useState('');
  const [scores, setScores] = useState({ composition: 0, lighting: 0, editing: 0 });
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/posts/${postId}/critiques`).then(({ data }) => setData(data)).catch(() => {}), [postId]);
  useEffect(() => { load(); }, [load]);
  const send = async () => {
    if (!body.trim()) return;
    await axios.post(`${API_URL}/api/pixora/posts/${postId}/critique`, { body, ...scores }, { headers: authHeaders() });
    setBody(''); setScores({ composition: 0, lighting: 0, editing: 0 }); load();
  };
  const Rating = ({ k }) => (
    <div className="flex items-center gap-1">
      <span className="text-[10px] uppercase w-20" style={{ color: 'var(--lux-text-muted)' }}>{k}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => setScores((s) => ({ ...s, [k]: n }))}>
          <Star className="w-3.5 h-3.5" style={{ color: n <= scores[k] ? '#E8C97A' : 'var(--lux-border)' }} fill={n <= scores[k] ? '#E8C97A' : 'none'} />
        </button>
      ))}
    </div>
  );
  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--lux-border)' }} data-testid={`pixora-critique-${postId}`}>
      <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: '#E8C97A' }}>Critique
        {data?.averages && <span className="ml-2" style={{ color: 'var(--lux-text-muted)' }}>avg C{data.averages.composition ?? '–'} L{data.averages.lighting ?? '–'} E{data.averages.editing ?? '–'}</span>}
      </div>
      <div className="space-y-1 mb-2"><Rating k="composition" /><Rating k="lighting" /><Rating k="editing" /></div>
      <div className="flex gap-2">
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Your critique…" className="lux-input flex-1 text-sm" data-testid={`pixora-critique-input-${postId}`} />
        <button onClick={send} className="lux-btn lux-btn-ghost"><Send className="w-3.5 h-3.5" /></button>
      </div>
      {(data?.critiques || []).map((c) => (
        <div key={c.id} className="text-xs mt-2"><b style={{ color: '#E8C97A' }}>{c.author}</b> <span style={{ color: 'var(--lux-text-muted)' }}>{c.body}</span></div>
      ))}
    </div>
  );
}

function Awards() {
  const [data, setData] = useState(null);
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/awards`, { headers: authHeaders() }).then(({ data }) => setData(data)).catch(() => setData({})), []);
  useEffect(() => { load(); }, [load]);
  const [lb, setLb] = useState([]);
  useEffect(() => { axios.get(`${API_URL}/api/pixora/leaderboard`, { headers: authHeaders() }).then(({ data }) => setLb(data.leaderboard || [])); }, []);
  const nominate = async (id) => { if (!data?.active) return; await axios.post(`${API_URL}/api/pixora/awards/nominate`, { award_id: data.active.id, nominee_studio_id: id }, { headers: authHeaders() }); load(); };
  if (data === null) return <Spinner />;
  if (!data.active) return <Empty label="No active award season." />;
  return (
    <div className="space-y-5">
      <div className="lux-glass p-5">
        <div className="flex items-center gap-2 mb-1"><Star className="w-5 h-5" style={{ color: '#E8C97A' }} /><span className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{data.active.title}</span></div>
        <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{data.active.desc}</p>
      </div>
      {(data.nominations || []).length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>Leading nominees</div>
          {data.nominations.map((n) => (
            <div key={n.nominee_studio_id} className="lux-glass p-3 flex items-center justify-between" data-testid={`pixora-nominee-${n.nominee_studio_id}`}>
              <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{n.name}</span>
              <span className="text-gold text-sm flex items-center gap-1"><Star className="w-4 h-4" /> {n.vote_count}</span>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}>Nominate a studio</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {lb.map((r) => (
            <div key={r.studio_id} className="lux-glass p-3 flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{r.name}</span>
              <button onClick={() => nominate(r.studio_id)} className="lux-btn lux-btn-ghost text-xs" data-testid={`pixora-nominate-${r.studio_id}`}>Nominate</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Mentors() {
  const [mentors, setMentors] = useState(null);
  const [form, setForm] = useState({ expertise: '', bio: '', rate_inr: '' });
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/mentors`, { headers: authHeaders() }).then(({ data }) => setMentors(data.mentors || [])), []);
  useEffect(() => { load(); }, [load]);
  const become = async () => { await axios.post(`${API_URL}/api/pixora/mentors`, { ...form, rate_inr: Number(form.rate_inr) || 0 }, { headers: authHeaders() }); setCreating(false); load(); };
  const request = async (id) => { await axios.post(`${API_URL}/api/pixora/mentors/request`, { mentor_id: id, message: 'I would love your guidance.' }, { headers: authHeaders() }); alert('Request sent'); };
  if (mentors === null) return <Spinner />;
  return (
    <div className="space-y-4">
      <button onClick={() => setCreating((v) => !v)} className="lux-btn" data-testid="pixora-become-mentor"><GraduationCap className="w-4 h-4" /> Become a mentor</button>
      {creating && (
        <div className="lux-glass p-4 space-y-2">
          <input value={form.expertise} onChange={(e) => setForm({ ...form, expertise: e.target.value })} placeholder="Expertise (e.g. Candid, Editing)" className="lux-input w-full" data-testid="pixora-mentor-expertise" />
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Short bio" rows={2} className="lux-input w-full" />
          <input value={form.rate_inr} onChange={(e) => setForm({ ...form, rate_inr: e.target.value })} placeholder="Rate ₹/hr (0 = free)" type="number" className="lux-input w-full" />
          <button onClick={become} className="lux-btn" data-testid="pixora-mentor-save">Save mentor profile</button>
        </div>
      )}
      {mentors.length === 0 ? <Empty label="No mentors yet — be the first." /> : mentors.map((m) => (
        <div key={m.id} className="lux-glass p-5 flex items-start justify-between gap-3" data-testid={`pixora-mentor-${m.studio_id}`}>
          <div>
            <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{m.name}</div>
            <div className="text-xs text-gold mb-1">{m.expertise}</div>
            <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{m.bio}</p>
            <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>{m.rate_inr > 0 ? `₹${m.rate_inr}/hr` : 'Free / pro-bono'}</div>
          </div>
          <button onClick={() => request(m.studio_id)} className="lux-btn lux-btn-ghost text-xs shrink-0" data-testid={`pixora-mentor-request-${m.studio_id}`}>Request</button>
        </div>
      ))}
    </div>
  );
}

function Stars({ value = 0, count = 0 }) {
  const v = Math.round(Number(value) || 0);
  return (
    <span className="inline-flex items-center gap-0.5" title={`${value || 0} (${count})`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className="w-3.5 h-3.5" style={{ color: n <= v ? '#E8C97A' : 'var(--lux-border)', fill: n <= v ? '#E8C97A' : 'none' }} />)}
      {count > 0 && <span className="text-[10px] ml-1" style={{ color: 'var(--lux-text-faint)' }}>({count})</span>}
    </span>
  );
}

// Expandable reviews list + write-a-review for one listing.
function ListingReviews({ id, onRated }) {
  const [data, setData] = useState(null);
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/marketplace/${id}/reviews`, { headers: authHeaders() }).then(({ data }) => setData(data)).catch(() => setData({ reviews: [] })), [id]);
  useEffect(() => { load(); }, [load]);
  const write = async () => {
    const r = Number(window.prompt('Your rating (1–5):', '5'));
    if (!r || r < 1 || r > 5) return;
    const text = window.prompt('A short review (optional):', '') || '';
    await axios.post(`${API_URL}/api/pixora/marketplace/${id}/review`, { rating: r, text }, { headers: authHeaders() });
    load(); onRated && onRated();
  };
  return (
    <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--lux-border)' }}>
      <div className="flex items-center justify-between mb-1">
        <span className="lux-eyebrow">Reviews</span>
        <button onClick={write} className="lux-btn lux-btn-ghost text-[11px]" data-testid={`review-write-${id}`}>Write a review</button>
      </div>
      {!data ? <Spinner /> : (data.reviews || []).length === 0
        ? <div className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>No reviews yet.</div>
        : <div className="space-y-1">{data.reviews.map((rv) => (
            <div key={rv.id} className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              <b style={{ color: '#E8C97A' }}>{rv.author}</b> <Stars value={rv.rating} /> {rv.text}
            </div>))}</div>}
    </div>
  );
}

function Marketplace() {
  const [items, setItems] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [tab, setTab] = useState('browse');
  const [sellerFilter, setSellerFilter] = useState('');
  const [openReviews, setOpenReviews] = useState(null);
  const [form, setForm] = useState({ title: '', kind: 'preset', price_inr: '', description: '' });
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/marketplace`, { headers: authHeaders() }).then(({ data }) => setItems(data.listings || [])), []);
  const loadPurchases = useCallback(() => axios.get(`${API_URL}/api/pixora/marketplace/purchases`, { headers: authHeaders() }).then(({ data }) => setPurchases(data.purchases || [])).catch(() => {}), []);
  useEffect(() => { load(); loadPurchases(); }, [load, loadPurchases]);
  const create = async () => { if (!form.title.trim()) return; await axios.post(`${API_URL}/api/pixora/marketplace`, { ...form, price_inr: Number(form.price_inr) || 0 }, { headers: authHeaders() }); setForm({ title: '', kind: 'preset', price_inr: '', description: '' }); setCreating(false); load(); };
  const buy = async (id) => {
    try {
      const { data } = await axios.post(`${API_URL}/api/pixora/marketplace/${id}/buy`, {}, { headers: authHeaders() });
      if (data.status === 'payment_pending') alert(data.message || 'Payment integration pending configuration.');
      else if (data.file_url || data.status === 'purchased') alert('Purchased — download ready in “My purchases”.');
      else alert(data.message || 'Order created.');
      load(); loadPurchases();
    } catch { alert('Could not complete. Please try again.'); }
  };
  if (items === null) return <Spinner />;
  const shown = sellerFilter ? items.filter((it) => it.seller === sellerFilter) : items;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {[['browse', 'Browse'], ['purchases', 'My purchases']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`text-xs px-3 py-1.5 rounded-lg ${tab === k ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`} data-testid={`market-tab-${k}`}>{l}</button>
        ))}
        <button onClick={() => setCreating((v) => !v)} className="lux-btn text-xs ml-auto" data-testid="pixora-listing-new"><Plus className="w-4 h-4" /> Sell a resource</button>
      </div>

      {creating && (
        <div className="lux-glass p-4 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title (e.g. Warm Wedding Preset Pack)" className="lux-input w-full" data-testid="pixora-listing-title" />
          <div className="flex gap-2">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="lux-input flex-1">
              {['preset', 'template', 'overlay', 'guide'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: e.target.value })} placeholder="Price ₹" type="number" className="lux-input w-32" />
          </div>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} className="lux-input w-full" />
          <button onClick={create} className="lux-btn" data-testid="pixora-listing-create">Publish listing</button>
        </div>
      )}

      {tab === 'purchases' ? (
        purchases.length === 0 ? <Empty label="You haven't purchased anything yet." /> : (
          <div className="space-y-2" data-testid="market-purchases">
            {purchases.map((p) => (
              <div key={p.id} className="lux-glass p-3 flex items-center justify-between gap-2" data-testid={`purchase-${p.id}`}>
                <div className="min-w-0">
                  <div className="font-display truncate" style={{ color: 'var(--lux-text)' }}>{p.title || 'Resource'}</div>
                  <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>{p.kind} · {p.seller || ''} · {p.amount_inr > 0 ? inr(p.amount_inr) : 'Free'}</div>
                </div>
                {p.file_url
                  ? <a href={p.file_url} target="_blank" rel="noreferrer" className="lux-btn text-xs shrink-0">Download</a>
                  : <span className="text-[11px] shrink-0" style={{ color: 'var(--lux-text-faint)' }}>{p.status === 'payment_pending' ? 'Payment pending' : '—'}</span>}
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          {sellerFilter && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              Storefront: <b style={{ color: '#E8C97A' }}>{sellerFilter}</b>
              <button onClick={() => setSellerFilter('')} className="underline">clear</button>
            </div>
          )}
          {shown.length === 0 ? <Empty label="No resources for sale yet." /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {shown.map((it) => (
                <div key={it.id} className="lux-glass p-4" data-testid={`pixora-listing-${it.id}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{it.kind}</span>
                    <span className="text-gold font-display">{it.price_inr > 0 ? inr(it.price_inr) : 'Free'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{it.title}</div>
                    {it.is_featured && <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'rgba(212,175,55,0.2)', color: '#E8C97A' }}>Featured</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--lux-text-muted)' }}>
                    by <button onClick={() => setSellerFilter(it.seller)} className="underline" data-testid={`seller-${it.id}`}>{it.seller}</button> · {it.sales || 0} sold
                    <Stars value={it.rating_avg} count={it.rating_count} />
                  </div>
                  <p className="text-sm mb-3" style={{ color: 'var(--lux-text-muted)' }}>{it.description}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => buy(it.id)} className="lux-btn text-xs" data-testid={`pixora-buy-${it.id}`}><ShoppingBag className="w-3.5 h-3.5" /> Get it</button>
                    <button onClick={() => setOpenReviews(openReviews === it.id ? null : it.id)} className="lux-btn lux-btn-ghost text-xs" data-testid={`reviews-toggle-${it.id}`}>Reviews</button>
                  </div>
                  {openReviews === it.id && <ListingReviews id={it.id} onRated={load} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===================== Batch 6 — Brand Campaign Marketplace =====================
function Campaigns({ myId }) {
  const [view, setView] = useState('browse');
  const sub = [['browse', 'Browse Deals'], ['brand', 'My Brand'], ['deals', 'My Deals']];
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {sub.map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`text-xs px-3 py-1.5 rounded-lg ${view === k ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`} data-testid={`campaign-sub-${k}`}>{l}</button>
        ))}
      </div>
      {view === 'browse' && <CampaignBrowse myId={myId} />}
      {view === 'brand' && <BrandProfile />}
      {view === 'deals' && <MyDeals myId={myId} />}
    </div>
  );
}

function CampaignBrowse({ myId }) {
  const [data, setData] = useState(null);
  const [facets, setFacets] = useState({ categories: [], countries: [], regions: [] });
  const [f, setF] = useState({ category: '', country: '', region: '', q: '' });
  const [sel, setSel] = useState(null);
  const load = useCallback(() => {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    return axios.get(`${API_URL}/api/pixora/campaigns?${p}`, { headers: authHeaders() })
      .then(({ data }) => { setData(data.campaigns || []); setFacets(data.facets || { categories: [], countries: [], regions: [] }); })
      .catch(() => setData([]));
  }, [f]);
  useEffect(() => { load(); }, [load]);
  if (data === null) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Search brand campaigns…" className="lux-input text-sm flex-1 min-w-[160px]" />
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="lux-input text-sm"><option value="">All categories</option>{facets.categories.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className="lux-input text-sm"><option value="">All countries</option>{facets.countries.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} className="lux-input text-sm"><option value="">All regions</option>{facets.regions.map((c) => <option key={c} value={c}>{c}</option>)}</select>
      </div>
      {data.length === 0 ? <Empty label="No open brand campaigns yet." /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.map((c) => (
            <button key={c.id} onClick={() => setSel(c.id)} className="lux-glass p-5 text-left" data-testid={`campaign-card-${c.id}`} style={c.featured ? { border: '1px solid var(--lux-gold)' } : {}}>
              <div className="flex items-center gap-2 flex-wrap">
                {c.featured && <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.18)', color: '#E8C97A' }}>Featured</span>}
                <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{c.category}</span>
                <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{c.title}</span>
              </div>
              <div className="text-xs mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--lux-text-muted)' }}>
                <span className="flex items-center gap-1">{c.brand_name}{c.brand_verified && <BadgeCheck className="w-3 h-3" style={{ color: '#E8C97A' }} />}</span>
                {(c.country || c.region) && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {[c.country, c.region].filter(Boolean).join(' · ')}</span>}
              </div>
              {c.brief && <p className="text-sm mt-2 line-clamp-2" style={{ color: 'var(--lux-text-muted)' }}>{c.brief}</p>}
              <div className="text-xs mt-2 flex items-center gap-3 text-gold">
                {c.budget_amount > 0 && <span>{c.budget_currency} {Number(c.budget_amount).toLocaleString()}</span>}
                <span style={{ color: 'var(--lux-text-muted)' }}>{c.applicant_count} applied · {c.slots} slot{c.slots > 1 ? 's' : ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {sel && <CampaignModal id={sel} myId={myId} onClose={() => { setSel(null); load(); }} />}
    </div>
  );
}

function BrandProfile() {
  const [brand, setBrand] = useState(undefined);
  const [form, setForm] = useState({ name: '', logo_url: '', website: '', about: '', industry: '', country: '' });
  const [cForm, setCForm] = useState({ title: '', brief: '', category: 'photography', deliverables_spec: '', region: '', country: '', budget_amount: '', budget_currency: 'INR', slots: 1, deadline: '' });
  const [msg, setMsg] = useState('');
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/brands/me`, { headers: authHeaders() }).then(({ data }) => { setBrand(data.brand); if (data.brand) setForm({ name: data.brand.name || '', logo_url: data.brand.logo_url || '', website: data.brand.website || '', about: data.brand.about || '', industry: data.brand.industry || '', country: data.brand.country || '' }); }).catch(() => setBrand(null)), []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { if (!form.name.trim()) { setMsg('Brand name is required.'); return; } try { await axios.post(`${API_URL}/api/pixora/brands`, form, { headers: authHeaders() }); setMsg('Brand saved.'); load(); } catch (e) { setMsg(e?.response?.data?.detail || 'Could not save'); } };
  const createCampaign = async () => { if (!cForm.title.trim()) { setMsg('Campaign title is required.'); return; } try { await axios.post(`${API_URL}/api/pixora/campaigns`, { ...cForm, budget_amount: Number(cForm.budget_amount) || 0, slots: Number(cForm.slots) || 1 }, { headers: authHeaders() }); setMsg('Campaign published. Track it under “My Deals”.'); setCForm({ title: '', brief: '', category: 'photography', deliverables_spec: '', region: '', country: '', budget_amount: '', budget_currency: 'INR', slots: 1, deadline: '' }); } catch (e) { setMsg(e?.response?.data?.detail || 'Could not create'); } };
  if (brand === undefined) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="lux-glass p-5 space-y-2">
        <div className="flex items-center gap-2"><Megaphone className="w-4 h-4 text-gold" /><span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Your brand profile</span>{brand?.verified && <span className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(62,207,142,0.15)', color: '#3ECf8E' }}><BadgeCheck className="w-3 h-3" /> Verified</span>}</div>
        <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Register a brand to post paid campaigns and hire creators from the community.</p>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Brand name" className="lux-input w-full" data-testid="brand-name" />
        <div className="flex gap-2 flex-wrap">
          <input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="Industry" className="lux-input flex-1" />
          <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Country" className="lux-input flex-1" />
        </div>
        <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website" className="lux-input w-full" />
        <input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="Logo URL" className="lux-input w-full" />
        <textarea value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} placeholder="About the brand" rows={2} className="lux-input w-full" />
        <button onClick={save} className="lux-btn" data-testid="brand-save"><Save className="w-4 h-4" /> {brand ? 'Update brand' : 'Create brand'}</button>
      </div>
      {brand && (
        <div className="lux-glass p-5 space-y-2">
          <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Post a campaign</div>
          <input value={cForm.title} onChange={(e) => setCForm({ ...cForm, title: e.target.value })} placeholder="Campaign title" className="lux-input w-full" data-testid="campaign-title" />
          <textarea value={cForm.brief} onChange={(e) => setCForm({ ...cForm, brief: e.target.value })} placeholder="Brief — what the brand needs" rows={2} className="lux-input w-full" />
          <textarea value={cForm.deliverables_spec} onChange={(e) => setCForm({ ...cForm, deliverables_spec: e.target.value })} placeholder="Deliverables expected (e.g. 3 reels, 20 edited photos)" rows={2} className="lux-input w-full" />
          <div className="flex gap-2 flex-wrap">
            <select value={cForm.category} onChange={(e) => setCForm({ ...cForm, category: e.target.value })} className="lux-input flex-1">{['photography', 'videography', 'reels', 'editing', 'mixed'].map((k) => <option key={k} value={k}>{k}</option>)}</select>
            <input value={cForm.country} onChange={(e) => setCForm({ ...cForm, country: e.target.value })} placeholder="Country" className="lux-input flex-1" />
            <input value={cForm.region} onChange={(e) => setCForm({ ...cForm, region: e.target.value })} placeholder="Region" className="lux-input flex-1" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <input value={cForm.budget_amount} onChange={(e) => setCForm({ ...cForm, budget_amount: e.target.value })} type="number" placeholder="Budget" className="lux-input flex-1" />
            <select value={cForm.budget_currency} onChange={(e) => setCForm({ ...cForm, budget_currency: e.target.value })} className="lux-input">{['INR', 'USD', 'EUR', 'GBP', 'AED'].map((k) => <option key={k} value={k}>{k}</option>)}</select>
            <input value={cForm.slots} onChange={(e) => setCForm({ ...cForm, slots: e.target.value })} type="number" placeholder="Slots" className="lux-input w-24" />
            <input value={cForm.deadline} onChange={(e) => setCForm({ ...cForm, deadline: e.target.value })} type="date" className="lux-input" />
          </div>
          <button onClick={createCampaign} className="lux-btn" data-testid="campaign-create"><Plus className="w-4 h-4" /> Publish campaign</button>
        </div>
      )}
      {msg && <div className="text-xs text-gold">{msg}</div>}
    </div>
  );
}

function MyDeals({ myId }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/campaigns/mine`, { headers: authHeaders() }).then(({ data }) => setData(data)).catch(() => setData({ as_brand: [], as_creator: [] })), []);
  useEffect(() => { load(); }, [load]);
  if (data === null) return <Spinner />;
  const statusPill = (s) => <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{s}</span>;
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}>Campaigns you posted</div>
        {(data.as_brand || []).length === 0 ? <Empty label="You haven't posted any campaigns." /> : (data.as_brand || []).map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} className="lux-glass p-4 w-full text-left mb-2" data-testid={`mydeal-brand-${c.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-display" style={{ color: 'var(--lux-text)' }}>{c.title}</span>
              <div className="flex items-center gap-2">{statusPill(c.status)}<span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>{c.applicant_count} applied</span></div>
            </div>
          </button>
        ))}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}>Campaigns you applied to</div>
        {(data.as_creator || []).length === 0 ? <Empty label="You haven't applied to any campaigns." /> : (data.as_creator || []).map((c) => (
          <button key={c.id} onClick={() => setSel(c.id)} className="lux-glass p-4 w-full text-left mb-2" data-testid={`mydeal-creator-${c.id}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-display" style={{ color: 'var(--lux-text)' }}>{c.title} <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>· {c.brand_name}</span></span>
              {statusPill(c.my_application?.status || 'pending')}
            </div>
          </button>
        ))}
      </div>
      {sel && <CampaignModal id={sel} myId={myId} onClose={() => { setSel(null); load(); }} />}
    </div>
  );
}

function CampaignModal({ id, myId, onClose }) {
  const [c, setC] = useState(null);
  const [apply, setApply] = useState({ pitch: '', quote_amount: '', quote_currency: 'INR' });
  const [apps, setApps] = useState(null);
  const [dlv, setDlv] = useState(null);
  const [report, setReport] = useState(null);
  const [dForm, setDForm] = useState({ title: '', url: '', note: '' });
  const [pForm, setPForm] = useState({ application_id: '', amount: '', currency: 'INR', note: '' });
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/pixora/campaigns/${id}`, { headers: authHeaders() });
      setC(data.campaign);
      if (data.campaign.is_owner) {
        const [a, d, r] = await Promise.all([
          axios.get(`${API_URL}/api/pixora/campaigns/${id}/applications`, { headers: authHeaders() }),
          axios.get(`${API_URL}/api/pixora/campaigns/${id}/deliverables`, { headers: authHeaders() }),
          axios.get(`${API_URL}/api/pixora/campaigns/${id}/report`, { headers: authHeaders() }),
        ]);
        setApps(a.data.applications || []); setDlv(d.data.deliverables || []); setReport(r.data);
      } else {
        const d = await axios.get(`${API_URL}/api/pixora/campaigns/${id}/deliverables`, { headers: authHeaders() });
        setDlv(d.data.deliverables || []);
      }
    } catch (e) { onClose(); }
  }, [id, onClose]);
  useEffect(() => { load(); }, [load]);
  const doApply = async () => { try { await axios.post(`${API_URL}/api/pixora/campaigns/${id}/apply`, { ...apply, quote_amount: Number(apply.quote_amount) || 0 }, { headers: authHeaders() }); setMsg('Application sent.'); load(); } catch (e) { setMsg(e?.response?.data?.detail || 'Could not apply'); } };
  const decide = async (aid, decision) => { try { await axios.post(`${API_URL}/api/pixora/applications/${aid}/decision`, { decision }, { headers: authHeaders() }); load(); } catch (e) { setMsg(e?.response?.data?.detail || 'Failed'); } };
  const submitDlv = async () => { const mine = (c?.my_application); if (!mine) return; if (!dForm.title.trim()) { setMsg('Deliverable title required.'); return; } try { await axios.post(`${API_URL}/api/pixora/applications/${mine.id}/deliverables`, dForm, { headers: authHeaders() }); setMsg('Deliverable submitted.'); setDForm({ title: '', url: '', note: '' }); load(); } catch (e) { setMsg(e?.response?.data?.detail || 'Failed'); } };
  const reviewDlv = async (did, decision) => { try { await axios.post(`${API_URL}/api/pixora/deliverables/${did}/review`, { decision, note: '' }, { headers: authHeaders() }); load(); } catch (e) { setMsg(e?.response?.data?.detail || 'Failed'); } };
  const recordPay = async () => { if (!pForm.application_id || !(Number(pForm.amount) > 0)) { setMsg('Pick a creator and amount.'); return; } try { const { data } = await axios.post(`${API_URL}/api/pixora/campaigns/${id}/payments`, { ...pForm, amount: Number(pForm.amount) }, { headers: authHeaders() }); setMsg(data.note || 'Payment recorded.'); setPForm({ application_id: '', amount: '', currency: 'INR', note: '' }); load(); } catch (e) { setMsg(e?.response?.data?.detail || 'Failed'); } };
  const accepted = (apps || []).filter((a) => a.status === 'accepted');
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto lux-glass" onClick={(e) => e.stopPropagation()}>
        {!c ? <Spinner /> : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{c.category}</span>
                  <h2 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>{c.title}</h2>
                </div>
                <div className="text-xs mt-1 flex items-center gap-2" style={{ color: 'var(--lux-text-muted)' }}>{c.brand_name}{c.brand_verified && <BadgeCheck className="w-3 h-3" style={{ color: '#E8C97A' }} />} · {c.status}</div>
              </div>
              <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--lux-text)' }} /></button>
            </div>
            {c.brief && <p className="text-sm mt-3" style={{ color: 'var(--lux-text-muted)' }}>{c.brief}</p>}
            {c.deliverables_spec && <div className="text-xs mt-2 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--lux-text-muted)' }}><strong style={{ color: 'var(--lux-text)' }}>Deliverables:</strong> {c.deliverables_spec}</div>}
            <div className="text-xs mt-2 flex items-center gap-3 text-gold">{c.budget_amount > 0 && <span>{c.budget_currency} {Number(c.budget_amount).toLocaleString()}</span>}<span style={{ color: 'var(--lux-text-muted)' }}>{c.slots} slot{c.slots > 1 ? 's' : ''}</span></div>

            {/* Creator: apply */}
            {!c.is_owner && !c.my_application && c.status === 'open' && (
              <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--lux-border)' }}>
                <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>Apply to this campaign</div>
                <textarea value={apply.pitch} onChange={(e) => setApply({ ...apply, pitch: e.target.value })} placeholder="Your pitch — why you're a fit" rows={2} className="lux-input w-full" data-testid="campaign-pitch" />
                <div className="flex gap-2">
                  <input value={apply.quote_amount} onChange={(e) => setApply({ ...apply, quote_amount: e.target.value })} type="number" placeholder="Your quote" className="lux-input flex-1" />
                  <select value={apply.quote_currency} onChange={(e) => setApply({ ...apply, quote_currency: e.target.value })} className="lux-input">{['INR', 'USD', 'EUR', 'GBP', 'AED'].map((k) => <option key={k} value={k}>{k}</option>)}</select>
                  <button onClick={doApply} className="lux-btn" data-testid="campaign-apply"><Send className="w-4 h-4" /> Apply</button>
                </div>
              </div>
            )}
            {!c.is_owner && c.my_application && (
              <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid var(--lux-border)' }}>
                <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Your application: <span className="text-gold">{c.my_application.status}</span></div>
                {c.my_application.status === 'accepted' && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>Submit a deliverable</div>
                    <input value={dForm.title} onChange={(e) => setDForm({ ...dForm, title: e.target.value })} placeholder="Deliverable title" className="lux-input w-full" />
                    <input value={dForm.url} onChange={(e) => setDForm({ ...dForm, url: e.target.value })} placeholder="Link (Drive / gallery / reel)" className="lux-input w-full" />
                    <button onClick={submitDlv} className="lux-btn" data-testid="deliverable-submit"><Upload className="w-4 h-4" /> Submit deliverable</button>
                    {(dlv || []).map((d) => <div key={d.id} className="text-xs flex items-center gap-2" style={{ color: 'var(--lux-text-muted)' }}><FileText className="w-3 h-3" /> {d.title} — <span className="text-gold">{d.status}</span>{d.review_note ? ` · ${d.review_note}` : ''}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* Owner: manage */}
            {c.is_owner && (
              <div className="mt-4 pt-4 space-y-4" style={{ borderTop: '1px solid var(--lux-border)' }}>
                {report && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[['Applications', report.applications_total], ['Accepted', report.accepted], ['Approved deliv.', report.approved_deliverables], ['Deliverables', report.deliverables_total], ['Payments', report.payments_count], ['Paid (₹)', inr(report.payments_total_inr)]].map(([l, v]) => (
                      <div key={l} className="lux-glass p-2"><div className="text-lg font-display text-gold">{v}</div><div className="text-[10px]" style={{ color: 'var(--lux-text-muted)' }}>{l}</div></div>
                    ))}
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--lux-text-muted)' }}>Applicants</div>
                  {(apps || []).length === 0 ? <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>No applicants yet.</div> : (apps || []).map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 py-1.5 flex-wrap">
                      <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{a.creator_name}{a.creator_verified > 0 && <BadgeCheck className="w-3 h-3 inline ml-1" style={{ color: '#E8C97A' }} />} <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>· {a.quote_currency} {Number(a.quote_amount || 0).toLocaleString()} · {a.status}</span></div>
                      {a.status === 'pending' && (
                        <div className="flex gap-1">
                          <button onClick={() => decide(a.id, 'accepted')} className="lux-btn text-xs">Accept</button>
                          <button onClick={() => decide(a.id, 'rejected')} className="lux-btn lux-btn-ghost text-xs">Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {(dlv || []).length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--lux-text-muted)' }}>Deliverables</div>
                    {(dlv || []).map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 py-1.5 flex-wrap">
                        <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{d.title} <span className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>· {d.creator_name} · {d.status}</span>{d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-gold ml-1">view</a>}</div>
                        {d.status === 'submitted' && (
                          <div className="flex gap-1">
                            <button onClick={() => reviewDlv(d.id, 'approved')} className="lux-btn text-xs">Approve</button>
                            <button onClick={() => reviewDlv(d.id, 'revision')} className="lux-btn lux-btn-ghost text-xs">Revision</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {accepted.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>Record a payment <span className="opacity-60">(ledger only — no funds move)</span></div>
                    <div className="flex gap-2 flex-wrap">
                      <select value={pForm.application_id} onChange={(e) => setPForm({ ...pForm, application_id: e.target.value })} className="lux-input flex-1"><option value="">Choose creator…</option>{accepted.map((a) => <option key={a.id} value={a.id}>{a.creator_name}</option>)}</select>
                      <input value={pForm.amount} onChange={(e) => setPForm({ ...pForm, amount: e.target.value })} type="number" placeholder="Amount" className="lux-input w-28" />
                      <select value={pForm.currency} onChange={(e) => setPForm({ ...pForm, currency: e.target.value })} className="lux-input">{['INR', 'USD', 'EUR', 'GBP', 'AED'].map((k) => <option key={k} value={k}>{k}</option>)}</select>
                      <button onClick={recordPay} className="lux-btn"><DollarSign className="w-4 h-4" /> Record</button>
                    </div>
                  </div>
                )}
                {c.status === 'open' && <button onClick={async () => { await axios.post(`${API_URL}/api/pixora/campaigns/${id}/close`, {}, { headers: authHeaders() }); load(); }} className="lux-btn lux-btn-ghost text-xs">Close campaign</button>}
              </div>
            )}
            {msg && <div className="text-xs mt-3 text-gold">{msg}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function Events() {
  const [events, setEvents] = useState(null);
  const [facets, setFacets] = useState({ countries: [], regions: [], kinds: [] });
  const [filt, setFilt] = useState({ country: '', region: '', kind: '', scope: 'upcoming', virtual: '', q: '' });
  const [form, setForm] = useState({ title: '', kind: 'workshop', date: '', location: '', description: '', country: '', region: '', city: '', timezone: '', is_virtual: false, join_url: '', capacity: 0 });
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => {
    const p = new URLSearchParams(Object.entries(filt).filter(([, v]) => v)).toString();
    return axios.get(`${API_URL}/api/pixora/events?${p}`, { headers: authHeaders() })
      .then(({ data }) => { setEvents(data.events || []); setFacets(data.facets || { countries: [], regions: [], kinds: [] }); })
      .catch(() => setEvents([]));
  }, [filt]);
  useEffect(() => { load(); }, [load]);
  const create = async () => { if (!form.title.trim()) return; await axios.post(`${API_URL}/api/pixora/events`, { ...form, capacity: Number(form.capacity) || 0 }, { headers: authHeaders() }); setForm({ title: '', kind: 'workshop', date: '', location: '', description: '', country: '', region: '', city: '', timezone: '', is_virtual: false, join_url: '', capacity: 0 }); setCreating(false); load(); };
  const rsvp = async (id) => { try { await axios.post(`${API_URL}/api/pixora/events/${id}/rsvp`, {}, { headers: authHeaders() }); load(); } catch (e) { alert(e?.response?.data?.detail || 'Could not RSVP'); } };
  if (events === null) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={() => setCreating((v) => !v)} className="lux-btn" data-testid="pixora-event-new"><Plus className="w-4 h-4" /> Host an event</button>
        <input value={filt.q} onChange={(e) => setFilt({ ...filt, q: e.target.value })} placeholder="Search events…" className="lux-input text-sm flex-1 min-w-[160px]" />
        <select value={filt.scope} onChange={(e) => setFilt({ ...filt, scope: e.target.value })} className="lux-input text-sm">
          <option value="upcoming">Upcoming</option><option value="past">Past</option><option value="">All dates</option>
        </select>
        <select value={filt.country} onChange={(e) => setFilt({ ...filt, country: e.target.value })} className="lux-input text-sm"><option value="">All countries</option>{facets.countries.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filt.region} onChange={(e) => setFilt({ ...filt, region: e.target.value })} className="lux-input text-sm"><option value="">All regions</option>{facets.regions.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={filt.virtual} onChange={(e) => setFilt({ ...filt, virtual: e.target.value })} className="lux-input text-sm"><option value="">Any format</option><option value="1">Virtual</option><option value="0">In-person</option></select>
      </div>
      {creating && (
        <div className="lux-glass p-4 space-y-2">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Event title" className="lux-input w-full" data-testid="pixora-event-title" />
          <div className="flex gap-2 flex-wrap">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="lux-input flex-1">
              {['workshop', 'meetup', 'webinar', 'contest'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} type="date" className="lux-input flex-1" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="Country" className="lux-input flex-1" />
            <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="Region (e.g. South Asia)" className="lux-input flex-1" />
            <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" className="lux-input flex-1" />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Timezone (e.g. Asia/Kolkata)" className="lux-input flex-1" />
            <input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} type="number" placeholder="Capacity (0 = unlimited)" className="lux-input flex-1" />
            <label className="text-xs flex items-center gap-1.5" style={{ color: 'var(--lux-text-muted)' }}><input type="checkbox" checked={form.is_virtual} onChange={(e) => setForm({ ...form, is_virtual: e.target.checked })} /> Virtual</label>
          </div>
          <input value={form.is_virtual ? form.join_url : form.location} onChange={(e) => setForm(form.is_virtual ? { ...form, join_url: e.target.value } : { ...form, location: e.target.value })} placeholder={form.is_virtual ? 'Join link' : 'Venue / location'} className="lux-input w-full" />
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Details" rows={2} className="lux-input w-full" />
          <button onClick={create} className="lux-btn" data-testid="pixora-event-create">Publish event</button>
        </div>
      )}
      {events.length === 0 ? <Empty label="No events match your filters." /> : events.map((ev) => (
        <div key={ev.id} className="lux-glass p-5" data-testid={`pixora-event-${ev.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap"><span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{ev.kind}</span>{ev.is_virtual && <span className="text-[10px] uppercase px-2 py-0.5 rounded-full" style={{ background: 'rgba(62,207,142,0.15)', color: '#3ECf8E' }}>Virtual</span>}<span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{ev.title}</span></div>
              <div className="text-xs flex items-center gap-2 mt-1 flex-wrap" style={{ color: 'var(--lux-text-muted)' }}>
                {ev.date && <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {ev.date}{ev.timezone ? ` · ${ev.timezone}` : ''}</span>}
                {(ev.city || ev.country) && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {[ev.city, ev.country].filter(Boolean).join(', ')}</span>}
                {!ev.city && !ev.country && ev.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.location}</span>}
                <span>by {ev.host}</span>
              </div>
            </div>
            <button onClick={() => rsvp(ev.id)} disabled={ev.is_full && !ev.rsvped} className={`text-xs shrink-0 ${ev.rsvped ? 'lux-btn' : 'lux-btn lux-btn-ghost'}`} data-testid={`pixora-rsvp-${ev.id}`}>{ev.rsvped ? <><Check className="w-3.5 h-3.5" /> Going</> : (ev.is_full ? 'Full' : 'RSVP')} ({ev.rsvp_count}{ev.capacity ? `/${ev.capacity}` : ''})</button>
          </div>
          {ev.description && <p className="text-sm mt-2" style={{ color: 'var(--lux-text-muted)' }}>{ev.description}</p>}
        </div>
      ))}
    </div>
  );
}

function Learn() {
  const [content, setContent] = useState(null);
  const load = useCallback(() => axios.get(`${API_URL}/api/pixora/learn`, { headers: authHeaders() }).then(({ data }) => setContent(data.content || [])).catch(() => setContent([])), []);
  useEffect(() => { load(); }, [load]);
  const complete = async (id) => { await axios.post(`${API_URL}/api/pixora/learn/${id}/complete`, {}, { headers: authHeaders() }); load(); };
  if (content === null) return <Spinner />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {content.map((c) => (
        <div key={c.id} className="lux-glass p-5" data-testid={`pixora-learn-${c.id}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: 'rgba(212,175,55,0.12)', color: '#E8C97A' }}>{c.kind} · {c.level}</span>
            {c.cert && <span className="text-[10px] flex items-center gap-1 text-gold"><GraduationCap className="w-3 h-3" /> Cert</span>}
          </div>
          <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{c.title}</div>
          <div className="text-xs mb-2" style={{ color: 'var(--lux-text-muted)' }}>{c.minutes} min</div>
          <p className="text-sm mb-3" style={{ color: 'var(--lux-text-muted)' }}>{c.summary}</p>
          <button onClick={() => complete(c.id)} disabled={c.completed} className={`text-xs ${c.completed ? 'lux-btn lux-btn-ghost' : 'lux-btn'}`} data-testid={`pixora-complete-${c.id}`}>
            {c.completed ? <><Check className="w-3.5 h-3.5" /> Completed</> : 'Mark complete'}
          </button>
        </div>
      ))}
    </div>
  );
}

function FinanceTracker() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ kind: 'income', category: '', amount_inr: '', note: '', date: '' });
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/finance`, { headers: authHeaders() }); setData(data); }
    catch (e) { setData({ entries: [], summary: { income: 0, expense: 0, profit: 0 } }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!Number(form.amount_inr)) return;
    try { await axios.post(`${API_URL}/api/pixora/finance`, { ...form, amount_inr: Number(form.amount_inr) }, { headers: authHeaders() }); setForm({ ...form, category: '', amount_inr: '', note: '' }); load(); }
    catch (e) { alert('Could not add'); }
  };
  const del = async (id) => { try { await axios.delete(`${API_URL}/api/pixora/finance/${id}`, { headers: authHeaders() }); load(); } catch (e) { /* */ } };
  if (data === null) return null;
  const s = data.summary || {};
  return (
    <div data-testid="finance-tracker">
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Expense &amp; revenue tracker</h3>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="Income" value={inr(s.income || 0)} />
        <Stat label="Expenses" value={inr(s.expense || 0)} />
        <Stat label="Profit" value={inr(s.profit || 0)} />
      </div>
      <div className="lux-glass p-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="lux-input"><option value="income">Income</option><option value="expense">Expense</option></select>
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (Booking, Gear…)" className="lux-input flex-1" />
          <input value={form.amount_inr} onChange={(e) => setForm({ ...form, amount_inr: e.target.value })} type="number" placeholder="₹" className="lux-input w-28" />
          <input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} type="date" className="lux-input" />
          <button onClick={add} className="lux-btn text-xs" data-testid="finance-add"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {(data.entries || []).map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm" data-testid={`finance-${e.id}`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: e.kind === 'income' ? '#3ECf8E' : '#ff8a8a' }} />
              <span className="flex-1" style={{ color: 'var(--lux-text-muted)' }}>{e.category || e.kind} · {e.date}{e.note ? ` · ${e.note}` : ''}</span>
              <span style={{ color: e.kind === 'income' ? '#3ECf8E' : '#ff8a8a' }}>{e.kind === 'expense' ? '−' : '+'}{inr(e.amount_inr)}</span>
              <button onClick={() => del(e.id)} className="hover:text-red-400" style={{ color: 'var(--lux-text-faint)' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PricingIntel() {
  const [d, setD] = useState(null);
  useEffect(() => { axios.get(`${API_URL}/api/pixora/pricing-intelligence`, { headers: authHeaders() }).then(({ data }) => setD(data)).catch(() => setD(false)); }, []);
  if (!d) return null;
  return (
    <div data-testid="pricing-intel">
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>AI pricing intelligence</h3>
      <div className="lux-glass p-4">
        <div className="font-display text-2xl text-gold">{inr(d.suggested_min)} – {inr(d.suggested_max)}</div>
        <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>Suggested starting package band{d.peers ? ` · ${d.peers} local peers (avg ${inr(d.peer_avg)})` : ''}</div>
        <p className="text-xs mt-2" style={{ color: 'var(--lux-text-faint)' }}>{d.reasoning}</p>
      </div>
    </div>
  );
}

function CareerEngine() {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const { data } = await axios.get(`${API_URL}/api/pixora/career`, { headers: authHeaders() }); setR(data.report || false); } catch (e) { setR(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const gen = async () => { setBusy(true); try { const { data } = await axios.post(`${API_URL}/api/pixora/career/generate`, {}, { headers: authHeaders() }); setR(data.report); } catch (e) { alert('Failed'); } setBusy(false); };
  const fb = r?.fallback || {};
  return (
    <div data-testid="career-engine">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>AI career growth engine</h3>
        <button onClick={gen} disabled={busy} className="lux-btn text-xs">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {r ? 'Refresh' : 'Generate'}</button>
      </div>
      {r ? (
        <div className="lux-glass p-4 space-y-3">
          <div className="text-sm" style={{ color: '#E8C97A' }}>Stage: {r.stage}</div>
          {r.ai_summary && <p className="text-sm whitespace-pre-line" style={{ color: 'var(--lux-text)' }}>{r.ai_summary}</p>}
          {[['Skills', fb.skills], ['Career', fb.career], ['Business', fb.business]].map(([label, arr]) => (arr || []).length > 0 && (
            <div key={label}><div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--lux-text-faint)' }}>{label}</div>
              <ul className="mt-1 space-y-0.5">{arr.map((x, i) => <li key={i} className="text-xs flex gap-1.5" style={{ color: 'var(--lux-text-muted)' }}><Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#E8C97A' }} />{x}</li>)}</ul>
            </div>
          ))}
        </div>
      ) : <Empty label="Generate your personalized career roadmap." />}
    </div>
  );
}

function WeddingBI() {
  const [d, setD] = useState(null);
  useEffect(() => { axios.get(`${API_URL}/api/pixora/wedding-bi`, { headers: authHeaders() }).then(({ data }) => setD(data)).catch(() => setD(false)); }, []);
  if (!d) return null;
  if (!d.total_bookings) return null;   // only show once the vendor has bookings
  return (
    <div data-testid="wedding-bi">
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Wedding business intelligence</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
        <Stat label="Bookings" value={d.total_bookings} />
        <Stat label="Won" value={d.won} />
        <Stat label="Revenue" value={inr(d.revenue)} />
        <Stat label="Avg deal" value={inr(d.avg_deal)} />
        <Stat label="Conversion" value={`${d.conversion_pct}%`} />
      </div>
      {(d.monthly || []).length >= 2 && <div className="lux-glass p-3"><TrendChart points={d.monthly.map((m) => ({ v: m.count }))} /></div>}
    </div>
  );
}

function StudioAnalytics() {
  const [d, setD] = useState(null);
  useEffect(() => { axios.get(`${API_URL}/api/pixora/analytics`, { headers: authHeaders() }).then(({ data }) => setD(data)).catch(() => setD(false)); }, []);
  if (!d) return null;
  return (
    <div data-testid="studio-analytics">
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Profile analytics</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
        <Stat label="Portfolio views" value={d.portfolio_views || 0} />
        <Stat label="Followers" value={d.followers || 0} />
        <Stat label="Posts" value={d.posts || 0} />
        <Stat label="Community score" value={d.community_score || 0} />
      </div>
      {(d.by_day || []).length >= 2 ? (
        <div className="lux-glass p-3"><TrendChart points={d.by_day.map((x) => ({ v: x.views }))} /></div>
      ) : <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>Views chart appears once your public portfolio gets visits.</div>}
    </div>
  );
}

function RevenueCenter() {
  const [d, setD] = useState(null);
  useEffect(() => { axios.get(`${API_URL}/api/pixora/revenue`, { headers: authHeaders() }).then(({ data }) => setD(data)).catch(() => setD(false)); }, []);
  if (!d) return null;
  return (
    <div data-testid="revenue-center">
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Creator revenue center</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(d.sources || []).map((s) => <Stat key={s.label} label={s.label} value={inr(s.value)} />)}
        <Stat label="Profit" value={inr(d.profit || 0)} />
      </div>
      <div className="text-[11px] mt-2" style={{ color: 'var(--lux-text-faint)' }}>Rolls up your tracked income, completed bookings and pipeline. Tracking only — payouts happen via your payment provider.</div>
    </div>
  );
}

const PKG_TIERS = ['starter', 'premium', 'luxury', 'custom'];
function Packages() {
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState({ name: '', tier: 'starter', price_inr: '', includes: '', description: '' });
  const [ccy, setCcy] = useState('INR');
  const [cur, setCur] = useState(null);   // { rates, symbols, currencies }
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/packages`, { headers: authHeaders() }); setRows(data.packages || []); }
    catch (e) { setRows([]); }
  }, []);
  useEffect(() => { load(); axios.get(`${API_URL}/api/currency/rates`).then(({ data }) => setCur(data)).catch(() => {}); }, [load]);
  const price = (amtInr) => {
    if (!cur || ccy === 'INR') return inr(amtInr);
    const rate = cur.rates?.[ccy] || 0;
    const sym = cur.symbols?.[ccy] || '';
    return `${sym}${(amtInr * rate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };
  const add = async () => {
    if (!form.name.trim()) return;
    try { await axios.post(`${API_URL}/api/pixora/packages`, { ...form, price_inr: Number(form.price_inr) || 0, includes: form.includes.split(',').map((s) => s.trim()).filter(Boolean) }, { headers: authHeaders() }); setForm({ name: '', tier: 'starter', price_inr: '', includes: '', description: '' }); load(); }
    catch (e) { alert('Could not add'); }
  };
  const del = async (id) => { try { await axios.delete(`${API_URL}/api/pixora/packages/${id}`, { headers: authHeaders() }); load(); } catch (e) { /* */ } };
  if (rows === null) return null;
  return (
    <div data-testid="packages">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Your packages</h3>
        {cur && (
          <select value={ccy} onChange={(e) => setCcy(e.target.value)} className="lux-input text-xs" data-testid="package-currency">
            {(cur.currencies || ['INR']).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>
      <div className="lux-glass p-4 space-y-2 mb-3">
        <div className="flex flex-wrap gap-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Package name" className="lux-input flex-1" />
          <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} className="lux-input capitalize">{PKG_TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <input value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: e.target.value })} type="number" placeholder="Price ₹" className="lux-input w-28" />
        </div>
        <input value={form.includes} onChange={(e) => setForm({ ...form, includes: e.target.value })} placeholder="Includes (comma-separated: 8h coverage, album, teaser)" className="lux-input w-full" />
        <div className="flex gap-2">
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description" className="lux-input flex-1" />
          <button onClick={add} className="lux-btn text-xs" data-testid="package-add"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {rows.map((p) => (
          <div key={p.id} className="lux-glass p-4" data-testid={`package-${p.id}`}>
            <div className="flex items-center justify-between">
              <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{p.name}</span>
              <button onClick={() => del(p.id)} className="hover:text-red-400" style={{ color: 'var(--lux-text-faint)' }}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            <div className="text-xs capitalize" style={{ color: '#E8C97A' }}>{p.tier} · {price(p.price_inr)}</div>
            {p.description && <p className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }}>{p.description}</p>}
            {(p.includes || []).length > 0 && <ul className="mt-2 space-y-0.5">{p.includes.map((x, i) => <li key={i} className="text-[11px] flex gap-1" style={{ color: 'var(--lux-text-muted)' }}><Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: '#E8C97A' }} />{x}</li>)}</ul>}
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetPlanner() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ event_name: '', category: '', allocated_inr: '', spent_inr: '', note: '' });
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/budget`, { headers: authHeaders() }); setData(data); }
    catch (e) { setData({ items: [], summary: {} }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!form.category.trim() && !form.event_name.trim()) return;
    try { await axios.post(`${API_URL}/api/pixora/budget/items`, { ...form, allocated_inr: Number(form.allocated_inr) || 0, spent_inr: Number(form.spent_inr) || 0 }, { headers: authHeaders() }); setForm({ event_name: form.event_name, category: '', allocated_inr: '', spent_inr: '', note: '' }); load(); }
    catch (e) { alert('Could not add'); }
  };
  const del = async (id) => { try { await axios.delete(`${API_URL}/api/pixora/budget/items/${id}`, { headers: authHeaders() }); load(); } catch (e) { /* */ } };
  if (data === null) return null;
  const s = data.summary || {};
  return (
    <div data-testid="budget-planner">
      <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Wedding budget planner</h3>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Stat label="Allocated" value={inr(s.allocated || 0)} />
        <Stat label="Spent" value={inr(s.spent || 0)} />
        <Stat label="Remaining" value={inr(s.remaining || 0)} />
      </div>
      <div className="lux-glass p-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          <input value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} placeholder="Event (optional)" className="lux-input w-36" />
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category (Venue, Catering…)" className="lux-input flex-1" />
          <input value={form.allocated_inr} onChange={(e) => setForm({ ...form, allocated_inr: e.target.value })} type="number" placeholder="Allocated ₹" className="lux-input w-28" />
          <input value={form.spent_inr} onChange={(e) => setForm({ ...form, spent_inr: e.target.value })} type="number" placeholder="Spent ₹" className="lux-input w-28" />
          <button onClick={add} className="lux-btn text-xs" data-testid="budget-add"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {(data.items || []).map((it) => {
            const pct = it.allocated_inr ? Math.min(100, (it.spent_inr / it.allocated_inr) * 100) : 0;
            const over = it.spent_inr > it.allocated_inr && it.allocated_inr > 0;
            return (
              <div key={it.id} data-testid={`budget-${it.id}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1" style={{ color: 'var(--lux-text-muted)' }}>{it.category || 'Item'}{it.event_name ? ` · ${it.event_name}` : ''}</span>
                  <span style={{ color: over ? '#ff8a8a' : 'var(--lux-text)' }}>{inr(it.spent_inr)} / {inr(it.allocated_inr)}</span>
                  <button onClick={() => del(it.id)} className="hover:text-red-400" style={{ color: 'var(--lux-text-faint)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'var(--lux-panel)' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: over ? '#ff6b6b' : 'linear-gradient(90deg,#E8C97A,#D4AF37)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Chapters() {
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => {
    try { const { data } = await axios.get(`${API_URL}/api/pixora/chapters`, { headers: authHeaders() }); setRows(data.chapters || []); }
    catch (e) { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (ch) => { try { await axios.post(`${API_URL}/api/pixora/chapters/${encodeURIComponent(ch)}/join`, {}, { headers: authHeaders() }); load(); } catch (e) { /* */ } };
  if (rows === null) return null;
  return (
    <div data-testid="chapters">
      <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--lux-text-muted)' }}>Regional chapters</div>
      <div className="flex flex-wrap gap-2">
        {rows.map((c) => (
          <button key={c.chapter} onClick={() => toggle(c.chapter)} className="px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5"
            style={{ border: `1px solid ${c.joined ? 'var(--lux-gold)' : 'var(--lux-border)'}`, background: c.joined ? 'rgba(212,175,55,0.12)' : 'transparent', color: c.joined ? '#E8C97A' : 'var(--lux-text-muted)' }} data-testid={`chapter-${c.chapter}`}>
            <MapPin className="w-3 h-3" /> {c.chapter} · {c.members}{c.joined ? ' ✓' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

// Tiny dependency-free SVG line chart for growth trends.
function TrendChart({ points, color = '#E8C97A', height = 90 }) {
  if (!points || points.length < 2) return <div className="text-[11px]" style={{ color: 'var(--lux-text-faint)' }}>Not enough history yet — visit daily to build your trend.</div>;
  const W = 320, H = height, pad = 6;
  const ys = points.map((p) => p.v);
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const step = (W - pad * 2) / (points.length - 1);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${H - pad - ((p.v - min) / span) * (H - pad * 2)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" data-testid="trend-chart">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Grow() {
  const [ins, setIns] = useState(null);
  const [hist, setHist] = useState(null);
  const [quote, setQuote] = useState({ client_name: '', event: '', lines: [{ label: 'Photography', amount_inr: '' }] });
  const [result, setResult] = useState(null);
  useEffect(() => {
    axios.get(`${API_URL}/api/pixora/insights`, { headers: authHeaders() }).then(({ data }) => setIns(data)).catch(() => setIns(false));
    axios.get(`${API_URL}/api/pixora/score-history`, { headers: authHeaders() }).then(({ data }) => setHist(data)).catch(() => setHist(false));
  }, []);
  const setLine = (i, k, v) => setQuote((q) => ({ ...q, lines: q.lines.map((l, j) => j === i ? { ...l, [k]: v } : l) }));
  const addLine = () => setQuote((q) => ({ ...q, lines: [...q.lines, { label: '', amount_inr: '' }] }));
  const gen = async () => {
    const lines = quote.lines.filter((l) => l.label).map((l) => ({ label: l.label, amount_inr: Number(l.amount_inr) || 0 }));
    const { data } = await axios.post(`${API_URL}/api/pixora/business/quote`, { ...quote, lines }, { headers: authHeaders() });
    setResult(data.quote);
  };
  if (ins === null) return <Spinner />;
  return (
    <div className="space-y-6">
      {/* C5 — deep content analytics (views/likes/saves/shares per post, tag reach,
          follower growth, best time to post). Full dashboard on its own page. */}
      <a href="/studio/pixora-analytics" className="lux-glass flex items-center justify-between p-4 no-underline"
        style={{ border: '1px solid rgba(212,175,55,0.3)' }} data-testid="pixora-content-analytics-link">
        <div>
          <div className="font-display text-base" style={{ color: 'var(--lux-text)' }}>Content analytics →</div>
          <div className="text-[12px]" style={{ color: 'var(--lux-text-muted)' }}>
            See how each post &amp; reel performs — reach, saves, shares, tag reach, follower growth and your best time to post.
          </div>
        </div>
        <span className="font-display text-2xl text-gold">↗</span>
      </a>

      {ins && ins.growth && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Reputation" value={ins.reputation} sub={ins.tier} />
            <Stat label="Followers" value={ins.engagement.followers} />
            <Stat label="Leaderboard" value={ins.growth.leaderboard_rank ? `#${ins.growth.leaderboard_rank}` : '—'} />
            <Stat label="Certifications" value={ins.growth.certifications} />
            <Stat label="Posts" value={ins.engagement.posts} />
            <Stat label="Likes" value={ins.engagement.likes_received} />
            <Stat label="Portfolio works" value={ins.portfolio.works} />
            <Stat label="Achievements" value={ins.growth.achievements} />
          </div>
        </>
      )}

      {/* Growth trend — community score over time */}
      {hist && (
        <div className="lux-glass p-4" data-testid="growth-trend">
          <div className="flex items-center justify-between mb-2">
            <div className="lux-eyebrow">◆ Community score trend</div>
            <div className="font-display text-xl text-gold">{hist.current?.score ?? 0}</div>
          </div>
          <TrendChart points={(hist.history || []).map((h) => ({ v: h.score }))} />
          <div className="text-[11px] mt-1" style={{ color: 'var(--lux-text-faint)' }}>
            {(hist.history || []).length} day{(hist.history || []).length === 1 ? '' : 's'} tracked · grows as you complete your profile, publish, post, gain followers and visit daily.
          </div>
        </div>
      )}
      <div>
        <h3 className="font-display text-lg mb-2" style={{ color: 'var(--lux-text)' }}>Quote / invoice generator</h3>
        <div className="lux-glass p-4 space-y-2">
          <div className="flex gap-2">
            <input value={quote.client_name} onChange={(e) => setQuote({ ...quote, client_name: e.target.value })} placeholder="Client name" className="lux-input flex-1" data-testid="pixora-quote-client" />
            <input value={quote.event} onChange={(e) => setQuote({ ...quote, event: e.target.value })} placeholder="Event" className="lux-input flex-1" />
          </div>
          {quote.lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <input value={l.label} onChange={(e) => setLine(i, 'label', e.target.value)} placeholder="Line item" className="lux-input flex-1" />
              <input value={l.amount_inr} onChange={(e) => setLine(i, 'amount_inr', e.target.value)} placeholder="₹" type="number" className="lux-input w-28" />
            </div>
          ))}
          <div className="flex gap-2">
            <button onClick={addLine} className="lux-btn lux-btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Line</button>
            <button onClick={gen} className="lux-btn text-xs" data-testid="pixora-quote-gen"><FileText className="w-3.5 h-3.5" /> Generate</button>
          </div>
          {result && (
            <div className="mt-2 pt-2 text-sm" style={{ borderTop: '1px solid var(--lux-border)', color: 'var(--lux-text)' }} data-testid="pixora-quote-result">
              <div className="text-xs mb-1" style={{ color: 'var(--lux-text-muted)' }}>Quote {result.id} · {result.studio_name}</div>
              {result.lines.map((l, i) => <div key={i} className="flex justify-between"><span>{l.label}</span><span>{inr(l.amount_inr)}</span></div>)}
              <div className="flex justify-between mt-1" style={{ color: 'var(--lux-text-muted)' }}><span>GST 18%</span><span>{inr(result.gst_inr)}</span></div>
              <div className="flex justify-between font-display text-gold text-lg"><span>Total</span><span>{inr(result.total_inr)}</span></div>
            </div>
          )}
        </div>
      </div>
      <StudioAnalytics />
      <WeddingBI />
      <PricingIntel />
      <CareerEngine />
      <RevenueCenter />
      <FinanceTracker />
      <BudgetPlanner />
      <Packages />
    </div>
  );
}

function Perks() {
  const [benefits, setBenefits] = useState(null);
  useEffect(() => { axios.get(`${API_URL}/api/pixora/benefits`).then(({ data }) => setBenefits(data.benefits || [])); }, []);
  if (benefits === null) return <Spinner />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {benefits.map((b, i) => (
        <div key={i} className="lux-glass p-5" data-testid={`pixora-perk-${i}`}>
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4" style={{ color: '#E8C97A' }} />
            <span className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{b.title}</span>
            <span className="text-[10px] uppercase px-2 py-0.5 rounded-full ml-auto" style={{ background: b.tier === 'Premium' ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'rgba(255,255,255,0.08)', color: b.tier === 'Premium' ? '#0E0A06' : 'var(--lux-text-muted)' }}>{b.tier}</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>{b.desc}</p>
        </div>
      ))}
    </div>
  );
}

const Stat = ({ label, value, sub }) => (
  <div className="lux-glass p-4 text-center">
    <div className="font-display text-2xl text-gold">{value}</div>
    <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
    {sub && <div className="text-[11px]" style={{ color: '#E8C97A' }}>{sub}</div>}
  </div>
);

const Spinner = () => <div className="flex items-center gap-2 py-8" style={{ color: 'var(--lux-text)' }}><Loader2 className="w-5 h-5 animate-spin" /> Loading…</div>;
const Empty = ({ label }) => <div className="lux-glass p-10 text-center" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>;
