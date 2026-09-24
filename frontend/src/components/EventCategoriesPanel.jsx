import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Link2, Copy, ExternalLink, ArrowRight, Loader2 } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHdr = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` } });

/**
 * EventCategoriesPanel (super-admin "Event Categories" tab) — every invitation
 * LINK that has been created (a paid order), across photographers + normal users.
 * Admin accepts/delivers a link from the Fulfillment console; delivering stamps
 * the live_url which updates that buyer's own panel (by order id / photographer id).
 */
const BUILD = {
  pending_info: { label: 'Awaiting details', tone: '#E8C97A' },
  building: { label: 'Building', tone: '#E8C97A' },
  delivered: { label: 'Delivered', tone: '#8ae08a' },
};

const EventCategoriesPanel = () => {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all'); // all | photographer | user

  useEffect(() => {
    axios.get(`${API_URL}/api/admin/fulfillment/requests`, authHdr())
      .then(({ data }) => setRows(data?.requests || []))
      .catch(() => setRows([]));
  }, []);

  const shown = useMemo(() => {
    if (!rows) return [];
    return filter === 'all' ? rows : rows.filter((r) => r.buyer_kind === filter);
  }, [rows, filter]);

  if (rows === null) {
    return <div className="lux-glass p-12 grid place-items-center" data-testid="event-categories-panel"><Loader2 className="w-7 h-7 animate-spin" style={{ color: '#D4AF37' }} /></div>;
  }

  return (
    <div className="lux-glass p-6 sm:p-8" data-testid="event-categories-panel">
      <div className="mb-5">
        <h3 className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>Created links</h3>
        <p className="text-sm" style={{ color: 'var(--lux-text-muted)' }}>
          Every invitation link created. Accept &amp; deliver in Fulfillment — the live link then shows in that buyer's own panel.
        </p>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[['all', 'All'], ['photographer', 'Photographers'], ['user', 'Normal users']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} data-testid={`links-filter-${k}`}
            className="px-3 py-1.5 rounded-full text-xs"
            style={filter === k ? { background: '#D4AF37', color: '#16110C', fontWeight: 600 } : { border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}>
            {l} {k === 'all' ? `· ${rows.length}` : `· ${rows.filter((r) => r.buyer_kind === k).length}`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: 'var(--lux-text-muted)' }}>No links created yet.</div>
      ) : (
        <div className="space-y-2" data-testid="links-list">
          {shown.map((r) => {
            const b = BUILD[r.build_status] || { label: r.build_status, tone: '#E8C97A' };
            return (
              <div key={r.code} className="rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
                style={{ border: '1px solid var(--lux-border)', background: 'var(--lux-panel)' }} data-testid={`link-row-${r.code}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--lux-text)' }}>
                    <Link2 className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />
                    <span className="font-mono">{r.code}</span>
                    <button onClick={() => navigator.clipboard?.writeText(r.code)} title="Copy"><Copy className="w-3 h-3" style={{ color: 'var(--lux-text-muted)' }} /></button>
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'var(--lux-panel)', color: 'var(--lux-text-muted)' }}>
                      {r.buyer_kind === 'photographer' ? 'Premium' : 'Normal'}
                    </span>
                  </div>
                  <div className="text-xs mt-1 truncate" style={{ color: 'var(--lux-text-muted)' }}>
                    {r.buyer?.name || r.buyer?.email || '—'} · {r.design_id || r.theme_id || 'design'} · {r.event_type || ''} · ₹{Number(r.amount_inr || 0).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs" style={{ color: b.tone }}>{b.label}</span>
                  {r.build_status === 'delivered' && r.live_url ? (
                    <a href={r.live_url} target="_blank" rel="noreferrer" className="lux-btn lux-btn-ghost text-xs">View <ExternalLink className="w-3 h-3" /></a>
                  ) : (
                    <button onClick={() => navigate('/super-admin/fulfillment')} className="lux-btn text-xs" data-testid={`link-accept-${r.code}`}>Accept &amp; deliver <ArrowRight className="w-3 h-3" /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EventCategoriesPanel;
