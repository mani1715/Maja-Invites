import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';

/**
 * ClientAuthContext — auth for a "photographer's client" (the couple/family
 * given a per-invitation login). Deliberately ISOLATED from AuthContext:
 *   • token lives in localStorage.client_token (NOT admin_token)
 *   • all calls go through a dedicated axios instance whose interceptor forces
 *     the client token, so it never clobbers (or is clobbered by) the global
 *     axios Authorization default the photographer session sets.
 */
const ClientAuthContext = createContext();
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export const ClientAuthProvider = ({ children }) => {
  const [clientToken, setClientToken] = useState(() => localStorage.getItem('client_token'));
  const [event, setEvent] = useState(null);       // { profile_id, slug, couple, ... }
  const [loading, setLoading] = useState(true);

  // A private axios instance — always sends the CURRENT client token, and never
  // relies on axios.defaults (which the photographer AuthContext owns).
  const clientApi = useMemo(() => {
    const inst = axios.create({ baseURL: API_URL });
    inst.interceptors.request.use((config) => {
      const t = localStorage.getItem('client_token');
      config.headers = config.headers || {};
      if (t) config.headers.Authorization = `Bearer ${t}`;
      else delete config.headers.Authorization;
      return config;
    });
    return inst;
  }, []);

  // Boot: if a token exists, confirm it by loading the event overview.
  useEffect(() => {
    let mounted = true;
    const boot = async () => {
      const t = localStorage.getItem('client_token');
      if (!t) { if (mounted) setLoading(false); return; }
      try {
        const { data } = await clientApi.get('/api/client/overview', { timeout: 10000 });
        if (mounted) setEvent(data);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          localStorage.removeItem('client_token');
          if (mounted) { setClientToken(null); setEvent(null); }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    boot();
    return () => { mounted = false; };
  }, [clientApi]);

  const clientLogin = useCallback(async (username, password) => {
    try {
      const { data } = await clientApi.post('/api/client/login', { username, password });
      if (data?.token) {
        localStorage.setItem('client_token', data.token);
        setClientToken(data.token);
        setEvent(data.event || null);
        return { success: true, event: data.event };
      }
      return { success: false, error: 'Login failed' };
    } catch (err) {
      return { success: false, error: err?.response?.data?.detail || 'Invalid username or password.' };
    }
  }, [clientApi]);

  const clientLogout = useCallback(() => {
    localStorage.removeItem('client_token');
    setClientToken(null);
    setEvent(null);
  }, []);

  const refreshOverview = useCallback(async () => {
    try {
      const { data } = await clientApi.get('/api/client/overview');
      setEvent(data);
      return data;
    } catch (_) { return null; }
  }, [clientApi]);

  return (
    <ClientAuthContext.Provider value={{
      clientToken, isClient: !!clientToken, event, loading,
      clientApi, clientLogin, clientLogout, refreshOverview,
    }}>
      {children}
    </ClientAuthContext.Provider>
  );
};

export const useClientAuth = () => {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error('useClientAuth must be used within ClientAuthProvider');
  return ctx;
};
