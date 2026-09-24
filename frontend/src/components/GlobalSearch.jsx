// GlobalSearch (Phase 6) — one search box across the whole community:
// photographers, posts, marketplace resources, vendors and the Learning Hub.
// Self-contained (fetches /api/pixora/search); renders nothing until the user
// types, so it can never disturb the surrounding page.
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Search, Camera, MessageCircle, ShoppingBag, Store, GraduationCap, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const GROUPS = [
  { key: 'photographers', label: 'Photographers', icon: Camera },
  { key: 'posts', label: 'Posts', icon: MessageCircle },
  { key: 'resources', label: 'Resources', icon: ShoppingBag },
  { key: 'vendors', label: 'Vendors', icon: Store },
  { key: 'learning', label: 'Learning Hub', icon: GraduationCap },
];

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (!query) { setRes(null); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(() => {
      axios.get(`${API_URL}/api/pixora/search`, { params: { q: query }, headers: authHeaders() })
        .then(({ data }) => setRes(data)).catch(() => setRes({ results: {}, total: 0 }))
        .finally(() => setLoading(false));
    }, 300);
    return () => timer.current && clearTimeout(timer.current);
  }, [q]);

  const results = res?.results || {};
  return (
    <div className="lux-glass p-4" data-testid="global-search">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="global-search-input"
          placeholder="Search photographers, posts, resources, vendors, learning…"
          className="w-full pl-10 pr-9 py-2.5 rounded-lg bg-transparent outline-none text-sm"
          style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: '#E8C97A' }} />}
      </div>

      {res && (
        res.total === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: 'var(--lux-text-muted)' }} data-testid="global-search-empty">
            No results for “{q}”.
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {GROUPS.map((g) => {
              const items = results[g.key] || [];
              if (!items.length) return null;
              const I = g.icon;
              return (
                <div key={g.key} data-testid={`search-group-${g.key}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <I className="w-3.5 h-3.5" style={{ color: '#E8C97A' }} />
                    <span className="lux-eyebrow">{g.label} ({items.length})</span>
                  </div>
                  <div className="space-y-1">
                    {items.map((it) => <ResultRow key={`${g.key}-${it.id}`} group={g.key} it={it} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

function ResultRow({ group, it }) {
  const title = it.name || it.title || 'Untitled';
  const sub = it.city || it.category || it.kind || it.level || it.author || '';
  const inner = (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg hover:scale-[1.005] transition-transform"
      style={{ background: 'var(--lux-panel)' }}>
      <span className="text-sm truncate" style={{ color: 'var(--lux-text)' }}>{title}</span>
      {sub ? <span className="text-[11px] shrink-0" style={{ color: 'var(--lux-text-faint)' }}>{sub}</span> : null}
    </div>
  );
  // Photographers deep-link to their public profile; other rows are informational.
  if (group === 'photographers' && it.url) {
    return <a href={it.url} className="block" data-testid={`search-result-${it.id}`}>{inner}</a>;
  }
  return <div data-testid={`search-result-${it.id}`}>{inner}</div>;
}
