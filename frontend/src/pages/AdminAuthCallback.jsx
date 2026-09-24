import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

/**
 * Handles redirects from Supabase magic-link / OAuth / email-verification.
 * Supabase puts the access_token in either:
 *   - the URL hash (#access_token=...&refresh_token=...) for legacy flows
 *   - or as ?code=... for PKCE flows (which our client uses)
 * The supabase-js client handles both automatically (detectSessionInUrl: true).
 * Once the session lands, we bridge it to the legacy admin token via
 * `completeSupabaseSignup` (idempotent — uses /api/auth/sync-supabase-user).
 */
const AdminAuthCallback = () => {
  const navigate = useNavigate();
  const { completeSupabaseSignup } = useAuth();
  const hasProcessed = useRef(false);
  const [status, setStatus] = useState('Verifying your sign-in…');

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const run = async () => {
      try {
        // Give supabase-js a moment to consume the URL fragment / ?code= param
        let attempts = 0;
        let session = null;
        while (attempts < 20) {
          const { data } = await supabase.auth.getSession();
          if (data?.session) {
            session = data.session;
            break;
          }
          attempts += 1;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 150));
        }
        if (!session) {
          setStatus('Could not establish a session. Returning to login…');
          setTimeout(() => navigate('/studio/login', { replace: true }), 1200);
          return;
        }

        setStatus('Linking your account…');
        // Pull `name` from Supabase user_metadata (set during signup)
        const sbUser = session.user;
        const profile = {
          name: sbUser?.user_metadata?.name || sbUser?.email?.split('@')[0] || '',
        };
        const admin = await completeSupabaseSignup(profile, session);
        if (admin) {
          setStatus('Welcome back! Redirecting…');
          // Clean up URL fragment / query params
          window.history.replaceState({}, '', '/');
          // Route by role
          const target = admin.role === 'super_admin' ? '/super-admin/dashboard' : '/studio/dashboard';
          setTimeout(() => navigate(target, { replace: true }), 400);
          return;
        }
        setStatus('Sign-in succeeded but linking failed. Try again.');
        setTimeout(() => navigate('/studio/login', { replace: true }), 1500);
      } catch (e) {
        setStatus('Sign-in failed. Returning to login…');
        setTimeout(() => navigate('/studio/login', { replace: true }), 1500);
      }
    };
    run();
  }, [navigate, completeSupabaseSignup]);

  return (
    <div className="luxe min-h-screen grid place-items-center px-6" data-testid="admin-auth-callback">
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

export default AdminAuthCallback;
