import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUserAuth } from '@/context/UserAuthContext';
import Seo from '@/components/Seo';
// From PublicShell, NOT pages/LandingPage: importing them from the page pulled
// the entire landing module (+ masterThemes + all 10 theme chunks) into every
// page that only wanted a header and a footer.
import { Nav, Footer } from '@/components/PublicShell';
import { ScrollProgressBar } from '@/components/ScrollFX';
import '@/styles/luxury.css';

/**
 * Shared public-site chrome — the same top Nav, scroll progress bar and Footer
 * on every marketing route (Features / Plans / FAQ / Story), so the nav tabs
 * persist and users navigate by route instead of scrolling one long page.
 *
 * Sign-in is delegated to the home page's auth modal via /?signin=1 (keeps the
 * heavy modal in one place); cart + dashboard route directly.
 */
export default function PublicChrome({ children, title, description }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useUserAuth();

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  return (
    <div className="luxe relative" style={{ minHeight: '100vh', overflow: 'visible' }}>
      {/* Per-route SEO: unique title/description + canonical + OG overrides
          (route-split marketing pages otherwise share the index shell's meta). */}
      <Seo title={title} description={description} path={location.pathname} />
      <ScrollProgressBar />
      <Nav
        onLogin={() => navigate('/studio/login')}
        user={user}
        onOpenAuth={() => navigate('/?signin=1')}
        onLogout={async () => { await logout(); navigate('/'); }}
        onUserDashboard={() => navigate('/user/dashboard')}
        onBuyCredits={() => navigate('/cart')}
      />
      <main id="main-content" tabIndex={-1} className="pt-24 md:pt-28">{children}</main>
      <Footer onSuperAdmin={() => navigate('/super-admin/login')} />
    </div>
  );
}
