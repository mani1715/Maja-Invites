import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { RequireStudio, RequireSuperAdmin } from '@/components/RouteGuards';
import CookieConsent from '@/components/CookieConsent';

const Landing = lazy(() => import('@/pages/Landing'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const Features = lazy(() => import('@/pages/Features'));
const HowItWorks = lazy(() => import('@/pages/HowItWorks'));
const Faq = lazy(() => import('@/pages/Faq'));
const Contact = lazy(() => import('@/pages/Contact'));
const SignIn = lazy(() => import('@/pages/SignIn'));
const SignUp = lazy(() => import('@/pages/SignUp'));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const GuestInvitation = lazy(() => import('@/pages/GuestInvitation'));
const CeremonyInvitation = lazy(() => import('@/pages/CeremonyInvitation'));
const SaveTheDate = lazy(() => import('@/pages/SaveTheDate'));
const LiveGallery = lazy(() => import('@/pages/LiveGallery'));
const FaceMatchPage = lazy(() => import('@/pages/FaceMatchPage'));
const Cart = lazy(() => import('@/pages/Cart'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const OrderDetails = lazy(() => import('@/pages/OrderDetails'));
const StudioDashboard = lazy(() => import('@/pages/StudioDashboard'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const StudioProfileGallery = lazy(() => import('@/pages/StudioProfileGallery'));
const StudioWeddingDetail = lazy(() => import('@/pages/StudioWeddingDetail'));
const StudioWeddingWizard = lazy(() => import('@/pages/StudioWeddingWizard'));
const WeddingGuests = lazy(() => import('@/pages/WeddingGuests'));
const WeddingMessages = lazy(() => import('@/pages/WeddingMessages'));
const WeddingGifts = lazy(() => import('@/pages/WeddingGifts'));
const WeddingAnalytics = lazy(() => import('@/pages/WeddingAnalytics'));
const WeddingLiveGallery = lazy(() => import('@/pages/WeddingLiveGallery'));
const StudioProfileQrCodes = lazy(() => import('@/pages/StudioProfileQrCodes'));
const StudioPortfolio = lazy(() => import('@/pages/StudioPortfolio'));
const StudioPortfolioBuild = lazy(() => import('@/pages/StudioPortfolioBuild'));
const StudioPlans = lazy(() => import('@/pages/StudioPlans'));
const StudioDesigns = lazy(() => import('@/pages/StudioDesigns'));
const StudioOrders = lazy(() => import('@/pages/StudioOrders'));
const StudioSuiteCheckout = lazy(() => import('@/pages/StudioSuiteCheckout'));
const StudioCommunity = lazy(() => import('@/pages/StudioCommunity'));
const PixoraHub = lazy(() => import('@/pages/PixoraHub'));
const StudioEarnings = lazy(() => import('@/pages/StudioEarnings'));
const StudioInsights = lazy(() => import('@/pages/StudioInsights'));
const StudioStaff = lazy(() => import('@/pages/StudioStaff'));
const StudioSecurity = lazy(() => import('@/pages/StudioSecurity'));
const StudioAiTools = lazy(() => import('@/pages/StudioAiTools'));
const StudioBackup = lazy(() => import('@/pages/StudioBackup'));
const StudioDirectory = lazy(() => import('@/pages/StudioDirectory'));
const StudioAuditLogs = lazy(() => import('@/pages/StudioAuditLogs'));
const StudioWhiteLabel = lazy(() => import('@/pages/StudioWhiteLabel'));
const StudioCalendar = lazy(() => import('@/pages/StudioCalendar'));
const StudioStorage = lazy(() => import('@/pages/StudioStorage'));
const StudioInvitations = lazy(() => import('@/pages/StudioInvitations'));
const StudioClients = lazy(() => import('@/pages/StudioClients'));
const StudioNotifications = lazy(() => import('@/pages/StudioNotifications'));
const StudioMessages = lazy(() => import('@/pages/StudioMessages'));
const StudioClientWork = lazy(() => import('@/pages/StudioClientWork'));
const WeddingClient = lazy(() => import('@/pages/WeddingClient'));
const WeddingSetup = lazy(() => import('@/pages/WeddingSetup'));
const WeddingAlbum = lazy(() => import('@/pages/WeddingAlbum'));
const BrowseDesigns = lazy(() => import('@/pages/BrowseDesigns'));
const DesignPreview = lazy(() => import('@/pages/DesignPreview'));
const SampleInvitation = lazy(() => import('@/pages/SampleInvitation'));
const PortfolioSamples = lazy(() => import('@/pages/PortfolioSamples'));
const FoodDonation = lazy(() => import('@/pages/FoodDonation'));
const Story = lazy(() => import('@/pages/Story'));
const Support = lazy(() => import('@/pages/Support'));
const Vendors = lazy(() => import('@/pages/Vendors'));
const HashtagPage = lazy(() => import('@/pages/HashtagPage'));
const PhotographerDiscovery = lazy(() => import('@/pages/PhotographerDiscovery'));
const EventsDashboard = lazy(() => import('@/pages/EventsDashboard'));
const EventBuilder = lazy(() => import('@/pages/EventBuilder'));
const EventDesignPreview = lazy(() => import('@/pages/EventDesignPreview'));
const EventPublic = lazy(() => import('@/pages/EventPublic'));
const AdminPricing = lazy(() => import('@/pages/AdminPricing'));
const AdminPricingHub = lazy(() => import('@/pages/AdminPricingHub'));
const AdminFounding = lazy(() => import('@/pages/AdminFounding'));
const AdminPlatform = lazy(() => import('@/pages/AdminPlatform'));
const AdminFulfillment = lazy(() => import('@/pages/AdminFulfillment'));
const AdminBuildQueue = lazy(() => import('@/pages/AdminBuildQueue'));
const AdminSupport = lazy(() => import('@/pages/AdminSupport'));
const AdminDisputes = lazy(() => import('@/pages/AdminDisputes'));
const AdminModeration = lazy(() => import('@/pages/AdminModeration'));
const AdminFaceOps = lazy(() => import('@/pages/AdminFaceOps'));
const AdminSystemHealth = lazy(() => import('@/pages/AdminSystemHealth'));
const AdminFeatureFlags = lazy(() => import('@/pages/AdminFeatureFlags'));
const AdminBI = lazy(() => import('@/pages/AdminBI'));
const AdminProfitability = lazy(() => import('@/pages/AdminProfitability'));
const AdminStorage = lazy(() => import('@/pages/AdminStorage'));
const AdminDelivery = lazy(() => import('@/pages/AdminDelivery'));
const AdminInvestigation = lazy(() => import('@/pages/AdminInvestigation'));
const AdminQrAnalytics = lazy(() => import('@/pages/AdminQrAnalytics'));
const AdminFeatureWishes = lazy(() => import('@/pages/AdminFeatureWishes'));
const AdminMarketplace = lazy(() => import('@/pages/AdminMarketplace'));
const AdminStoragePool = lazy(() => import('@/pages/AdminStoragePool'));
const AdminCameras = lazy(() => import('@/pages/AdminCameras'));
const AdminEvents = lazy(() => import('@/pages/AdminEvents'));
const AdminFoodDonation = lazy(() => import('@/pages/AdminFoodDonation'));
const AdminAccessControl = lazy(() => import('@/pages/AdminAccessControl'));
const AdminApprovals = lazy(() => import('@/pages/AdminApprovals'));
const Community = lazy(() => import('@/pages/Community'));
const Reels = lazy(() => import('@/pages/Reels'));
const PixoraProfile = lazy(() => import('@/pages/PixoraProfile'));
const PhotographerDirectory = lazy(() => import('@/pages/PhotographerDirectory'));
const PhotographerPublic = lazy(() => import('@/pages/PhotographerPublic'));
const CoupleAccess = lazy(() => import('@/pages/CoupleAccess'));
const GuestArrival = lazy(() => import('@/pages/GuestArrival'));
const ComingSoon = lazy(() => import('@/pages/ComingSoon'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Terms = lazy(() => import('@/pages/legal/Terms'));
const Privacy = lazy(() => import('@/pages/legal/Privacy'));
const RefundPolicy = lazy(() => import('@/pages/legal/RefundPolicy'));
const Cookies = lazy(() => import('@/pages/legal/Cookies'));
const DataRetention = lazy(() => import('@/pages/legal/DataRetention'));

function RouteLoader() {
  return <div className="mj-loader">Loading MAJA Invites…</div>;
}

// Legacy /studio/profile/* URLs (the pre-v2 panel, and anything a studio
// bookmarked) map onto the v2 /studio/wedding/* IA. Kept as real redirects
// rather than duplicate routes so there is exactly one canonical path per
// screen and no drift between the two.
function LegacyProfileEditRedirect() {
  const { profileId } = useParams();
  return <Navigate to={`/studio/wedding/${profileId}/edit`} replace />;
}

// The legacy panel had 13 sibling routes under /studio/profile/:id/*. Those
// screens are now grouped into four tabs, so each old URL maps to a tab plus
// an optional ?view= that selects the right half of it. Factory keeps the
// route table readable instead of 13 near-identical components.
function legacyTab(tab, view) {
  return function LegacyTabRedirect() {
    const { profileId } = useParams();
    const qs = view ? `?view=${view}` : '';
    return <Navigate to={`/studio/wedding/${profileId}/${tab}${qs}`} replace />;
  };
}
const ToGuests = legacyTab('guests');
const ToRsvps = legacyTab('guests', 'rsvps');
const ToWishes = legacyTab('messages');
const ToGreetings = legacyTab('messages', 'greetings');
const ToGifts = legacyTab('gifts');
const ToShagun = legacyTab('gifts', 'shagun');
const ToAnalytics = legacyTab('analytics');
const ToClient = legacyTab('client');
const ToBudget = legacyTab('client', 'budget');
const ToEventLinks = legacyTab('setup');
const ToWhatsApp = legacyTab('setup', 'whatsapp');
const ToLiveGallery = legacyTab('live-gallery');
// The referral link is one of this wedding's shareable artifacts, so it sits
// with the QR codes rather than claiming a twelfth tab on the per-wedding rail.
function ToReferrals() {
  const { profileId } = useParams();
  return <Navigate to={`/studio/profile/${profileId}/qr-codes`} replace />;
}

// Phase 5: the event photos chooser is retired. The QR now targets face-match
// directly, and any already-printed /photos QR redirects straight there too —
// no intermediate "Whole Album vs A-Face Match" screen. The whole album stays a
// separate, PIN-protected flow at /invite/:slug/live-gallery.
function ToFindMyPhotos() {
  const { slug } = useParams();
  return <Navigate to={`/invite/${slug}/find-my-photos`} replace />;
}

// /invite/:slug/:eventType is overloaded: it is BOTH the per-ceremony URL
// (/invite/<random-slug>/wedding) AND the new canonical number+name URL
// (/invite/00001/sai-sai). A numeric first segment is unambiguously the guest
// invitation keyed by that number (generate_slug never emits an all-digit slug);
// the second segment is then a cosmetic name and is ignored. Otherwise it is a
// real ceremony type.
function InviteEventOrNumber() {
  const { slug } = useParams();
  if (/^\d+$/.test(slug || '')) return <GuestInvitation identifier={slug} />;
  return <CeremonyInvitation />;
}

// Theme settings is owned by the wizard's Design step — one place to change
// a theme, not two that drift apart.
function ToThemeSettings() {
  const { profileId } = useParams();
  return <Navigate to={`/studio/wedding/${profileId}/edit`} replace />;
}

// Legacy public portfolio URL. These were shared with clients and indexed by
// search engines before the v2 route dropped the /portfolio suffix, so they
// must keep resolving rather than 404.
function LegacyPortfolioRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/photographer/${slug}`} replace />;
}

// React Router doesn't scroll on navigation: without this, "/#story"-style
// nav links change the URL but the page never moves, and route changes keep
// the previous page's scroll offset.
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      // lazy pages mount async — retry briefly until the anchor exists
      const id = hash.slice(1);
      let tries = 0;
      const seek = () => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else if (tries++ < 60) setTimeout(seek, 50);
      };
      seek();
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);
  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        {/* WCAG 2.4.1 bypass block — keyboard/SR users skip the nav and land on
            the page's own <main id="main-content">. Visible only on focus. */}
        <a href="#main-content" className="mj-skip-link">Skip to content</a>
        <ScrollManager />
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/features" element={<Features />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/auth" element={<SignIn />} />
            <Route path="/auth/signup" element={<SignUp />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset" element={<ResetPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/invite/:slug" element={<GuestInvitation />} />
            <Route path="/invite/:slug/live-gallery" element={<LiveGallery />} />
            <Route path="/invite/:slug/find-my-photos" element={<FaceMatchPage />} />
            <Route path="/invite/:slug/photos" element={<ToFindMyPhotos />} />
            <Route path="/invite/:slug/arrival" element={<GuestArrival />} />
            <Route path="/invite/:slug/:eventType" element={<InviteEventOrNumber />} />
            <Route path="/save-the-date/:slug" element={<SaveTheDate />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order/:orderId/details" element={<OrderDetails />} />
            <Route path="/admin/dashboard" element={<RequireSuperAdmin><AdminDashboard /></RequireSuperAdmin>} />
            <Route path="/studio/dashboard" element={<RequireStudio><StudioDashboard /></RequireStudio>} />
            <Route path="/studio/profile/:profileId/gallery" element={<RequireStudio><StudioProfileGallery /></RequireStudio>} />
            {/* Event creation is a MAJA-team action (Phase 2): photographers no
                longer self-create; the API 403s a photographer POST. Old "new"
                links land on the dashboard, where assigned events appear. */}
            <Route path="/studio/wedding/new" element={<Navigate to="/studio/dashboard" replace />} />
            <Route path="/studio/wedding/:profileId/edit" element={<RequireStudio><StudioWeddingWizard /></RequireStudio>} />
            <Route path="/studio/wedding/:id" element={<RequireStudio><StudioWeddingDetail /></RequireStudio>} />
            {/* Per-wedding management tabs (grouped; see WeddingToolbar). */}
            <Route path="/studio/wedding/:weddingId/guests" element={<RequireStudio><WeddingGuests /></RequireStudio>} />
            <Route path="/studio/wedding/:weddingId/messages" element={<RequireStudio><WeddingMessages /></RequireStudio>} />
            <Route path="/studio/wedding/:weddingId/gifts" element={<RequireStudio><WeddingGifts /></RequireStudio>} />
            <Route path="/studio/wedding/:weddingId/analytics" element={<RequireStudio><WeddingAnalytics /></RequireStudio>} />
            <Route path="/studio/wedding/:weddingId/client" element={<RequireStudio><WeddingClient /></RequireStudio>} />
            <Route path="/studio/wedding/:weddingId/setup" element={<RequireStudio><WeddingSetup /></RequireStudio>} />
            <Route path="/studio/wedding/:weddingId/album" element={<RequireStudio><WeddingAlbum /></RequireStudio>} />
            {/* Legacy panel paths -> the v2 wedding IA. */}
            <Route path="/studio/profile/new" element={<Navigate to="/studio/dashboard" replace />} />
            <Route path="/studio/profile/:profileId/edit" element={<LegacyProfileEditRedirect />} />
            <Route path="/studio/profile/:profileId/guests" element={<ToGuests />} />
            <Route path="/studio/profile/:profileId/rsvps" element={<ToRsvps />} />
            <Route path="/studio/profile/:profileId/wishes" element={<ToWishes />} />
            <Route path="/studio/profile/:profileId/greetings" element={<ToGreetings />} />
            <Route path="/studio/profile/:profileId/gifts" element={<ToGifts />} />
            <Route path="/studio/profile/:profileId/shagun" element={<ToShagun />} />
            <Route path="/studio/profile/:profileId/analytics" element={<ToAnalytics />} />
            <Route path="/studio/profile/:profileId/client" element={<ToClient />} />
            <Route path="/studio/profile/:profileId/invitations" element={<ToClient />} />
            <Route path="/studio/profile/:profileId/event-links" element={<ToEventLinks />} />
            <Route path="/studio/profile/:profileId/whatsapp" element={<ToWhatsApp />} />
            <Route path="/studio/profile/:profileId/live-gallery" element={<ToLiveGallery />} />
            <Route path="/studio/profile/:profileId/theme-settings" element={<ToThemeSettings />} />
            {/* Referrals are no longer a dead end. They live on the QR codes
                page, which is this wedding's "things you can share" surface —
                a QR plate and a referral link are the same kind of artifact. */}
            <Route path="/studio/profile/:profileId/referrals" element={<ToReferrals />} />
            <Route path="/studio/profile/:profileId/post-wedding" element={<ToClient />} />
            <Route path="/studio/wedding/:weddingId/live-gallery" element={<RequireStudio><WeddingLiveGallery /></RequireStudio>} />
            <Route path="/studio/profile/:profileId/qr-codes" element={<RequireStudio><StudioProfileQrCodes /></RequireStudio>} />
            <Route path="/studio/portfolio" element={<RequireStudio><StudioPortfolio /></RequireStudio>} />
            <Route path="/studio/portfolio/build" element={<RequireStudio><StudioPortfolioBuild /></RequireStudio>} />
            <Route path="/studio/plans" element={<RequireStudio><StudioPlans /></RequireStudio>} />
            <Route path="/studio/designs" element={<RequireStudio><StudioDesigns /></RequireStudio>} />
            <Route path="/studio/orders" element={<RequireStudio><StudioOrders /></RequireStudio>} />
            <Route path="/studio/order/invitation-suite" element={<RequireStudio><StudioSuiteCheckout /></RequireStudio>} />
            <Route path="/studio/community" element={<RequireStudio><StudioCommunity /></RequireStudio>} />
            {/* Pixora — the 8-group community hub. Group and panel live in the
                query string, so every one of its panels is linkable. */}
            <Route path="/studio/pixora" element={<RequireStudio><PixoraHub /></RequireStudio>} />
            {/* Studio business surfaces (not per-wedding). */}
            <Route path="/studio/earnings" element={<RequireStudio><StudioEarnings /></RequireStudio>} />
            <Route path="/studio/insights" element={<RequireStudio><StudioInsights /></RequireStudio>} />
            <Route path="/studio/staff" element={<RequireStudio><StudioStaff /></RequireStudio>} />
            <Route path="/studio/security" element={<RequireStudio><StudioSecurity /></RequireStudio>} />
            <Route path="/studio/ai-tools" element={<RequireStudio><StudioAiTools /></RequireStudio>} />
            <Route path="/studio/backup" element={<RequireStudio><StudioBackup /></RequireStudio>} />
            <Route path="/studio/directory" element={<RequireStudio><StudioDirectory /></RequireStudio>} />
            <Route path="/studio/audit-logs" element={<RequireStudio><StudioAuditLogs /></RequireStudio>} />
            <Route path="/studio/white-label" element={<RequireStudio><StudioWhiteLabel /></RequireStudio>} />
            <Route path="/studio/calendar" element={<RequireStudio><StudioCalendar /></RequireStudio>} />
            <Route path="/studio/storage" element={<RequireStudio><StudioStorage /></RequireStudio>} />
            <Route path="/studio/studio-storage" element={<RequireStudio><StudioStorage /></RequireStudio>} />
            <Route path="/studio/invitations" element={<RequireStudio><StudioInvitations /></RequireStudio>} />
            <Route path="/studio/clients" element={<RequireStudio><StudioClients /></RequireStudio>} />
            <Route path="/studio/notifications" element={<RequireStudio><StudioNotifications /></RequireStudio>} />
            <Route path="/studio/messages" element={<RequireStudio><StudioMessages /></RequireStudio>} />
            <Route path="/studio/client-work" element={<RequireStudio><StudioClients /></RequireStudio>} />
            <Route path="/studio/client" element={<Navigate to="/studio/clients" replace />} />
            {/* Legacy aliases that existed as redirects in the old app. Without
                these, an old bookmark 404s. Sign-in is now the single /auth. */}
            <Route path="/studio/client/login" element={<Navigate to="/auth" replace />} />
            <Route path="/studio/dashboard/trash" element={<Navigate to="/studio/dashboard" replace />} />
            <Route path="/studio/themes" element={<Navigate to="/browse" replace />} />
            <Route path="/studio/photographer-profile" element={<Navigate to="/studio/portfolio" replace />} />
            <Route path="/studio/portfolio/premium" element={<Navigate to="/studio/plans" replace />} />
            <Route path="/studio/build-queue" element={<Navigate to="/studio/orders" replace />} />
            <Route path="/studio/category-selector" element={<Navigate to="/studio/dashboard" replace />} />
            <Route path="/studio/celebration/new" element={<Navigate to="/studio/dashboard" replace />} />
            <Route path="/studio/staff/accept" element={<RequireStudio><StudioStaff /></RequireStudio>} />
            {/* Legacy studio aliases. */}
            <Route path="/studio/cloud-backup" element={<Navigate to="/studio/studio-storage" replace />} />
            <Route path="/studio/cloud-backup/legacy" element={<Navigate to="/studio/studio-storage" replace />} />
            {/* PixoraHub reads `g`/`p` (not group/panel), and the Studio Tools group key
    is `studio`. Getting either wrong silently falls back to Home/Overview. */}
<Route path="/studio/pixora-analytics" element={<Navigate to="/studio/pixora?g=studio&p=analytics" replace />} />
            <Route path="/studio/login" element={<Navigate to="/auth" replace />} />
            <Route path="/studio/signup" element={<Navigate to="/auth/signup" replace />} />
            <Route path="/studio/auth/callback" element={<Navigate to="/auth/callback" replace />} />
            <Route path="/forgot-password" element={<Navigate to="/auth/reset" replace />} />
            {/* One sign-in for the whole site. Every obvious login URL — typed
                by hand, an old bookmark, or a guess — funnels to /auth; the
                account's role decides the destination (SignIn + the guards),
                so there is never a second login page to keep in step. */}
            <Route path="/login" element={<Navigate to="/auth" replace />} />
            <Route path="/signin" element={<Navigate to="/auth" replace />} />
            <Route path="/sign-in" element={<Navigate to="/auth" replace />} />
            <Route path="/admin/login" element={<Navigate to="/auth" replace />} />
            <Route path="/signup" element={<Navigate to="/auth/signup" replace />} />
            <Route path="/register" element={<Navigate to="/auth/signup" replace />} />
            {/* Bare section roots -> their dashboards; the guards send a
                signed-out visitor to /auth, so these funnel to the one login too. */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/studio" element={<Navigate to="/studio/dashboard" replace />} />
            <Route path="/admin/pricing" element={<RequireSuperAdmin><AdminPricing /></RequireSuperAdmin>} />
            <Route path="/admin/pricing-hub" element={<RequireSuperAdmin><AdminPricingHub /></RequireSuperAdmin>} />
            <Route path="/admin/founding" element={<RequireSuperAdmin><AdminFounding /></RequireSuperAdmin>} />
            <Route path="/admin/platform" element={<RequireSuperAdmin><AdminPlatform /></RequireSuperAdmin>} />
            {/* Super-admin operations console. */}
            <Route path="/admin/fulfillment" element={<RequireSuperAdmin><AdminFulfillment /></RequireSuperAdmin>} />
            <Route path="/admin/build-queue" element={<RequireSuperAdmin><AdminBuildQueue /></RequireSuperAdmin>} />
            <Route path="/admin/support" element={<RequireSuperAdmin><AdminSupport /></RequireSuperAdmin>} />
            <Route path="/admin/disputes" element={<RequireSuperAdmin><AdminDisputes /></RequireSuperAdmin>} />
            <Route path="/admin/moderation" element={<RequireSuperAdmin><AdminModeration /></RequireSuperAdmin>} />
            <Route path="/admin/face-ops" element={<RequireSuperAdmin><AdminFaceOps /></RequireSuperAdmin>} />
            <Route path="/admin/system-health" element={<RequireSuperAdmin><AdminSystemHealth /></RequireSuperAdmin>} />
            <Route path="/admin/feature-flags" element={<RequireSuperAdmin><AdminFeatureFlags /></RequireSuperAdmin>} />
            <Route path="/admin/bi" element={<RequireSuperAdmin><AdminBI /></RequireSuperAdmin>} />
            <Route path="/admin/profitability" element={<RequireSuperAdmin><AdminProfitability /></RequireSuperAdmin>} />
            <Route path="/admin/storage" element={<RequireSuperAdmin><AdminStorage /></RequireSuperAdmin>} />
            <Route path="/admin/delivery" element={<RequireSuperAdmin><AdminDelivery /></RequireSuperAdmin>} />
            <Route path="/admin/investigation" element={<RequireSuperAdmin><AdminInvestigation /></RequireSuperAdmin>} />
            <Route path="/admin/qr-analytics" element={<RequireSuperAdmin><AdminQrAnalytics /></RequireSuperAdmin>} />
            <Route path="/admin/feature-wishes" element={<RequireSuperAdmin><AdminFeatureWishes /></RequireSuperAdmin>} />
            <Route path="/admin/marketplace" element={<RequireSuperAdmin><AdminMarketplace /></RequireSuperAdmin>} />
            <Route path="/admin/storage-pool" element={<RequireSuperAdmin><AdminStoragePool /></RequireSuperAdmin>} />
            <Route path="/admin/cameras" element={<RequireSuperAdmin><AdminCameras /></RequireSuperAdmin>} />
            <Route path="/admin/events" element={<RequireSuperAdmin><AdminEvents /></RequireSuperAdmin>} />
            <Route path="/admin/food-donation" element={<RequireSuperAdmin><AdminFoodDonation /></RequireSuperAdmin>} />
            <Route path="/admin/access-control" element={<RequireSuperAdmin><AdminAccessControl /></RequireSuperAdmin>} />
            <Route path="/admin/approvals" element={<RequireSuperAdmin><AdminApprovals /></RequireSuperAdmin>} />
            {/* Legacy /super-admin/* console URLs -> the v2 /admin/* console.
                These were the owner's bookmarks; without these they 404. Every
                legacy pricing alias collapses onto the single pricing hub, as
                it did in the legacy app. */}
            {[
              ['dashboard', '/admin/dashboard'],
              ['login', '/auth'],
              ['fulfillment', '/admin/fulfillment'],
              ['support', '/admin/support'],
              ['disputes', '/admin/disputes'],
              ['moderation', '/admin/moderation'],
              ['face-ops', '/admin/face-ops'],
              ['system-health', '/admin/system-health'],
              ['feature-flags', '/admin/feature-flags'],
              ['bi', '/admin/bi'],
              ['profitability', '/admin/profitability'],
              ['storage-analytics', '/admin/storage'],
              ['delivery', '/admin/delivery'],
              ['providers', '/admin/face-ops'],
              ['pricing', '/admin/pricing'],
              ['pricing-editor', '/admin/pricing'],
              ['pricing-engine', '/admin/pricing'],
              ['pricing-discounts', '/admin/pricing'],
              ['plans-pricing', '/admin/pricing'],
              ['design-pricing', '/admin/pricing'],
              ['design-pricing-new', '/admin/pricing'],
              ['founding-pricing', '/admin/pricing'],
              ['expiry-tiers', '/admin/pricing'],
              ['gift-codes', '/admin/pricing'],
              ['credit-packs', '/admin/pricing'],
              ['credit-packs-new', '/admin/pricing'],
              ['credits', '/admin/pricing'],
              ['qr-analytics', '/admin/bi'],
              ['security', '/admin/system-health'],
              ['investigation', '/admin/dashboard'],
              ['feature-requests', '/admin/support'],
            ].map(([from, to]) => (
              <Route key={from} path={`/super-admin/${from}`} element={<Navigate to={to} replace />} />
            ))}
            <Route path="/super-admin/photographers/:adminId" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/community/reels" element={<Reels />} />
            <Route path="/community" element={<Community />} />
            <Route path="/photographers" element={<PhotographerDirectory />} />
            <Route path="/photographer/:slug" element={<PhotographerPublic />} />
            <Route path="/photographer/:slug/portfolio" element={<LegacyPortfolioRedirect />} />
            <Route path="/p/:username" element={<PixoraProfile />} />
            <Route path="/couple/access" element={<CoupleAccess />} />
            <Route path="/couple/access/:slug" element={<CoupleAccess />} />
            {/* Public reader for the food-donation directory. The admin side
                (/admin/food-donation) has existed on its own, so curated
                centres had no page to appear on. */}
            <Route path="/food-donation" element={<FoodDonation />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            {/* Public design-discovery funnel. */}
            <Route path="/browse" element={<BrowseDesigns />} />
            <Route path="/browse/*" element={<BrowseDesigns />} />
            <Route path="/themes" element={<Navigate to="/browse" replace />} />
            <Route path="/themes/:themeId" element={<BrowseDesigns />} />
            <Route path="/themes/:themeId/gallery" element={<BrowseDesigns />} />
            <Route path="/themes/:themeId/events" element={<BrowseDesigns />} />
            <Route path="/themes/:themeId/events/:event" element={<BrowseDesigns />} />
            <Route path="/themes/:themeId/gallery" element={<BrowseDesigns mode="gallery" />} />
            <Route path="/designs" element={<Navigate to="/browse" replace />} />
            {/* Public marketing. */}
            {/* Dynamic Event Engine. Studio-side is guarded; the public
                event page is a different route family from /invite/:slug. */}
            <Route path="/events" element={<RequireStudio><EventsDashboard /></RequireStudio>} />
            <Route path="/events/:eventId/builder" element={<RequireStudio><EventBuilder /></RequireStudio>} />
            {/* Public design preview. This was a redirect to /events, which
                resolved without 404ing and showed no design at all — the
                "a redirect is not coverage" trap. It renders the artwork now. */}
            <Route path="/events/preview/:eventType" element={<EventDesignPreview />} />
            <Route path="/events/preview/:eventType/:templateId" element={<EventDesignPreview />} />
            <Route path="/create/ganesh" element={<Navigate to="/events" replace />} />
            <Route path="/e/:slug" element={<EventPublic />} />
            <Route path="/e/:slug/money" element={<EventPublic view="money" />} />
            {/* Design previews fold into the browse funnel — one place that
                renders a design, not four that drift. */}
            <Route path="/themes/:themeId/events/:event/design/:designIndex" element={<BrowseDesigns />} />
            {/* One design, by the code a customer was given. The grids used to
                link at /preview/theme/:themeId, which is the whole-collection
                gallery — clicking a design showed every design but that one. */}
            <Route path="/preview/design/:code" element={<DesignPreview />} />
            <Route path="/preview/theme/:themeId" element={<BrowseDesigns mode="gallery" />} />
            {/* A LIVE sample invitation, not a redirect to the grid. These
                three were `<Navigate to="/browse">`, so the only way to find
                out what a design looks like as an invitation was to buy it.
                SampleInvitation renders the real GuestInvitation component with
                sample content, so the preview cannot drift from the product. */}
            <Route path="/preview/luxe" element={<SampleInvitation />} />
            <Route path="/preview/celebration/:category" element={<SampleInvitation />} />
            <Route path="/preview/celebration/:category/:designId" element={<SampleInvitation />} />
            <Route path="/experience/demo" element={<Navigate to="/features" replace />} />
            <Route path="/live/:weddingId" element={<RequireStudio><WeddingLiveGallery /></RequireStudio>} />
            <Route path="/studio/celebration/:profileId/edit" element={<LegacyProfileEditRedirect />} />
            <Route path="/story" element={<Story />} />
            <Route path="/support" element={<Support />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/community/tag/:tag" element={<HashtagPage />} />
            <Route path="/community/about" element={<Navigate to="/story" replace />} />
            <Route path="/photographers/:a" element={<PhotographerDiscovery />} />
            <Route path="/photographers/:a/:b" element={<PhotographerDiscovery />} />
            <Route path="/plans" element={<Navigate to="/pricing" replace />} />
            <Route path="/purchase" element={<Navigate to="/pricing" replace />} />
            <Route path="/portfolio-plans" element={<Navigate to="/pricing" replace />} />
            {/* The ten portfolio designs, in public. This was a redirect to the
                directory of OTHER photographers, so the one question a studio
                has before subscribing — what will my site look like — could
                only be answered from inside a paid account. */}
            <Route path="/portfolio-samples" element={<PortfolioSamples />} />
            <Route path="/order/pending" element={<Navigate to="/studio/orders" replace />} />
            <Route path="/refund" element={<RefundPolicy />} />
            <Route path="/cookies" element={<Cookies />} />
            <Route path="/data-retention" element={<DataRetention />} />
            <Route path="/soon" element={<ComingSoon />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        {/* GDPR/DPDP consent. Inside the router (it hides itself on guest
            invitation routes), outside <Routes> so it survives navigation. */}
        <CookieConsent />
      </BrowserRouter>
    </AuthProvider>
  );
}
