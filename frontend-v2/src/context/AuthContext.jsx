import { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import client from '@/api/client';

// Admin/photographer auth. Ported from legacy frontend/src/context/AuthContext.js
// with every hard-won behavior kept verbatim (see docs/recon/recon-frontend-logic.md
// §16) EXCEPT the Supabase bridge, which this app does not use — plain FastAPI
// login only (`POST /api/auth/login` / `GET /api/auth/me`). The single-flight
// 401 refresh + hadBearer guard now live in @/api/client's own interceptor, so
// this context just reacts to the 'maja:logout' event it dispatches on a
// genuine refresh failure, instead of owning axios.defaults itself.
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  // Guarded: localStorage THROWS in Safari private mode / when storage is
  // blocked, and this runs during render — unguarded it takes the whole
  // provider down before anything can handle it.
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem('admin_token'); } catch (_) { return null; }
  });

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    const onLogout = () => { setToken(null); setAdmin(null); };
    window.addEventListener('maja:logout', onLogout);
    return () => window.removeEventListener('maja:logout', onLogout);
  }, []);

  const fetchAdminInfo = useCallback(async () => {
    try {
      const response = await client.get('/api/auth/me', { timeout: 10000 });
      setAdmin(response.data);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch admin info:', error);
      // Don't auto-logout here — caller decides. Just return null.
      return null;
    }
  }, []);

  // Boot: legacy admin_token → /api/auth/me, retried on transient failure.
  useEffect(() => {
    let mounted = true;

    // Last-resort watchdog. Whatever hangs below, the app must stop showing a
    // loading state forever — a stuck `loading` is what makes a reload look
    // like a dead page.
    const watchdog = setTimeout(() => {
      if (mounted) setLoading((was) => (was ? false : was));
    }, 15000);

    const boot = async () => {
      let legacy = null;
      try { legacy = localStorage.getItem('admin_token'); } catch (_) { legacy = null; }
      if (legacy) {
        // Retry transient failures (network blip / 5xx) up to 3 times so a
        // VALID session is never left with admin=null — that null is what
        // makes a guarded route bounce to login even though the token is
        // fine. Only a real 401/403 clears the token.
        let attempt = 0;
        while (mounted) {
          try {
            const response = await client.get('/api/auth/me', { timeout: 10000 });
            if (mounted) { setAdmin(response.data); setToken(legacy); }
            break;
          } catch (error) {
            const status = error?.response?.status;
            if (status === 401 || status === 403) {
              try { localStorage.removeItem('admin_token'); } catch (_) {}
              if (mounted) setToken(null);
              break;
            }
            if (mounted) setToken(legacy); // keep the session across restarts
            attempt += 1;
            if (attempt >= 3) break;
            await new Promise((r) => setTimeout(r, 400 * attempt));
          }
        }
      }
      if (mounted) setLoading(false);
    };

    boot();

    return () => {
      mounted = false;
      clearTimeout(watchdog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (emailOrUsername, password, totpCode) => {
    try {
      const response = await client.post('/api/auth/login', {
        username_or_email: emailOrUsername,
        password,
        ...(totpCode ? { totp_code: totpCode } : {}),
      });
      const { access_token, admin: nextAdmin } = response.data;
      try { localStorage.setItem('admin_token', access_token); } catch (_) {}
      setToken(access_token);
      setAdmin(nextAdmin);
      return { success: true, admin: nextAdmin };
    } catch (error) {
      const data = error.response?.data;
      // HTTPException(detail=<str>) sends {detail:"msg"}; HTTPException(detail=
      // {code,message}) (MFA_REQUIRED/MFA_INVALID) sends {detail:{code,message}}.
      const detail = data?.detail;
      const isObj = detail && typeof detail === 'object';
      return {
        success: false,
        error: (isObj ? detail.message : detail) || 'Login failed',
        code: isObj ? detail.code : undefined,
        status: error.response?.status,
        retryAfter: error.response?.headers?.['retry-after'],
      };
    }
  };

  const logout = async () => {
    try { await client.post('/api/auth/logout'); } catch (_) { /* ignore */ }
    try { localStorage.removeItem('admin_token'); } catch (_) {}
    setToken(null);
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, loading, token, login, logout, refresh: fetchAdminInfo }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
