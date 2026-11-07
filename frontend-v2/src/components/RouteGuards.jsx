import { useState } from 'react';
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
  return <div className="mj-loader" role="status">Checking your session…</div>;
}

/** Studio/photographer surfaces — requires the admin Bearer identity. */
export function RequireStudio({ children }) {
  const { admin, loading, token } = useAuth();
  const location = useLocation();
  if (loading) return <GuardLoader />;
  if (!admin && !token) {
    return <Navigate to="/auth" replace state={{ from: location.pathname, persona: 'studio' }} />;
  }
  if (!admin) return <SessionRecovery />;
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
  if (!admin) return <SessionRecovery />;
  return children;
}

function SessionRecovery() {
  const { refresh, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Your session could not be verified. Retry without losing your sign-in.');
  return <main className="px-recovery"><p className="px-kicker">Connection interrupted</p><h1>Let’s reconnect your workspace.</h1><p role="status">{message}</p><div><button disabled={busy} onClick={async () => { setBusy(true); const result = await refresh(); setBusy(false); if (!result) setMessage('Still unable to connect. Please try again shortly.'); }}>{busy ? 'Connecting…' : 'Retry connection'}</button><button onClick={logout}>Sign out</button></div></main>;
}
