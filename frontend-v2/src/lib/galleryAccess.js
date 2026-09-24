import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Ported from legacy hooks/useGalleryAccess.js. The legacy source already carries
// the fail-CLOSED fix (see its own "ponytail:" comment) — recon-frontend-logic.md
// §8 describes an older fail-open default that predates it; this port keeps the
// fail-closed behavior as-is.
const API_URL = import.meta.env.VITE_BACKEND_URL || '';

const lsKey = (slug) => `gallery_device_token_${slug}`;
const lsExpKey = (slug) => `gallery_device_exp_${slug}`;

/**
 * useGalleryAccess(slug)
 * Returns: { loading, privacy, deviceToken, isProtected, isUnlocked, unlock(code, remember),
 *            logout(), error, privacyFetchFailed, refresh }
 */
export function useGalleryAccess(slug) {
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(null);
  const [deviceToken, setDeviceToken] = useState(null);
  const [error, setError] = useState('');
  const [privacyFetchFailed, setPrivacyFetchFailed] = useState(false);

  const loadStored = useCallback(() => {
    try {
      const tok = localStorage.getItem(lsKey(slug));
      const exp = localStorage.getItem(lsExpKey(slug));
      if (tok && exp && Date.parse(exp) > Date.now()) {
        setDeviceToken(tok);
        return tok;
      }
      if (tok) {
        localStorage.removeItem(lsKey(slug));
        localStorage.removeItem(lsExpKey(slug));
      }
    } catch (e) { /* SSR / private mode — ignore */ }
    return null;
  }, [slug]);

  const fetchPrivacy = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await axios.get(`${API_URL}/api/public/gallery/${slug}/privacy`, { timeout: 10000 });
      setPrivacy(r.data);
      setPrivacyFetchFailed(false);
      loadStored();
    } catch (e) {
      // ponytail: fail CLOSED, not open. A backend blip must never render a
      // protected gallery as unlocked — assume protected until the privacy
      // fetch actually succeeds. The gallery lock screen shows a retry
      // affordance (privacyFetchFailed / refresh) since we can't tell the
      // guest their real access requirements right now.
      setPrivacy({
        enabled: true,
        is_protected: true,
        ai_face_match_enabled: true,
        allow_downloads: true,
        allow_share: true,
        public_highlights_enabled: true,
        private_full_gallery_enabled: true,
      });
      setPrivacyFetchFailed(true);
    } finally {
      setLoading(false);
    }
  }, [slug, loadStored]);

  useEffect(() => {
    if (slug) fetchPrivacy();
  }, [slug, fetchPrivacy]);

  const unlock = useCallback(async (code, remember = true) => {
    setError('');
    try {
      const r = await axios.post(
        `${API_URL}/api/public/gallery/${slug}/unlock`,
        { code, remember },
        { timeout: 10000 },
      );
      const token = r.data?.device_token;
      const exp = r.data?.expires_at;
      if (token) {
        setDeviceToken(token);
        if (remember && exp) {
          try {
            localStorage.setItem(lsKey(slug), token);
            localStorage.setItem(lsExpKey(slug), exp);
          } catch (e) { /* ignore quota errors */ }
        }
      }
      return r.data;
    } catch (e) {
      const detail = e.response?.data?.detail || 'Unlock failed';
      setError(typeof detail === 'string' ? detail : 'Unlock failed');
      const err = new Error(detail);
      err.status = e.response?.status;
      throw err;
    }
  }, [slug]);

  const logout = useCallback(() => {
    setDeviceToken(null);
    try {
      localStorage.removeItem(lsKey(slug));
      localStorage.removeItem(lsExpKey(slug));
    } catch (e) { /* ignore */ }
  }, [slug]);

  const isProtected = !!(privacy?.is_protected);
  const isUnlocked = !isProtected || !!deviceToken;

  return { loading, privacy, deviceToken, isProtected, isUnlocked, unlock, logout, error, privacyFetchFailed, refresh: fetchPrivacy };
}

/** Adds the device-token header on outbound requests. This exact header name is the contract. */
export const authHeader = (deviceToken) =>
  (deviceToken ? { 'X-Gallery-Device-Token': deviceToken } : {});
