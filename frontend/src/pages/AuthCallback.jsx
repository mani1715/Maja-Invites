import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Sparkles } from 'lucide-react';
import '@/styles/luxury.css';
import { markUserSessionActive, useUserAuth } from '@/context/UserAuthContext';

/**
 * Landing page after direct Google OAuth. The backend has already exchanged the
 * authorization code, created/updated the user, and set the `user_session_token`
 * cookie before redirecting here as `/auth/callback?next=<path>`.
 *
 * This component just refreshes the session (pulls /me so the header re-renders
 * signed-in) and routes the visitor to their intended destination.
 */
const AuthCallback = () => {
  const navigate = useNavigate();
  const { refresh } = useUserAuth();
  const hasProcessed = useRef(false);
  const [status, setStatus] = useState('Verifying your sign-in…');

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('error')) {
        setStatus('Sign-in failed. Returning home…');
        setTimeout(() => navigate('/'), 1200);
        return;
      }
      // Backend already set the session cookie; flag it and pull fresh /me.
      markUserSessionActive();
      try { await refresh(); } catch (_e) {}

      const rawNext = params.get('next') || '/';
      const nextRoute = (rawNext.startsWith('/') && !rawNext.startsWith('//')) ? rawNext : '/';
      navigate(nextRoute, { replace: true });
    };
    run();
  }, [navigate, refresh]);

  return (
    <div className="luxe min-h-screen grid place-items-center px-6" data-testid="auth-callback">
      <div className="lux-glass p-10 md:p-12 text-center max-w-md w-full">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
          style={{ background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)' }}>
          <Crown className="w-7 h-7" style={{ color: '#16110C' }} />
        </div>
        <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--lux-text)' }}>
          One <span className="text-gold italic font-script">moment.</span>
        </h1>
        <p className="text-sm mb-4 flex items-center justify-center gap-2" style={{ color: 'var(--lux-text)' }}>
          <Sparkles className="w-4 h-4 animate-pulse" style={{ color: '#D4AF37' }} />
          {status}
        </p>
      </div>
    </div>
  );
};

export default AuthCallback;
