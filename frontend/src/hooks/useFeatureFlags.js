// useFeatureFlags — Phase 11. Reads the public { key: enabled } flag map once.
// Gate experimental UI: const { flag } = useFeatureFlags(); if (flag('experience_3d')) …
import { useEffect, useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
let _cache = null; // module-level cache so we fetch once per session

export default function useFeatureFlags() {
  const [flags, setFlags] = useState(_cache);
  useEffect(() => {
    if (_cache) return;
    axios.get(`${API_URL}/api/feature-flags`)
      .then(({ data }) => { _cache = data?.flags || {}; setFlags(_cache); })
      .catch(() => { _cache = {}; setFlags(_cache); });
  }, []);
  return { flags: flags || {}, ready: flags !== null, flag: (k) => !!(flags || {})[k] };
}
