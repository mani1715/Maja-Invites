// Route guards for identity-protected surfaces.
//
// Without these, a signed-out visitor on /studio/* saw the page shell with
// every data tile in its "Unavailable" error state (the API 403s behind the
// scenes) instead of being taken to sign-in — found in the 2026-08-10
// runtime audit. While an auth context is still booting we render the
// shared loader, never a bare null (legacy trap: blank page on reload).
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

function GuardLoader() {
  return <div className="mj-loader">Checking your session…</div>;
}

/** Studio/photographer surfaces — requires the admin Bearer identity. */
export function RequireStudio({ children }) {
  const { admin, loading, token } = useAuth();
  const location = useLocation();
  if (loading) return <GuardLoader />;
  // token-but-no-admin means /auth/me is still unresolved after boot retries;
  // AuthContext only clears the token on a definitive 401/403, so treat a
  // surviving token as signed-in and let the page's own error states handle
  // a flaky backend rather than bouncing a valid session to the login page.
  if (!admin && !token) {
    return <Navigate to="/auth" replace state={{ from: location.pathname, persona: 'studio' }} />;
  }
  return children;
}

/** Platform console — requires the admin Bearer identity AND role==='super_admin'. */
export function RequireSuperAdmin({ children }) {
  const { admin, loading, token } = useAuth();
  const location = useLocation();
  if (loading) return <GuardLoader />;
  if (!admin && !token) {
    return <Navigate to="/auth" replace state={{ from: location.pathname, persona: 'studio' }} />;
  }
  if (admin && admin.role !== 'super_admin') {
    return <Navigate to="/studio/dashboard" replace />;
  }
  return children;
}
