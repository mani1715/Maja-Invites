import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/**
 * InvitationLinksPanel — EVERY invitation link that exists, in one place.
 *
 * The fulfillment console's "Events" list only shows paid orders that were
 * explicitly delivered, so invitations created straight from a studio/user
 * panel (most of them) never appeared anywhere in the admin. This panel is
 * backed by /api/admin/fulfillment/links, which walks `profiles` instead —
 * the actual home of every invitation — so nothing with a link can hide.
 *
 * Self-fetching so it can be dropped into any admin shell without wiring it
 * into that page's data/tab state.
 */
export default function InvitationLinksPanel({ compact = false }) {
  const [links, setLinks] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await axios.get(`${API}/api/admin/fulfillment/links`, { headers: authHeaders() });
      setLinks(data.links || []);
      setCounts({ total: data.total, published: data.published, from_orders: data.from_orders, from_panel: data.from_panel });
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not load invitation links');
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? links.filter((l) => [l.bride_name, l.groom_name, l.slug, l.fulfillment_code]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)))
    : links;

  return (
    <div className="lux-glass p-6" data-testid="invitation-links-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="font-display text-xl" style={{ color: 'var(--lux-text)' }}>Created Links</h3>
          <div className="text-xs mt-1" style={{ color: 'var(--lux-text-muted)' }} data-testid="links-counts">
            {counts.total ?? 0} total · {counts.published ?? 0} published · {counts.from_orders ?? 0} from orders · {counts.from_panel ?? 0} from panel
          </div>
        </div>
        {/* min-w-0 + a flexible input: a hard min-width here could not shrink
            and pushed the panel past the viewport on 280px-wide screens. */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <div className="relative flex-1 min-w-0" style={{ maxWidth: 260 }}>
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--lux-text-muted)' }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, slug or code"
              data-testid="links-search"
              className="w-full pl-8 pr-3 py-2 rounded-full text-xs outline-none"
              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
            />
          </div>
          <button onClick={load} className="lux-btn" data-testid="links-refresh" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }}>Loading links…</div>
      ) : err ? (
        <div className="py-6 text-center text-sm" style={{ color: '#F19A9A' }} data-testid="links-error">{err}</div>
      ) : shown.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--lux-text-muted)' }} data-testid="links-empty">
          {needle ? 'No links match that search.' : 'No invitation links yet.'}
        </div>
      ) : (
        <div className={`grid gap-3 ${compact ? 'md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
          {shown.map((l) => (
            <div
              key={l.profile_id}
              className="rounded-xl p-4"
              style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--lux-border)' }}
              data-testid={`link-card-${l.slug}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-display text-base" style={{ color: 'var(--lux-text)' }}>
                  {[l.bride_name, l.groom_name].filter(Boolean).join(' & ') || l.slug}
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={l.is_published
                    ? { background: 'rgba(16,185,129,0.18)', color: '#8FE3C2' }
                    : { background: 'rgba(212,175,55,0.18)', color: '#E8C766' }}
                >
                  {l.is_published ? 'published' : 'draft'}
                </span>
              </div>

              <div className="text-[11px] mt-1.5" style={{ color: 'var(--lux-text-muted)' }}>
                {l.owner_kind}
                {l.event_type ? ` · ${l.event_type}` : ''}
                {l.event_date ? ` · ${String(l.event_date).slice(0, 10)}` : ''}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--lux-text-muted)' }}>
                {l.source === 'order'
                  ? `order ${l.fulfillment_code || '—'}${l.build_status ? ` (${l.build_status})` : ''}`
                  : 'created in panel'}
              </div>

              <a
                href={l.live_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 text-[11px] underline break-all"
                style={{ color: '#E8C766' }}
                data-testid={`link-open-${l.slug}`}
              >
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
                {l.live_url}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
