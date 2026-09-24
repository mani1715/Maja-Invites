import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const AuthContext = createContext();

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  // Guarded: this runs during render, and localStorage THROWS in Safari private
  // mode / when storage is blocked. Unguarded it took the whole provider down
  // before anything could handle it. Every other read in the app is wrapped.
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem('admin_token'); } catch (_) { return null; }
  });

  // Mirror of `admin` for callbacks registered once with an empty dep array
  // (the Supabase auth listener) — they would otherwise read a stale null.
  const adminRef = useRef(null);
  useEffect(() => { adminRef.current = admin; }, [admin]);

  // Single-flight guard so concurrent 401s trigger ONE refresh, not a stampede.
  const refreshingRef = useRef(null);

  // Apply current legacy token to axios on mount + when it changes
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Silent access-token refresh. When a Bearer (photographer) request 401s
  // because the SHORT-LIVED access token expired, transparently exchange the
  // HttpOnly refresh cookie (maja_rt, set at login by issue_session) for a fresh
  // access token via /api/auth/refresh and retry the original request once. This
  // is what lets the access token be short-lived — a small XSS blast radius —
  // without logging photographers out every time it rotates. Couples use an
  // HttpOnly session cookie and never hit this path. Installed FIRST (before the
  // boot effect below) so even boot's /api/auth/me can self-heal on expiry.
  useEffect(() => {
    const doRefresh = () => {
      if (!refreshingRef.current) {
        refreshingRef.current = axios
          .post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true })
          .then(({ data }) => {
            const t = data?.access_token;
            if (t) {
              try { localStorage.setItem('admin_token', t); } catch (_) { /* private mode */ }
              axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
              setToken(t);
            }
            return t || null;
          })
          .finally(() => { refreshingRef.current = null; });
      }
      return refreshingRef.current;
    };

    const interceptorId = axios.interceptors.response.use(
      (r) => r,
      async (error) => {
        const { config, response } = error || {};
        if (!config || !response || response.status !== 401) return Promise.reject(error);
        const url = config.url || '';
        // Never refresh the refresh/login calls themselves; retry a request once.
        if (config._majaRetried || url.includes('/api/auth/refresh') || url.includes('/api/auth/login')) {
          return Promise.reject(error);
        }
        // Only Bearer (photographer/admin) requests have a maja_rt to refresh with.
        const hadBearer = !!((config.headers && (config.headers.Authorization || config.headers.authorization))
          || axios.defaults.headers.common['Authorization']);
        if (!hadBearer) return Promise.reject(error);
        config._majaRetried = true;
        try {
          const t = await doRefresh();
          if (!t) throw new Error('refresh returned no token');
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${t}`;
          return axios(config);   // replay the original request with the new token
        } catch (_e) {
          // Refresh genuinely failed → the session is over. Clear + let it bubble
          // so guards send the user to login (the honest outcome).
          try { localStorage.removeItem('admin_token'); } catch (_) { /* ignore */ }
          delete axios.defaults.headers.common['Authorization'];
          setToken(null);
          setAdmin(null);
          return Promise.reject(error);
        }
      }
    );
    return () => { axios.interceptors.response.eject(interceptorId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAdminInfo = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/auth/me`);
      setAdmin(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch admin info:', error);
      // Don't auto-logout here — caller decides. Just return null.
      return null;
    }
  }, []);

  // Bridge: when a Supabase session exists (e.g. user signed in via supabase-js
  // — email/password, magic link, Google later), exchange it for the legacy
  // admin token via /api/auth/me-supabase so the rest of the app keeps working.
  const hydrateFromSupabase = useCallback(async (sbSession) => {
    if (!sbSession?.access_token) return null;
    try {
      // Timeout for the same reason /api/auth/me has one (see boot below): with
      // no timeout, a backend that accepts the connection but never answers
      // leaves boot()'s await pending forever and `loading` never clears.
      const { data } = await axios.get(`${API_URL}/api/auth/me-supabase`, {
        headers: { Authorization: `Bearer ${sbSession.access_token}` },
        timeout: 10000,
      });
      // Drop the legacy app token into localStorage so existing axios calls work
      if (data?.access_token) {
        localStorage.setItem('admin_token', data.access_token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
        setToken(data.access_token);
      }
      if (data?.admin) setAdmin(data.admin);
      return data?.admin || null;
    } catch (err) {
      const detail = err?.response?.data?.detail;
      // 404 + error=no_admin_record → caller should send user to a "complete profile" form.
      if (err?.response?.status === 404 && detail?.error === 'no_admin_record') {
        return { needsSignup: true, supabaseUser: { id: detail.supabase_user_id, email: detail.email } };
      }
      console.warn('Supabase → backend bridge failed:', err?.response?.data || err.message);
      return null;
    }
  }, []);

  // Boot: prefer Supabase session, fall back to legacy token
  useEffect(() => {
    let mounted = true;

    // Last-resort watchdog. Whatever hangs below, the app must stop showing a
    // loading state forever — a stuck `loading` is what makes a reload look like
    // a dead page. Worst case the user lands on the login screen, which is
    // recoverable; an indefinite spinner is not.
    const watchdog = setTimeout(() => {
      if (mounted) setLoading((was) => (was ? false : was));
    }, 15000);

    const boot = async () => {
      // 1) Try Supabase first
      if (isSupabaseConfigured) {
        try {
          // getSession() waits on supabase-js's navigator.locks auth lock. If
          // another tab (or the onAuthStateChange handler below) holds that lock
          // against a slow backend, this never settles and catch{} cannot help —
          // a rejection is catchable, a pending promise is not. Race it.
          const { data: { session } } = await Promise.race([
            supabase.auth.getSession(),
            new Promise((_r, rej) => setTimeout(() => rej(new Error('getSession timed out')), 8000)),
          ]);
          if (session && mounted) {
            const result = await hydrateFromSupabase(session);
            if (result && !result.needsSignup) {
              setLoading(false);
              return;
            }
          }
        } catch (e) {
          console.warn('supabase.getSession failed:', e?.message);
        }
      }

      // 2) Fall back to legacy admin_token
      let legacy = null;
      try { legacy = localStorage.getItem('admin_token'); } catch (_) { legacy = null; }
      if (legacy) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${legacy}`;
        // Retry transient failures (network blip / 5xx) up to 3 times so a
        // VALID session is never left with admin=null. That null was the real
        // cause of "click an option → back to the login screen": on a page
        // reload the boot's /auth/me could hiccup, admin stayed null, and every
        // guarded page (super-admin dashboard, studio pages) bounced to login
        // even though the token was fine. Only a real 401/403 clears the token.
        let attempt = 0;
        while (mounted) {
          try {
            // Timeout is REQUIRED: axios has none by default, so a backend that
            // accepts the connection but never answers leaves this await pending
            // forever -> `loading` stays true -> every guarded route renders a
            // permanently blank page. A timeout turns that into a normal retry.
            const response = await axios.get(`${API_URL}/api/auth/me`, { timeout: 10000 });
            if (mounted) { setAdmin(response.data); setToken(legacy); }
            break;
          } catch (error) {
            const status = error?.response?.status;
            if (status === 401 || status === 403) {
              localStorage.removeItem('admin_token');
              delete axios.defaults.headers.common['Authorization'];
              setToken(null);
              break;
            }
            if (mounted) setToken(legacy); // keep the session across restarts
            attempt += 1;
            if (attempt >= 3) break;
            // small backoff before retrying the transient failure
            await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
      }
      if (mounted) setLoading(false);
    };

    boot();

    // 3) React to Supabase auth events (sign in via magic link, OAuth, etc.)
    let sub;
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (!mounted) return;
        if (event === 'SIGNED_IN' && session) {
          // Deliberately NOT awaited: supabase-js runs this callback while
          // holding its auth lock, so awaiting a network call here blocks every
          // other supabase call (including boot's getSession) for its duration.
          hydrateFromSupabase(session).catch(() => {});
        } else if (event === 'SIGNED_OUT') {
          // Only clear if our current admin came from supabase (has supabase_user_id).
          // Read through a ref: this effect has an empty dep array, so the `admin`
          // captured in this closure is forever the initial null and SIGNED_OUT
          // never cleared the legacy token.
          if (adminRef.current?.supabase_user_id) {
            try { localStorage.removeItem('admin_token'); } catch (_) {}
            delete axios.defaults.headers.common['Authorization'];
            setToken(null);
            setAdmin(null);
          }
        }
      });
      sub = data?.subscription;
    }

    return () => {
      mounted = false;
      clearTimeout(watchdog);
      try { sub?.unsubscribe?.(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  //   Public API
  // ---------------------------------------------------------------------------

  // Legacy email/password login (FastAPI). Still the default path for the
  // existing UI — Supabase login lives on the dedicated /auth pages.
  // `totpCode` is optional — only sent once the caller has been told
  // (via the MFA_REQUIRED code below) that the account needs a second factor.
  const login = async (emailOrUsername, password, totpCode) => {
    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        username_or_email: emailOrUsername,
        password,
        ...(totpCode ? { totp_code: totpCode } : {}),
      });
      const { access_token, admin: nextAdmin } = response.data;
      localStorage.setItem('admin_token', access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      setToken(access_token);
      setAdmin(nextAdmin);
      return { success: true, admin: nextAdmin };
    } catch (error) {
      const data = error.response?.data;
      // FastAPI's HTTPException(detail=<str>) sends {detail: "msg"}, but
      // HTTPException(detail={code, message}) (MFA_REQUIRED/MFA_INVALID) sends
      // {detail: {code, message}} — unwrap either shape.
      const detail = data?.detail;
      const isObj = detail && typeof detail === 'object';
      return {
        success: false,
        error: (isObj ? detail.message : detail) || 'Login failed',
        // 'MFA_REQUIRED' -> re-submit with totp_code; 'MFA_INVALID' -> bad code.
        code: isObj ? detail.code : undefined,
        status: error.response?.status,
        // 429 lockout: seconds until the caller may retry, if the backend sent one.
        retryAfter: error.response?.headers?.['retry-after'],
      };
    }
  };

  // Supabase email/password sign-in → bridge to admin record
  const loginWithSupabasePassword = async (email, password) => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Supabase is not configured' };
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { success: false, error: error.message };
      const result = await hydrateFromSupabase(data.session);
      if (result?.needsSignup) {
        return {
          success: false,
          needsSignup: true,
          supabaseUser: result.supabaseUser,
          error: 'No admin profile linked to this account. Complete signup first.',
        };
      }
      return { success: true, admin: result };
    } catch (err) {
      return { success: false, error: err.message || 'Supabase login failed' };
    }
  };

  // Supabase signup (email/password). The user must verify their email
  // unless email confirmations are disabled in Supabase. After verify, the
  // callback page calls completeSupabaseSignup() to create the admin row.
  const signupWithSupabase = async (email, password, name, extra = {}) => {
    if (!isSupabaseConfigured) return { success: false, error: 'Supabase is not configured' };
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/admin/auth/callback`,
          data: { name, ...extra },
        },
      });
      if (error) return { success: false, error: error.message };

      // If email-confirm is OFF, we already have a session — go ahead and
      // create the admin row immediately.
      if (data.session) {
        const synced = await completeSupabaseSignup({ name, ...extra }, data.session);
        if (synced) return { success: true, admin: synced, immediate: true };
      }
      return { success: true, requiresEmailVerification: !data.session };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  // After Supabase confirms the user (or returns from OAuth/magic link), make
  // sure they have a MongoDB admin row. Idempotent.
  const completeSupabaseSignup = async (profile = {}, sessionOverride = null) => {
    if (!isSupabaseConfigured) return null;
    let session = sessionOverride;
    if (!session) {
      const { data } = await supabase.auth.getSession();
      session = data?.session;
    }
    if (!session?.access_token) return null;

    try {
      const { data } = await axios.post(
        `${API_URL}/api/auth/sync-supabase-user`,
        profile,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      if (data?.access_token) {
        localStorage.setItem('admin_token', data.access_token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
        setToken(data.access_token);
      }
      if (data?.admin) setAdmin(data.admin);
      return data?.admin || null;
    } catch (err) {
      console.error('completeSupabaseSignup failed:', err?.response?.data || err.message);
      return null;
    }
  };

  // Helper kept for backward-compat with /signup pages that hit the legacy
  // /api/auth/register endpoint and get back { access_token, admin } already.
  const setSessionFromSignup = ({ access_token, admin: newAdmin }) => {
    localStorage.setItem('admin_token', access_token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    setToken(access_token);
    setAdmin(newAdmin);
  };

  const logout = async () => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (e) { /* ignore */ }
    localStorage.removeItem('admin_token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{
      admin,
      loading,
      token,
      login,
      loginWithSupabasePassword,
      signupWithSupabase,
      completeSupabaseSignup,
      setSessionFromSignup,
      logout,
      refresh: fetchAdminInfo,
      supabaseConfigured: isSupabaseConfigured,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
