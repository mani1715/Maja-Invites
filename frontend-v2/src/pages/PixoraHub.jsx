import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '@/api/pixora';
import StudioModule from '@/components/StudioModule';
import { useCheckin, Loading } from '@/components/pixora/PixoraShell';
import '@/components/pixora/pixora.css';

// ponytail: each panel group already lives in its own file (HomePanels.jsx,
// StudioPanels.jsx, ...) — lazy() per named export still chunks per source
// file, so a visitor only downloads the active group's file, no need to
// split the files themselves any further.
const lazyNamed = (importer, name) => lazy(() => importer().then((m) => ({ default: m[name] })));

const Overview = lazyNamed(() => import('@/components/pixora/HomePanels'), 'Overview');
const Notifications = lazyNamed(() => import('@/components/pixora/HomePanels'), 'Notifications');
const Network = lazyNamed(() => import('@/components/pixora/HomePanels'), 'Network');
const Creators = lazyNamed(() => import('@/components/pixora/HomePanels'), 'Creators');
const CommunityEvents = lazyNamed(() => import('@/components/pixora/HomePanels'), 'CommunityEvents');

const Following = lazyNamed(() => import('@/components/pixora/SpotlightPanels'), 'Following');
const Discover = lazyNamed(() => import('@/components/pixora/SpotlightPanels'), 'Discover');
const Trending = lazyNamed(() => import('@/components/pixora/SpotlightPanels'), 'Trending');
const Saved = lazyNamed(() => import('@/components/pixora/SpotlightPanels'), 'Saved');
const ComposerLink = lazyNamed(() => import('@/components/pixora/SpotlightPanels'), 'ComposerLink');

const Highlights = lazy(() => import('@/components/pixora/HighlightsPanel'));
const SearchPanel = lazy(() => import('@/components/pixora/SearchPanel'));

const Hiring = lazyNamed(() => import('@/components/pixora/ConnectPanels'), 'Hiring');
const Mentors = lazyNamed(() => import('@/components/pixora/ConnectPanels'), 'Mentors');
const Vendors = lazyNamed(() => import('@/components/pixora/ConnectPanels'), 'Vendors');
const Teams = lazyNamed(() => import('@/components/pixora/ConnectPanels'), 'Teams');
const Collaborations = lazyNamed(() => import('@/components/pixora/ConnectPanels'), 'Collaborations');

const Crm = lazyNamed(() => import('@/components/pixora/StudioPanels'), 'Crm');
const AiReview = lazyNamed(() => import('@/components/pixora/StudioPanels'), 'AiReview');
const AiAssistant = lazyNamed(() => import('@/components/pixora/StudioPanels'), 'AiAssistant');
const Analytics = lazyNamed(() => import('@/components/pixora/StudioPanels'), 'Analytics');
const PricingIntelligence = lazyNamed(() => import('@/components/pixora/StudioPanels'), 'PricingIntelligence');
const ClientManagement = lazyNamed(() => import('@/components/pixora/StudioPanels'), 'ClientManagement');

const Challenges = lazyNamed(() => import('@/components/pixora/GrowthPanels'), 'Challenges');
const Awards = lazyNamed(() => import('@/components/pixora/GrowthPanels'), 'Awards');
const Verification = lazyNamed(() => import('@/components/pixora/GrowthPanels'), 'Verification');
const Certifications = lazyNamed(() => import('@/components/pixora/GrowthPanels'), 'Certifications');
const Leaderboards = lazyNamed(() => import('@/components/pixora/GrowthPanels'), 'Leaderboards');
const Perks = lazyNamed(() => import('@/components/pixora/GrowthPanels'), 'Perks');

const Marketplace = lazyNamed(() => import('@/components/pixora/MarketPanels'), 'Marketplace');
const Upgrades = lazyNamed(() => import('@/components/pixora/MarketPanels'), 'Upgrades');
const BrandDeals = lazyNamed(() => import('@/components/pixora/MarketPanels'), 'BrandDeals');
const Resources = lazyNamed(() => import('@/components/pixora/MarketPanels'), 'Resources');
const Presets = lazyNamed(() => import('@/components/pixora/MarketPanels'), 'Presets');
const Templates = lazyNamed(() => import('@/components/pixora/MarketPanels'), 'Templates');

const LearningHub = lazyNamed(() => import('@/components/pixora/LearnProfilePanels'), 'LearningHub');
const Guides = lazyNamed(() => import('@/components/pixora/LearnProfilePanels'), 'Guides');
const MyProfile = lazyNamed(() => import('@/components/pixora/LearnProfilePanels'), 'MyProfile');
const WhyUpgrade = lazyNamed(() => import('@/components/pixora/LearnProfilePanels'), 'WhyUpgrade');
const ProfilePortfolio = lazyNamed(() => import('@/components/pixora/LearnProfilePanels'), 'ProfilePortfolio');
const CommunitySettings = lazyNamed(() => import('@/components/pixora/LearnProfilePanels'), 'CommunitySettings');

// Pixora — the photographer community.
//
// The two-level information architecture below (8 groups, 46 panels) is taken
// verbatim from the legacy implementation. That grouping was itself a
// deliberate replacement for an unusable 22-tab strip, so re-deriving it would
// have thrown away a decision somebody already made correctly. The rendering,
// the data contracts and the states are new; the shape of the product is not.
//
// Group and panel are both in the URL (?g=&p=) so any panel is linkable,
// survives a refresh, and can be reached from elsewhere in the app.

const GROUPS = [
  {
    key: 'home',
    label: 'Home',
    items: [
      { key: 'overview', label: 'Overview', render: (ctx) => <Overview go={ctx.go} /> },
      { key: 'notifications', label: 'Notifications', render: (ctx) => <Notifications onSeen={ctx.clearUnread} /> },
      { key: 'network', label: 'Network', render: () => <Network /> },
      { key: 'creators', label: 'Creators', render: () => <Creators /> },
      { key: 'events', label: 'Events', render: () => <CommunityEvents /> },
      { key: 'search', label: 'Search', render: (ctx) => <SearchPanel go={ctx.go} /> },
    ],
  },
  {
    key: 'spotlight',
    label: 'Spotlight',
    items: [
      { key: 'feed', label: 'Post', render: () => <ComposerLink /> },
      { key: 'following', label: 'Following', render: () => <Following /> },
      { key: 'discover', label: 'Discover', render: () => <Discover /> },
      { key: 'trending', label: 'Trending', render: () => <Trending /> },
      { key: 'saved', label: 'Saved', render: () => <Saved /> },
      { key: 'highlights', label: 'Highlights', render: (ctx) => <Highlights myId={ctx.myId} /> },
    ],
  },
  {
    key: 'connect',
    label: 'Connect',
    items: [
      { key: 'hiring', label: 'Hiring', render: (ctx) => <Hiring myId={ctx.myId} /> },
      { key: 'mentors', label: 'Mentors', render: () => <Mentors /> },
      { key: 'vendors', label: 'Vendors', render: () => <Vendors /> },
      { key: 'teams', label: 'Teams', render: () => <Teams /> },
      { key: 'collaborations', label: 'Collaborations', render: () => <Collaborations /> },
    ],
  },
  {
    key: 'studio',
    label: 'Studio Tools',
    items: [
      { key: 'crm', label: 'CRM', render: () => <Crm /> },
      { key: 'ai_review', label: 'AI Review', render: () => <AiReview /> },
      { key: 'ai_assistant', label: 'AI Assistant', render: () => <AiAssistant /> },
      { key: 'analytics', label: 'Analytics', render: () => <Analytics /> },
      { key: 'pricing', label: 'Pricing Intelligence', render: () => <PricingIntelligence /> },
      { key: 'clients', label: 'Client Management', render: () => <ClientManagement /> },
    ],
  },
  {
    key: 'growth',
    label: 'Growth',
    items: [
      { key: 'challenges', label: 'Challenges', render: (ctx) => <Challenges myId={ctx.myId} /> },
      { key: 'awards', label: 'Awards', render: () => <Awards /> },
      { key: 'verification', label: 'Verification', render: () => <Verification /> },
      { key: 'certifications', label: 'Certifications', render: () => <Certifications /> },
      { key: 'leaderboards', label: 'Leaderboards', render: () => <Leaderboards /> },
      { key: 'perks', label: 'Perks', render: () => <Perks /> },
    ],
  },
  {
    key: 'marketplace',
    label: 'Marketplace',
    items: [
      { key: 'marketplace', label: 'Marketplace', render: () => <Marketplace /> },
      { key: 'upgrades', label: 'Upgrades', render: () => <Upgrades /> },
      { key: 'brand_deals', label: 'Brand Deals', render: (ctx) => <BrandDeals myId={ctx.myId} /> },
      { key: 'resources', label: 'Resources', render: () => <Resources /> },
      { key: 'presets', label: 'Presets', render: () => <Presets /> },
      { key: 'templates', label: 'Templates', render: () => <Templates /> },
    ],
  },
  {
    key: 'learning',
    label: 'Learning Hub',
    items: [
      { key: 'all', label: 'All', render: () => <LearningHub /> },
      { key: 'photography', label: 'Photography', render: () => <LearningHub category="photography" /> },
      { key: 'editing', label: 'Editing', render: () => <LearningHub category="editing" /> },
      { key: 'business', label: 'Business', render: () => <LearningHub category="business" /> },
      { key: 'marketing', label: 'Marketing', render: () => <LearningHub category="marketing" /> },
      { key: 'ai_tools', label: 'AI Tools', render: () => <LearningHub category="ai_tools" /> },
      { key: 'gear', label: 'Gear Reviews', render: () => <LearningHub category="gear" /> },
      { key: 'guides', label: 'Guides', render: () => <Guides /> },
    ],
  },
  {
    key: 'profile',
    label: 'Profile',
    items: [
      { key: 'me', label: 'My Profile', render: () => <MyProfile /> },
      { key: 'why_upgrade', label: 'Why Upgrade', render: () => <WhyUpgrade /> },
      { key: 'portfolio', label: 'Portfolio', render: () => <ProfilePortfolio /> },
      { key: 'settings', label: 'Settings', render: () => <CommunitySettings /> },
    ],
  },
];

export default function PixoraHub() {
  const [params, setParams] = useSearchParams();
  const [unread, setUnread] = useState(0);
  const [myId, setMyId] = useState(null);

  // Records the once-a-day community-score visit. Fire and forget.
  useCheckin();

  useEffect(() => {
    let dead = false;
    api.me()
      .then((r) => { if (!dead) setMyId(r.data?.studio_id || null); })
      .catch(() => {});
    api.unreadCount()
      .then((r) => { if (!dead) setUnread(Number(r.data?.unread ?? r.data?.count ?? 0)); })
      .catch(() => {});
    return () => { dead = true; };
  }, []);

  const groupKey = params.get('g') || GROUPS[0].key;
  const group = useMemo(
    () => GROUPS.find((g) => g.key === groupKey) || GROUPS[0],
    [groupKey],
  );

  const panelKey = params.get('p') || group.items[0].key;
  const panel = useMemo(
    () => group.items.find((i) => i.key === panelKey) || group.items[0],
    [group, panelKey],
  );

  const go = useCallback((g, p) => {
    const next = GROUPS.find((x) => x.key === g) || GROUPS[0];
    setParams({ g: next.key, p: p || next.items[0].key });
  }, [setParams]);

  const ctx = useMemo(
    () => ({ go, myId, clearUnread: () => setUnread(0) }),
    [go, myId],
  );

  return (
    <StudioModule
      active="Pixora"
      title="Pixora"
      sub="Where MAJA studios post work, find gigs and second shooters, learn, and run the business side of photography."
    >
      <div className="pxc-root">
        <nav className="pxc-groups" aria-label="Community sections">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`pxc-group${g.key === group.key ? ' pxc-group--on' : ''}`}
              aria-current={g.key === group.key ? 'page' : undefined}
              onClick={() => go(g.key)}
            >
              {g.label}
              {g.key === 'home' && unread > 0 && (
                <span className="pxc-badge">{unread > 99 ? '99+' : unread}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="pxc-subs" role="tablist" aria-label={`${group.label} sections`}>
          {group.items.map((i) => (
            <button
              key={i.key}
              type="button"
              role="tab"
              aria-selected={i.key === panel.key}
              className={`pxc-sub${i.key === panel.key ? ' pxc-sub--on' : ''}`}
              onClick={() => go(group.key, i.key)}
            >
              {i.label}
            </button>
          ))}
        </div>

        {/* Keyed so switching panels remounts rather than reusing state. */}
        <Suspense fallback={<Loading />}>
          <div key={`${group.key}:${panel.key}`}>{panel.render(ctx)}</div>
        </Suspense>
      </div>
    </StudioModule>
  );
}
