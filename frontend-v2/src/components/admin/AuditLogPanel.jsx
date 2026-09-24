import { useMemo, useState } from 'react';
import { Panel, Empty, useAsync, Loading, ErrorPanel } from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Platform-wide audit log. GET /admin/audit-logs (server.py ~4549) takes no
// query params and always returns the latest 1000 rows for the WHOLE
// platform — there is no per-studio scoping server-side despite
// StudioAuditLogs.jsx being the only other consumer, and no server-side
// filtering to build a UI on top of. So: fetch the fixed 1000-row window
// once, filter/paginate it here.
//
// Fields on AuditLogResponse: id, action, admin_id, profile_id,
// profile_slug, details, timestamp. No admin_email — extra="ignore" strips
// anything not on the model, so a raw row's admin_email (if any) never
// reaches this response.

const PAGE_SIZE = 25;

export default function AuditLogPanel() {
  const { data, error, loading, reload } = useAsync(() => api.auditLogs().then((r) => r.data));
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const all = data || [];
  const actions = useMemo(() => [...new Set(all.map((l) => l.action))].sort(), [all]);

  const fromTs = from ? new Date(from).getTime() : null;
  const toTs = to ? new Date(to).getTime() + 86400000 - 1 : null; // inclusive of the whole "to" day

  const rows = useMemo(() => {
    const needle = actor.trim().toLowerCase();
    return all.filter((l) => {
      if (needle && !String(l.admin_id || '').toLowerCase().includes(needle)) return false;
      if (action && l.action !== action) return false;
      const t = l.timestamp ? new Date(l.timestamp).getTime() : null;
      if (fromTs && (t === null || t < fromTs)) return false;
      if (toTs && (t === null || t > toTs)) return false;
      return true;
    });
  }, [all, actor, action, fromTs, toTs]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const resetFilters = () => { setActor(''); setAction(''); setFrom(''); setTo(''); setPage(0); };

  if (loading) return <Loading rows={2} />;
  if (error) return <ErrorPanel message={error} onRetry={reload} />;

  return (
    <Panel
      title="Platform activity"
      sub={`Latest ${all.length} logged actions across every studio and admin. Filter and page through them below.`}
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
      pad={false}
    >
      <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--mj-border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="wmod-field" style={{ flex: '1 1 180px' }}>
          <label className="wmod-label" htmlFor="al-actor">Actor (admin id)</label>
          <input id="al-actor" className="wmod-input" style={{ minHeight: 38 }} value={actor} onChange={(e) => { setActor(e.target.value); setPage(0); }} placeholder="Paste an admin id" />
        </div>
        <div className="wmod-field" style={{ flex: '0 0 200px' }}>
          <label className="wmod-label" htmlFor="al-action">Action</label>
          <select id="al-action" className="wmod-input" style={{ minHeight: 38 }} value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }}>
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="wmod-field" style={{ flex: '0 0 150px' }}>
          <label className="wmod-label" htmlFor="al-from">From</label>
          <input id="al-from" className="wmod-input" style={{ minHeight: 38 }} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
        </div>
        <div className="wmod-field" style={{ flex: '0 0 150px' }}>
          <label className="wmod-label" htmlFor="al-to">To</label>
          <input id="al-to" className="wmod-input" style={{ minHeight: 38 }} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
        </div>
        {(actor || action || from || to) && (
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={resetFilters}>Clear filters</button>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty title="No matching entries" body="Nothing logged in that range, or the filters are too narrow." />
      ) : (
        <>
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead>
                <tr><th>When</th><th>Action</th><th>Actor</th><th>Wedding</th><th>Details</th></tr>
              </thead>
              <tbody>
                {pageRows.map((l, i) => (
                  <tr key={l.id || i}>
                    <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>
                      {l.timestamp ? new Date(l.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td><code style={{ fontSize: 12 }}>{l.action}</code></td>
                    <td className="wmod-td-muted">{l.admin_id || '—'}</td>
                    <td className="wmod-td-muted">{l.profile_slug || l.profile_id || '—'}</td>
                    <td className="wmod-td-muted" style={{ maxWidth: 320, overflowWrap: 'anywhere', fontSize: 12.5 }}>
                      {l.details && typeof l.details === 'object' && Object.keys(l.details).length > 0
                        ? Object.entries(l.details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
                        : (l.details || '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px' }}>
            <span style={{ fontSize: 12.5, color: 'var(--mj-muted)' }}>
              {rows.length} matching · page {page + 1} of {pageCount}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
