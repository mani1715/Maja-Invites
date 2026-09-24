import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutGrid, Image as ImageIcon, CloudUpload, CalendarDays, ArrowLeft, Crown,
  Users, UserCircle, LogOut, MoreHorizontal, ChevronDown, Palette, Database,
  BarChart3, Sparkles, Tag, FileText, ShieldCheck, IndianRupee, MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * PanelTabs — primary Photographer Panel navigation (Part 7).
 * Shows on desktop sidebar-style strip + collapses to a scrollable row on
 * mobile. Used across every panel module page for consistent chrome + a
 * guaranteed in-panel back-to-dashboard link (never leaves the authed area).
 */
const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutGrid, to: '/studio/dashboard' },
  { key: 'portfolio', label: 'Portfolio', icon: ImageIcon,  to: '/studio/portfolio' },
  { key: 'backup',    label: 'Cloud Backup', icon: CloudUpload, to: '/studio/cloud-backup' },
  { key: 'calendar',  label: 'Occupancy Calendar', icon: CalendarDays, to: '/studio/calendar' },
  { key: 'community', label: 'Community', icon: Users, to: '/studio/community' },
  { key: 'earnings',  label: 'Earnings', icon: IndianRupee, to: '/studio/earnings' },
  { key: 'plans',     label: 'Plans', icon: Crown, to: '/studio/plans' },
];

// Secondary studio pages. These routes exist but had NO link anywhere in the
// panel, so a photographer could only reach them by typing the URL. They live
// behind a "More" menu so the primary strip stays lean while everything the
// panel can do is reachable from every panel page.
const MORE = [
  { key: 'designs',   label: 'Browse Designs',   icon: Palette,    to: '/studio/designs' },
  { key: 'storage',   label: 'Studio Storage',   icon: Database,   to: '/studio/studio-storage' },
  { key: 'themes',    label: 'Themes',           icon: Sparkles,   to: '/studio/themes' },
  { key: 'messages',  label: 'Messages',         icon: MessageSquare, to: '/studio/messages' },
  { key: 'insights',  label: 'My Insights',      icon: BarChart3,  to: '/studio/insights' },
  { key: 'analytics', label: 'Pixora Analytics', icon: BarChart3,  to: '/studio/pixora-analytics' },
  { key: 'white',     label: 'White-label',      icon: Tag,        to: '/studio/white-label' },
  { key: 'audit',     label: 'Audit Logs',       icon: FileText,   to: '/studio/audit-logs' },
  { key: 'clientwork', label: 'Client Workflow', icon: FileText,   to: '/studio/client-work' },
  { key: 'team',      label: 'Team & Staff',     icon: Users,      to: '/studio/staff' },
  { key: 'security',  label: 'Account Security', icon: ShieldCheck, to: '/studio/security' },
];

export default function PanelTabs({ active }) {
  const navigate = useNavigate();
  const location = useLocation();
  const current = active || location.pathname;
  const [moreOpen, setMoreOpen] = React.useState(false);
  // Account controls used to live ONLY in the dashboard header, so every other
  // panel page (portfolio, backup, calendar, ...) had no Profile/Logout. They
  // now sit in PanelTabs (which every panel page renders) so the whole nav —
  // every tab plus Profile + Logout — is visible on every page.
  const { logout } = useAuth();
  const onProfile = current.startsWith('/studio/photographer-profile');
  const onMore = MORE.some((m) => current === m.to || current.startsWith(m.to));
  const goMore = (to) => { setMoreOpen(false); navigate(to); };

  return (
    <div className="mb-8 flex items-center gap-3">
      {/* Left — the panel navigation options (scrollable on mobile) */}
      <div className="lux-glass px-3 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
        <button
          onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/studio/dashboard'); }}
          className="shrink-0 flex items-center justify-center gap-2 min-h-[44px] px-3 py-2 rounded-xl text-xs tracking-[0.12em] uppercase mr-1"
          style={{ color: 'var(--lux-text-muted)' }}
          data-testid="panel-back"
          title="Go back"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        {TABS.map((t) => {
          const on = current === t.to || (t.to !== '/studio/dashboard' && current.startsWith(t.to));
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => navigate(t.to)}
              className="relative shrink-0 flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl text-xs tracking-[0.12em] uppercase transition"
              style={{ color: on ? '#0E0A06' : 'var(--lux-text-muted)' }}
              data-testid={`panel-tab-${t.key}`}
            >
              {on && (
                <motion.span
                  layoutId="panel-tab-pill"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'linear-gradient(135deg,#E8C97A,#D4AF37)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="w-3.5 h-3.5 relative z-10" />
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* "More" — the secondary studio tools. Its own cluster (NOT inside the
          scrollable strip above, whose overflow-x-auto would clip the dropdown).
          Every panel page can now reach every studio tool. */}
      <div className="relative shrink-0">
        <button
          onClick={() => setMoreOpen((v) => !v)}
          aria-haspopup="true" aria-expanded={moreOpen}
          className="lux-glass flex items-center justify-center gap-2 min-h-[44px] px-3 md:px-4 py-2 rounded-xl text-xs tracking-[0.12em] uppercase"
          style={{ color: onMore ? '#0E0A06' : 'var(--lux-text-muted)',
                   background: onMore ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : undefined }}
          data-testid="panel-more"
          title="More studio tools"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">More</span>
          <ChevronDown className="w-3 h-3" />
        </button>
        {moreOpen && (
          <>
            {/* click-away backdrop */}
            <button
              aria-label="Close menu" tabIndex={-1}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-[60] cursor-default"
              style={{ background: 'transparent' }}
            />
            <div
              role="menu"
              className="absolute right-0 mt-2 z-[61] min-w-[13rem] py-1.5 rounded-2xl overflow-hidden"
              style={{ background: 'var(--lux-chrome)', border: '1px solid var(--lux-border)',
                       boxShadow: '0 18px 40px rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
              data-testid="panel-more-menu"
            >
              {MORE.map((m) => {
                const on = current === m.to || current.startsWith(m.to);
                const Icon = m.icon;
                return (
                  <button
                    key={m.key} role="menuitem"
                    onClick={() => goMore(m.to)}
                    className="w-full flex items-center gap-3 min-h-[44px] px-4 py-2 text-left text-xs tracking-[0.1em] uppercase transition"
                    style={{ color: on ? '#E8C97A' : 'var(--lux-text)' }}
                    data-testid={`panel-more-${m.key}`}
                  >
                    <Icon className="w-4 h-4 shrink-0" style={{ color: on ? '#E8C97A' : 'var(--lux-text-muted)' }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Right — account controls, pinned to the top-right, separate from the
          navigation options (owner request). Visible on every panel page. */}
      <div className="lux-glass px-2 py-2 flex items-center gap-1 shrink-0">
        <button
          onClick={() => navigate('/studio/photographer-profile')}
          className="shrink-0 flex items-center justify-center gap-2 min-h-[44px] px-3 md:px-4 py-2 rounded-xl text-xs tracking-[0.12em] uppercase transition"
          style={{ color: onProfile ? '#0E0A06' : 'var(--lux-text-muted)',
                   background: onProfile ? 'linear-gradient(135deg,#E8C97A,#D4AF37)' : 'transparent' }}
          data-testid="panel-tab-profile"
          title="My profile"
        >
          <UserCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Profile</span>
        </button>
        <button
          onClick={() => { logout(); navigate('/'); }}
          className="shrink-0 flex items-center justify-center gap-2 min-h-[44px] px-3 md:px-4 py-2 rounded-xl text-xs tracking-[0.12em] uppercase"
          style={{ color: 'var(--lux-text-muted)' }}
          data-testid="panel-logout"
          title="Log out"
        >
          <LogOut className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </div>
  );
}
