import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { AuthProvider } from './context/AuthContext';
import { UserAuthProvider, useUserAuth } from './context/UserAuthContext';
import { ClientAuthProvider } from './context/ClientAuthContext';
import { CartProvider } from './context/CartContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingFallback from './components/LoadingFallback';

import './App.css';
import { useAuth } from './context/AuthContext';
import { AnimationProvider } from './components/animations';
import ScrollToTop from './components/ScrollToTop';
import RouteCleanup from './components/perf/RouteCleanup';
import RouteTransition from './motion/RouteTransition';
import GlobalHomeButton from './components/GlobalHomeButton';
import GlobalBackButton from './components/GlobalBackButton';
import CookieConsent from './components/CookieConsent';

// PHASE 2: CODE SPLITTING - Lazy load all heavy pages for better initial load
const LandingPage = lazy(() => import('./pages/LandingPage'));

// Public pages - Lazy loaded
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const AdminAuthCallback = lazy(() => import('./pages/AdminAuthCallback'));
const LuxuryPreview = lazy(() => import('./pages/LuxuryPreview'));
const LuxuryPublicInvitation = lazy(() => import('./pages/LuxuryPublicInvitation'));
const GeneratedInvitationRoute = lazy(() => import('./pages/GeneratedInvitationRoute'));
const SaveTheDatePage = lazy(() => import('./pages/SaveTheDatePage'));
const ThemeInvitationPreview = lazy(() => import('./pages/ThemeInvitationPreview'));
const CoupleAccess = lazy(() => import('./pages/CoupleAccess'));
const ThemeShowroom = lazy(() => import('./pages/ThemeShowroom'));
const CategoryBrowser = lazy(() => import('./pages/CategoryBrowser'));
const KeralaDesignGallery = lazy(() => import('./pages/KeralaDesignGallery'));
const ThemeDesignGallery = lazy(() => import('./pages/ThemeDesignGallery'));
const ThemeEventPicker = lazy(() => import('./pages/ThemeEventPicker'));
const EventDesignPicker = lazy(() => import('./pages/EventDesignPicker'));
const DesignFullPreview = lazy(() => import('./pages/DesignFullPreview'));

// Photographer admin - Lazy loaded
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminSignup = lazy(() => import('./pages/AdminSignup'));
const LuxuryDashboard = lazy(() => import('./pages/LuxuryDashboard'));
// Photographer's-client scoped portal (couple/family view of one invitation)
const ClientDashboard = lazy(() => import('./pages/ClientDashboard'));
// Photographer Panel modules (Parts 7–14)
const PhotographerPortfolio = lazy(() => import('./pages/PhotographerPortfolio'));
const StudioDesigns = lazy(() => import('./pages/StudioDesigns'));
const PendingOrders = lazy(() => import('./pages/PendingOrders'));
const OccupancyCalendar = lazy(() => import('./pages/OccupancyCalendar'));
const PhotographerThemes = lazy(() => import('./pages/PhotographerThemes'));
const PublicPhotographerProfile = lazy(() => import('./pages/PublicPhotographerProfile'));
const PhotographerDiscoveryPage = lazy(() => import('./pages/PhotographerDiscoveryPage'));
const PixoraPublicProfile = lazy(() => import('./pages/PixoraPublicProfile'));
const PublicCommunity = lazy(() => import('./pages/PublicCommunity'));
const PixoraReels = lazy(() => import('./pages/PixoraReels'));
const HashtagPage = lazy(() => import('./pages/HashtagPage'));
const StudioContentAnalytics = lazy(() => import('./pages/StudioContentAnalytics'));
const PortfolioPricingPage = lazy(() => import('./pages/PortfolioPricingPage'));
const CloudBackupManager = lazy(() => import('./pages/CloudBackupManager'));
const TrashBinPage = lazy(() => import('./pages/TrashBinPage'));
const LuxuryProfileForm = lazy(() => import('./pages/LuxuryProfileForm'));
// Dynamic Event Engine (Ganesh + future types) — flag-gated backend; every
// endpoint 404s until `ganesh_module_enabled` is ON, so these routes render a
// friendly "coming soon" until then. Event-type-agnostic (Doc 06).
const EventsDashboard = lazy(() => import('./pages/EventsDashboard'));
const EventBuilder = lazy(() => import('./pages/EventBuilder'));
const EventPublicInvitation = lazy(() => import('./pages/EventPublicInvitation'));
const EventMoneyPortal = lazy(() => import('./pages/EventMoneyPortal'));
const GaneshPurchase = lazy(() => import('./pages/GaneshPurchase'));
// Full scrollable preview of one event design (the event twin of DesignFullPreview).
const EventDesignPreview = lazy(() => import('./pages/EventDesignPreview'));
const EventInvitationWizard = lazy(() => import('./pages/EventInvitationWizard'));
const ClientHubPage = lazy(() => import('./pages/ClientHubPage'));
const EventCategorySelector = lazy(() => import('./pages/EventCategorySelector'));
const CelebrationProfileForm = lazy(() => import('./pages/CelebrationProfileForm'));
// 2026-09 — Live sample invitation preview for non-wedding categories.
// Lets a homepage visitor experience the full invitation (cinematic opening
// + features playing live) before they buy.
const CelebrationInvitationPreview = lazy(() => import('./pages/CelebrationInvitationPreview'));

// Super admin - Lazy loaded
const SuperAdminLogin = lazy(() => import('./pages/SuperAdminLogin'));
const LuxurySuperAdminDashboard = lazy(() => import('./pages/LuxurySuperAdminDashboard'));
const SuperAdminPricingHub = lazy(() => import('./pages/SuperAdminPricingHub'));
const SuperAdminFoundingPricing = lazy(() => import('./pages/SuperAdminFoundingPricing'));
const AdminFulfillment = lazy(() => import('./pages/AdminFulfillment'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Experience3DDemo = lazy(() => import('./pages/Experience3DDemo'));
const StudioWhiteLabel = lazy(() => import('./pages/StudioWhiteLabel'));
const AboutCommunity = lazy(() => import('./pages/AboutCommunity'));
const PortfolioSamples = lazy(() => import('./pages/PortfolioSamples'));
const SuperAdminFeatureFlags = lazy(() => import('./pages/SuperAdminFeatureFlags'));
const SuperAdminGiftCodes = lazy(() => import('./pages/SuperAdminGiftCodes'));
const SuperAdminFeatureWishes = lazy(() => import('./pages/SuperAdminFeatureWishes'));
const SuperAdminExpiryTiers = lazy(() => import('./pages/SuperAdminExpiryTiers'));
const PricingEngineHub = lazy(() => import('./pages/PricingEngineHub'));
const WeddingCheckout = lazy(() => import('./pages/WeddingCheckout'));

// Sub-pages - Lazy loaded
const RSVPManagement = lazy(() => import('./pages/RSVPManagement'));
const GuestListManager = lazy(() => import('./pages/GuestListManager'));
const Phase30AnalyticsPage = lazy(() => import('./pages/Phase30AnalyticsPage'));
const GreetingsManagement = lazy(() => import('./pages/GreetingsManagement'));
const WishesManagement = lazy(() => import('./pages/WishesManagement'));
const PostWeddingManagement = lazy(() => import('./pages/PostWeddingManagement'));
const QRCodeManagement = lazy(() => import('./pages/QRCodeManagement'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const StudioSecurity = lazy(() => import('./pages/StudioSecurity'));
const StudioEarnings = lazy(() => import('./pages/StudioEarnings'));
const StudioInsights = lazy(() => import('./pages/StudioInsights'));
const StudioMessages = lazy(() => import('./pages/StudioMessages'));
const StudioStaff = lazy(() => import('./pages/StudioStaff'));
const StudioStaffAccept = lazy(() => import('./pages/StudioStaffAccept'));
const StudioClientWork = lazy(() => import('./pages/StudioClientWork'));
const ThemeSettingsPage = lazy(() => import('./pages/ThemeSettingsPage'));

// Premium features - Lazy loaded
const LivePhotoWall = lazy(() => import('./pages/LivePhotoWall'));
const LiveGalleryManagement = lazy(() => import('./pages/LiveGalleryManagement'));
const UserLiveGalleryManagement = lazy(() => import('./pages/UserLiveGalleryManagement'));
const WhatsAppManager = lazy(() => import('./pages/WhatsAppManager'));
const DigitalShagunSettings = lazy(() => import('./pages/DigitalShagunSettings'));
const GiftRegistryEditor = lazy(() => import('./pages/GiftRegistryEditor'));
const GalleryManager = lazy(() => import('./pages/GalleryManager'));
const PhotographerLiveMode = lazy(() => import('./pages/PhotographerLiveMode'));

// Monetization - Lazy loaded
const PhotographerDetail = lazy(() => import('./pages/PhotographerDetail'));

// User flows - Lazy loaded
const UserDashboard = lazy(() => import('./pages/UserDashboard'));
const FeaturesPage = lazy(() => import('./pages/FeaturesPage'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage'));
const ContactSupport = lazy(() => import('./pages/ContactSupport'));
const SuperAdminSupport = lazy(() => import('./pages/SuperAdminSupport'));
const SuperAdminSystemHealth = lazy(() => import('./pages/SuperAdminSystemHealth'));
const SuperAdminUserInvestigation = lazy(() => import('./pages/SuperAdminUserInvestigation'));
const SuperAdminBI = lazy(() => import('./pages/SuperAdminBI'));
const SuperAdminDisputes = lazy(() => import('./pages/SuperAdminDisputes'));
const SuperAdminModeration = lazy(() => import('./pages/SuperAdminModeration'));
const SuperAdminQRAnalytics = lazy(() => import('./pages/SuperAdminQRAnalytics'));
const SuperAdminSecurity = lazy(() => import('./pages/SuperAdminSecurity'));
const SuperAdminDelivery = lazy(() => import('./pages/SuperAdminDelivery'));
const SuperAdminStorage = lazy(() => import('./pages/SuperAdminStorage'));
const SuperAdminProfitability = lazy(() => import('./pages/SuperAdminProfitability'));
const SuperAdminFaceOps = lazy(() => import('./pages/SuperAdminFaceOps'));
const SuperAdminProviders = lazy(() => import('./pages/SuperAdminProviders'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const PhotographersPage = lazy(() => import('./pages/PhotographersPage'));
const VendorMarketplace = lazy(() => import('./pages/VendorMarketplace'));
const PhotographerProfilePage = lazy(() => import('./pages/PhotographerProfilePage'));
const StoryPage = lazy(() => import('./pages/StoryPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const OrderDetailsForm = lazy(() => import('./pages/OrderDetailsForm'));
const AdminBuildQueue = lazy(() => import('./pages/AdminBuildQueue'));
const UserProfile = lazy(() => import('./pages/UserProfile'));
// BUG J — Normal-user wedding-invitation edit page (PATCH /api/users/profiles/{id}).
const UserWeddingEditPage = lazy(() => import('./pages/UserWeddingEditPage'));
// June 2026 — Studio backup storage (photographer side).
const StudioStoragePage = lazy(() => import('./pages/StudioStoragePage'));
const StudioPlansPage = lazy(() => import('./pages/StudioPlansPage'));
const PixoraCommunity = lazy(() => import('./pages/PixoraCommunity'));
const PortfolioBuildRequest = lazy(() => import('./pages/PortfolioBuildRequest'));
const StudioWeddingDetail = lazy(() => import('./pages/StudioWeddingDetail'));
const CloudBackup = lazy(() => import('./pages/CloudBackup'));
// Legal / policy pages (Terms, Privacy, Refund, Contact) — one renderer, content
// from src/config/legalContent.js. Required for Razorpay live + DPDP compliance.
const LegalPage = lazy(() => import('./pages/LegalPage'));
// Account recovery (Supabase-backed) + DPDP data tools entry points.
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

// Legacy /admin/* links → /studio/* (panel was renamed from admin to studio).
function RedirectAdminToStudio() {
  const loc = useLocation();
  return <Navigate to={loc.pathname.replace(/^\/admin/, '/studio') + loc.search} replace />;
}

/**
 * Studio (photographer) route guard.
 *
 * Studio pages each rolled their own check, so the ones that forgot rendered a
 * logged-out shell while every API call 403'd (e.g. /studio/portfolio) instead
 * of sending the visitor to login. One guard, one behaviour.
 *
 * MUST wait for `loading`: AuthContext re-boots the session on every page load,
 * and redirecting during that window is what caused the old "click an option ->
 * back to login" bug (commit 6143500). No admin only means "not signed in"
 * AFTER the boot has finished.
 */
const RequireStudio = ({ children }) => {
  const { admin, loading } = useAuth();
  const location = useLocation();
  // Not `null`: auth boot takes a round-trip (longer on a cold/slow backend), and
  // rendering nothing shows a blank page with no indication it is still working.
  if (loading) return <LoadingFallback variant="page" />;
  if (!admin) return <Navigate to="/studio/login" replace state={{ from: location }} />;
  return <PanelMain>{children}</PanelMain>;
};

/**
 * PanelMain — the one <main id="main-content"> landmark for the authed panels
 * (WCAG 2.4.1 / 1.3.1; it is what the App-level skip link targets).
 *
 * Lives at the ROUTE level, not in the pages: the studio + super-admin panels
 * are ~40 page components with no shared shell, and marking each one up
 * individually is 40 chances to forget one (and to end up with two `#main-content`
 * ids on the same page). `RequireStudio` already wraps every studio route, and a
 * pathless layout route covers the super-admin group.
 *
 * Public/marketing pages are NOT covered here — LandingPage and PublicChrome
 * render their own <main> BELOW their nav, which a wrapper this high could not do.
 */
const PanelMain = ({ children }) => (
  <main id="main-content" tabIndex={-1}>{children ?? <Outlet />}</main>
);

/**
 * RequireBuyer — allows EITHER a photographer (studio) OR a signed-in family/host user.
 * Used for the self-serve event builder so both personas can create Ganesh invitations.
 * Unauthenticated visitors normally arrive here already signed in via the purchase page;
 * this is a safety fallback.
 */
const RequireBuyer = ({ children }) => {
  const { admin, loading } = useAuth();
  const { user, loading: userLoading } = useUserAuth();
  const location = useLocation();
  if (loading || userLoading) return <LoadingFallback variant="page" />;
  if (admin || user) return children;
  return <Navigate to={`/studio/login?next=${encodeURIComponent(location.pathname + location.search)}`}
                   replace state={{ from: location }} />;
};

function App() {
  React.useEffect(() => {
    // Disarm the pre-React recovery guard (public/index.html) — but only HERE,
    // because an effect runs solely after React has really mounted and painted.
    // It used to be set in index.js BEFORE render(), so a first-render crash
    // left a blank page with the safety net already switched off. If App never
    // mounts, the flag stays unset and the guard reloads once, then shows its
    // "Couldn't finish loading" card instead of a black screen.
    try { document.getElementById('root')?.setAttribute('data-booted', '1'); } catch (_) { /* ignore */ }

    // Apply luxury cinematic theme globally to all pages
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    
    // CRITICAL: Ensure body can scroll - only on mobile
    if (window.innerWidth <= 1024) {
      document.body.style.webkitOverflowScrolling = 'touch';
    }
    
    return () => {
      document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
      document.body.style.webkitOverflowScrolling = '';
    };
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <AuthProvider>
          <UserAuthProvider>
          <ClientAuthProvider>
          <CartProvider>
          <AnimationProvider>
            <div className="App">
              <BrowserRouter>
              {/* WCAG 2.4.1 Bypass Blocks — keyboard/SR users skip the nav.
                  Visible only on focus. Targets the page's #main-content. */}
              <a href="#main-content" className="lux-skip-link">Skip to content</a>
              <ScrollToTop />
              <RouteCleanup />
              <Suspense fallback={<LoadingFallback variant="page" />}>
              <RouteTransition>
              <Routes>
                {/* Public */}
                <Route path="/" element={<LandingPage />} />
                {/* Legacy pricing pages consolidated → the single canonical "Plans & Pricing". */}
                <Route path="/pricing" element={<Navigate to="/portfolio-plans" replace />} />
                <Route path="/features" element={<FeaturesPage />} />
                <Route path="/how-it-works" element={<HowItWorksPage />} />
                <Route path="/plans" element={<Navigate to="/portfolio-plans" replace />} />
                <Route path="/faq" element={<FaqPage />} />
                <Route path="/story" element={<StoryPage />} />
                <Route path="/photographers" element={<PhotographersPage />} />
                {/* Live samples of every portfolio design (seeded demo
                    studios). The only intentional way in - they are kept
                    out of Discover/search/sitemap on purpose. */}
                <Route path="/portfolio-samples" element={<PortfolioSamples />} />
                {/* SEO discovery landing pages — category / location / combined.
                    Resolved server-side (/api/public/discovery); thin pages render
                    noindex. Kept below the exact /photographers route. */}
                <Route path="/photographers/:a" element={<PhotographerDiscoveryPage />} />
                <Route path="/photographers/:a/:b" element={<PhotographerDiscoveryPage />} />
                <Route path="/vendors" element={<VendorMarketplace />} />
                <Route path="/studio/photographer-profile" element={<RequireStudio><PhotographerProfilePage /></RequireStudio>} />
                {/* Legal / policy pages */}
                <Route path="/terms" element={<LegalPage docKey="terms" />} />
                <Route path="/privacy" element={<LegalPage docKey="privacy" />} />
                <Route path="/refund" element={<LegalPage docKey="refund" />} />
                <Route path="/cookies" element={<LegalPage docKey="cookies" />} />
                <Route path="/data-retention" element={<LegalPage docKey="retention" />} />
                <Route path="/contact" element={<LegalPage docKey="contact" />} />
                <Route path="/support" element={<ContactSupport />} />
                {/* Account recovery */}
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/studio/auth/callback" element={<AdminAuthCallback />} />
                {/* Hierarchical category drill-down (home → main category → … → design) */}
                <Route path="/browse" element={<CategoryBrowser />} />
                <Route path="/browse/*" element={<CategoryBrowser />} />
                {/* /themes now leads with the hierarchical drill-down too */}
                <Route path="/themes" element={<Navigate to="/browse" replace />} />
                <Route path="/themes/kerala_backwaters/gallery" element={<KeralaDesignGallery />} />
                <Route path="/themes/:themeId/gallery" element={<ThemeDesignGallery />} />
                {/* NEW: step-by-step picker — Theme → 6 events → 3 designs → fullscreen preview */}
                <Route path="/themes/:themeId/events" element={<ThemeEventPicker />} />
                <Route path="/themes/:themeId/events/:event" element={<EventDesignPicker />} />
                <Route path="/themes/:themeId/events/:event/design/:designIndex" element={<DesignFullPreview />} />
                <Route path="/themes/:themeId" element={<ThemeShowroom />} />
                <Route path="/preview/luxe" element={<LuxuryPreview />} />
                <Route path="/preview/theme/:themeId" element={<ThemeInvitationPreview />} />
                {/* 2026-09 — Sample invitation preview for non-wedding
                    categories (baby_birthday / half_saree / puberty / dhoti).
                    Optional designId pre-fills the cover photo with that
                    design's artwork. */}
                <Route path="/preview/celebration/:category" element={<CelebrationInvitationPreview />} />
                <Route path="/preview/celebration/:category/:designId" element={<CelebrationInvitationPreview />} />
                <Route path="/invite/:slug" element={<LuxuryPublicInvitation />} />
                {/* Event invitations use a distinct /e/:slug route (Dynamic Event
                    Engine) so they never collide with the wedding renderer above. */}
                <Route path="/e/:slug" element={<EventPublicInvitation />} />
                <Route path="/e/:slug/money" element={<EventMoneyPortal />} />
                <Route path="/create/ganesh" element={<GaneshPurchase />} />
                <Route path="/events/preview/:eventType/:templateId" element={<EventDesignPreview />} />
                {/* Tries a generated invitation at invitations/<owner>/<event>/
                    first, then falls back to the shared template — so existing
                    /invite/:slug/:eventType links behave exactly as before.
                    (/invite/:slug/live-gallery still wins: React Router ranks a
                    literal segment above a dynamic one.) */}
                <Route path="/invite/:slug/:eventType" element={<GeneratedInvitationRoute />} />
                {/* Phase 2A — Save the Date teaser page */}
                <Route path="/save-the-date/:slug" element={<SaveTheDatePage />} />

                {/* Couple portal */}
                <Route path="/couple/access" element={<CoupleAccess />} />
                <Route path="/couple/access/:slug" element={<CoupleAccess />} />

                {/* Super Admin — pathless <PanelMain> layout route so every
                    console page gets the one <main id="main-content"> landmark
                    without repeating it per element. Child paths stay absolute
                    (allowed: the layout route contributes no path segment). */}
                <Route element={<PanelMain />}>
                  <Route path="/super-admin/login" element={<SuperAdminLogin />} />
                  <Route path="/super-admin/dashboard" element={<LuxurySuperAdminDashboard />} />
                  <Route path="/super-admin/pricing" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/fulfillment" element={<AdminFulfillment />} />
                  {/* Backward-compat redirects: every legacy pricing URL → unified hub */}
                  <Route path="/super-admin/credit-packs" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/credit-packs-new" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/design-pricing" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/design-pricing-new" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/plans-pricing" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/pricing-discounts" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/pricing-editor" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/credits" element={<SuperAdminPricingHub />} />
                  <Route path="/super-admin/expiry-tiers" element={<SuperAdminExpiryTiers />} />
                  <Route path="/super-admin/pricing-engine" element={<PricingEngineHub />} />
                  {/* Founding-100 pricing controls (toggle, seat counter, apply catalogue, edit prices). */}
                  <Route path="/super-admin/founding-pricing" element={<SuperAdminFoundingPricing />} />
                  {/* The four super-admin routes that used to sit further down,
                      moved here so the landmark covers the whole console. */}
                  <Route path="/super-admin/gift-codes" element={<SuperAdminGiftCodes />} />
                  {/* Custom-feature requests: buyers who left a number for a call back. */}
                  <Route path="/super-admin/feature-requests" element={<SuperAdminFeatureWishes />} />
                  <Route path="/super-admin/photographers/:adminId" element={<PhotographerDetail />} />
                  {/* Phase 11 — super-admin feature-flag switchboard */}
                  <Route path="/super-admin/feature-flags" element={<SuperAdminFeatureFlags />} />
                  <Route path="/super-admin/support" element={<SuperAdminSupport />} />
                  <Route path="/super-admin/system-health" element={<SuperAdminSystemHealth />} />
                  <Route path="/super-admin/investigation" element={<SuperAdminUserInvestigation />} />
                  <Route path="/super-admin/bi" element={<SuperAdminBI />} />
                  <Route path="/super-admin/disputes" element={<SuperAdminDisputes />} />
                  <Route path="/super-admin/moderation" element={<SuperAdminModeration />} />
                  <Route path="/super-admin/qr-analytics" element={<SuperAdminQRAnalytics />} />
                  <Route path="/super-admin/security" element={<SuperAdminSecurity />} />
                  <Route path="/super-admin/delivery" element={<SuperAdminDelivery />} />
                  <Route path="/super-admin/storage-analytics" element={<SuperAdminStorage />} />
                  <Route path="/super-admin/profitability" element={<SuperAdminProfitability />} />
                  <Route path="/super-admin/face-ops" element={<SuperAdminFaceOps />} />
                  <Route path="/super-admin/providers" element={<SuperAdminProviders />} />
                </Route>
                <Route path="/checkout" element={<WeddingCheckout />} />

                {/* Dynamic Event Engine (Ganesh + future event types). Guarded
                    like every studio page; backend flag decides availability. */}
                <Route path="/events" element={<RequireBuyer><EventsDashboard /></RequireBuyer>} />
                <Route path="/events/:eventId/builder" element={<RequireBuyer><EventBuilder /></RequireBuyer>} />

                {/* June 2026 — Studio backup storage (photographer dashboard). */}
                <Route path="/studio/studio-storage" element={<RequireStudio><StudioStoragePage /></RequireStudio>} />
                <Route path="/studio/plans" element={<RequireStudio><StudioPlansPage /></RequireStudio>} />
                <Route path="/studio/community" element={<RequireStudio><PixoraCommunity /></RequireStudio>} />
                <Route path="/studio/pixora-analytics" element={<RequireStudio><StudioContentAnalytics /></RequireStudio>} />
                <Route path="/studio/cloud-backup" element={<RequireStudio><CloudBackupManager /></RequireStudio>} />
                <Route path="/studio/cloud-backup/legacy" element={<RequireStudio><CloudBackup /></RequireStudio>} />

                {/* Photographer Admin */}
                <Route path="/admin/*" element={<RedirectAdminToStudio />} />
                <Route path="/studio/login" element={<AdminLogin />} />
                <Route path="/studio/signup" element={<AdminSignup />} />
                {/* Photographer's-client portal — its own login tab + scoped dashboard */}
                <Route path="/studio/client/login" element={<Navigate to="/studio/login?tab=client" replace />} />
                <Route path="/studio/client" element={<ClientDashboard />} />
                <Route path="/studio/dashboard" element={<RequireStudio><LuxuryDashboard /></RequireStudio>} />
                {/* Photographer Panel modules (Parts 7–14) */}
                <Route path="/studio/portfolio" element={<RequireStudio><PhotographerPortfolio /></RequireStudio>} />
                <Route path="/studio/portfolio/premium" element={<RequireStudio><PortfolioBuildRequest /></RequireStudio>} />
                <Route path="/studio/wedding/:id" element={<RequireStudio><StudioWeddingDetail /></RequireStudio>} />
                <Route path="/studio/designs" element={<RequireStudio><StudioDesigns /></RequireStudio>} />
                <Route path="/studio/calendar" element={<RequireStudio><OccupancyCalendar /></RequireStudio>} />
                <Route path="/studio/themes" element={<RequireStudio><PhotographerThemes /></RequireStudio>} />
                <Route path="/photographer/:id/portfolio" element={<PublicPhotographerProfile />} />
                <Route path="/p/:username" element={<PixoraPublicProfile />} />
                <Route path="/community" element={<PublicCommunity />} />
                {/* Full-screen, interest-personalised Reels player (public). */}
                <Route path="/community/reels" element={<PixoraReels />} />
                {/* Clickable hashtag page (C2). */}
                <Route path="/community/tag/:tag" element={<HashtagPage />} />
                {/* Public founding-aware portfolio + storage pricing. */}
                <Route path="/portfolio-plans" element={<PortfolioPricingPage />} />
                <Route path="/studio/category-selector" element={<RequireStudio><EventCategorySelector /></RequireStudio>} />
                <Route path="/studio/celebration/new" element={<RequireStudio><CelebrationProfileForm /></RequireStudio>} />
                <Route path="/studio/celebration/:profileId/edit" element={<RequireStudio><CelebrationProfileForm /></RequireStudio>} />
                <Route path="/user/celebration/new" element={<CelebrationProfileForm />} />
                <Route path="/user/celebration/:profileId/edit" element={<CelebrationProfileForm />} />
                {/* BUG J — Normal user wedding edit (uses PATCH /api/users/profiles/{id}). */}
                <Route path="/user/profile/:profileId/edit" element={<UserWeddingEditPage />} />
                {/* Part 2: Trash feature removed — redirect any old links to the dashboard. */}
                <Route path="/studio/dashboard/trash" element={<Navigate to="/studio/dashboard" replace />} />

                {/* Wedding Editor (luxury wizard) */}
                <Route path="/studio/profile/new" element={<RequireStudio><LuxuryProfileForm /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/edit" element={<RequireStudio><LuxuryProfileForm /></RequireStudio>} />
                <Route path="/studio/wedding/:weddingId/edit" element={<RequireStudio><LuxuryProfileForm /></RequireStudio>} />

                {/* Per-event Invitation Link Wizard */}
                {/* "Client" — the client's login + the booking's budget. This
                    replaced the per-ceremony link composer here on the owner's
                    instruction; the composer still lives at /event-links. */}
                <Route path="/studio/profile/:profileId/invitations" element={<RequireStudio><ClientHubPage /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/client" element={<RequireStudio><ClientHubPage /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/event-links" element={<RequireStudio><EventInvitationWizard /></RequireStudio>} />

                {/* Functional sub-pages (unchanged) */}
                <Route path="/studio/profile/:profileId/rsvps" element={<RequireStudio><RSVPManagement /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/guests" element={<RequireStudio><GuestListManager /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/analytics" element={<RequireStudio><Phase30AnalyticsPage /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/greetings" element={<RequireStudio><GreetingsManagement /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/wishes" element={<RequireStudio><WishesManagement /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/post-wedding" element={<RequireStudio><PostWeddingManagement /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/qr-codes" element={<RequireStudio><QRCodeManagement /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/referrals" element={<Navigate to="/studio/dashboard" replace />} />
                <Route path="/studio/profile/:profileId/theme-settings" element={<RequireStudio><ThemeSettingsPage /></RequireStudio>} />
                <Route path="/studio/audit-logs" element={<RequireStudio><AuditLogsPage /></RequireStudio>} />
                <Route path="/studio/security" element={<RequireStudio><StudioSecurity /></RequireStudio>} />
                <Route path="/studio/earnings" element={<RequireStudio><StudioEarnings /></RequireStudio>} />
                <Route path="/studio/insights" element={<RequireStudio><StudioInsights /></RequireStudio>} />
                <Route path="/studio/messages" element={<RequireStudio><StudioMessages /></RequireStudio>} />
                <Route path="/studio/staff" element={<RequireStudio><StudioStaff /></RequireStudio>} />
                <Route path="/studio/staff/accept" element={<RequireStudio><StudioStaffAccept /></RequireStudio>} />
                <Route path="/studio/client-work" element={<RequireStudio><StudioClientWork /></RequireStudio>} />

                {/* Phase 38 — premium features */}
                <Route path="/studio/profile/:profileId/live-gallery" element={<RequireStudio><LiveGalleryManagement /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/whatsapp" element={<RequireStudio><WhatsAppManager /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/shagun" element={<RequireStudio><DigitalShagunSettings /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/gifts" element={<RequireStudio><GiftRegistryEditor /></RequireStudio>} />
                <Route path="/studio/profile/:profileId/gallery" element={<RequireStudio><GalleryManager /></RequireStudio>} />
                <Route path="/live/:profileId" element={<PhotographerLiveMode />} />
                <Route path="/invite/:slug/live-gallery" element={<LivePhotoWall />} />

                {/* Monetization: the /super-admin/* pages moved up into the
                    <PanelMain> layout route (see "Super Admin" above). */}
                {/* Phase 1d: credits removed — subscriptions replace them. Redirect to Plans. */}
                <Route path="/studio/credits/top-up" element={<Navigate to="/plans" replace />} />
                <Route path="/account/credits" element={<Navigate to="/plans" replace />} />
                <Route path="/credits" element={<Navigate to="/plans" replace />} />
                <Route path="/purchase" element={<Navigate to="/plans" replace />} />

                {/* Normal-user (wedding-couple) flows */}
                <Route path="/cart" element={<CartPage />} />
                <Route path="/order/:orderId/details" element={<OrderDetailsForm />} />
                <Route path="/order/pending" element={<PendingOrders />} />
                <Route path="/designs" element={<StudioDesigns />} />
                <Route path="/studio/build-queue" element={<RequireStudio><AdminBuildQueue /></RequireStudio>} />
                <Route path="/user/dashboard" element={<UserDashboard />} />
                <Route path="/user/profile" element={<UserProfile />} />
                {/* Legacy credit/self-edit flows retired -> redirect to the new browse->cart flow. */}
                <Route path="/user/buy-credits" element={<Navigate to="/cart" replace />} />
                <Route path="/user/create-invitation" element={<Navigate to="/themes" replace />} />
                <Route path="/user/create-invitation/:themeId/:event/:designId" element={<Navigate to="/themes" replace />} />
                <Route path="/user/buy-theme/:themeId" element={<Navigate to="/themes" replace />} />
                <Route path="/user/buy-design/:themeId/:event/:designId" element={<Navigate to="/themes" replace />} />
                <Route path="/user/buy-celebration/:category/:designId" element={<Navigate to="/themes" replace />} />
                <Route path="/user/profile/:profileId/live-gallery" element={<UserLiveGalleryManagement />} />
                {/* "About the community" — the explainer half of /community.
                    NOTE: this used to also be mounted at "/community", which the
                    earlier <Route path="/community"> already matched, so it was dead
                    code. It now has its own path and is linked from the hub. */}
                <Route path="/community/about" element={<AboutCommunity />} />
                {/* Phase 9 — WebGL 3D invitation experience showcase */}
                <Route path="/experience/demo" element={<Experience3DDemo />} />
                {/* Phase 10 — studio white-label branding editor */}
                <Route path="/studio/white-label" element={<RequireStudio><StudioWhiteLabel /></RequireStudio>} />
                {/* catch-all 404 — never render a blank screen on an unknown URL */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </RouteTransition>
              </Suspense>
              {/* One-tap Back + Home on EVERY user/public route (hidden on "/"
                  and on the authed panels, which have their own nav). */}
              <GlobalBackButton />
              <GlobalHomeButton />
              {/* GDPR/DPDP cookie-consent banner — analytics/marketing stay OFF
                  until the visitor opts in; the choice is recorded server-side. */}
              <CookieConsent />
              </BrowserRouter>
            </div>
          </AnimationProvider>
          </CartProvider>
          </ClientAuthProvider>
          </UserAuthProvider>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
