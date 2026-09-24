/**
 * usePricing — Single source of truth for credit costs across the app.
 *
 * Fetches `/api/public/pricing/effective?audience=...` which is populated
 * by the Super-Admin Pricing Hub (`/super-admin/pricing`). Whenever an admin
 * updates a row in the hub, this hook reflects the change on the next
 * page-load (no app rebuild, no cache).
 *
 *   const pricing = usePricing('normal_user');   // or 'photographer'
 *   pricing.themes[themeId]                       // theme cost in credits
 *   pricing.designs[`${themeId}__${designKey}`]   // per-design cost
 *   pricing.options[optionKey]                    // { credits, is_free }
 *   pricing.packs                                 // [{ credits, price, label }]
 *   pricing.plans                                 // photographer-only monthly plans
 *   pricing.postSub                               // photographer post-sub config
 *
 * For surfaces that prefer never to suspend, every map exposes a
 * `themeCost(themeId, fallback)` / `optionCredits(key, fallback)` helper
 * that falls back to the legacy hardcoded value if the API is still loading
 * or the row is missing.
 */
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Module-level cache so multiple components share one network call per audience.
const _cache = new Map(); // audience -> { data, fetchedAt }
const TTL_MS = 30_000;    // refetch at most every 30s

async function _fetch(audience) {
  const res = await axios.get(`${API_URL}/api/public/pricing/effective`, {
    params: { audience },
  });
  return res.data;
}

const EMPTY = {
  audience: '',
  themes: {},
  designs: {},
  options: {},
  packs: [],
  plans: [],
  post_sub: null,
};

export function usePricing(audience = 'normal_user') {
  const [data, setData] = useState(() => {
    const c = _cache.get(audience);
    return c?.data || EMPTY;
  });
  const [loading, setLoading] = useState(() => !_cache.get(audience));
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const fresh = await _fetch(audience);
      _cache.set(audience, { data: fresh, fetchedAt: Date.now() });
      setData(fresh);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [audience]);

  useEffect(() => {
    let cancelled = false;
    const cached = _cache.get(audience);
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      if (!cancelled) {
        setData(cached.data);
        setLoading(false);
      }
      return () => { cancelled = true; };
    }
    refresh();
    return () => { cancelled = true; };
  }, [audience, refresh]);

  // Convenient lookup helpers with fallbacks.
  const themeCost = (themeId, fallback = 1) => {
    const v = data?.themes?.[themeId];
    return (typeof v === 'number') ? v : fallback;
  };
  const designCost = (themeId, designKey, fallback = null) => {
    const v = data?.designs?.[`${themeId}__${designKey}`];
    return (typeof v === 'number') ? v : fallback;
  };
  const optionCredits = (optionKey, fallback = 0) => {
    const row = data?.options?.[optionKey];
    if (!row) return fallback;
    if (row.is_free) return 0;
    return (typeof row.credits === 'number') ? row.credits : fallback;
  };
  const optionIsFree = (optionKey, fallback = false) => {
    const row = data?.options?.[optionKey];
    return row ? !!row.is_free : fallback;
  };

  return {
    ...data,
    postSub: data?.post_sub || null,
    featurePacks: data?.feature_packs || [],
    loading,
    error,
    refresh,
    themeCost,
    designCost,
    optionCredits,
    optionIsFree,
  };
}

export default usePricing;
