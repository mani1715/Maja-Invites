import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Empty, useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/StudioModule';
import * as api from '@/api/studioOps';

// Audit trail. Every profile create/edit/publish/delete already writes an
// audit record (log_audit_action); nothing could read them. This is the screen
// you open when a couple insists they never asked for a change.

export default function StudioAuditLogs() {
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useAsync(
    () => api.auditLogs({ limit: 200 }).then((r) => r.data),
  );

  const all = data?.logs || data?.items || (Array.isArray(data) ? data : []);
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? all.filter((l) => [l.action, l.profile_slug, l.admin_email, l.admin_id, JSON.stringify(l.details || {})]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)))
    : all;

  return (
    <StudioModule
      active="Audit logs"
      title="Audit log"
      sub="Who changed what, and when. Retained for two years."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Entries', value: loading ? '—' : numberFmt.format(all.length), hint: 'Most recent 200' },
        { label: 'Showing', value: loading ? '—' : numberFmt.format(rows.length) },
        { label: 'Latest', value: loading ? '—' : (all[0] ? relTime(all[0].created_at) : '—') },
      ]}
      />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <Panel title="Activity" pad={false}>
          <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--mj-border)' }}>
            <input
              className="wmod-input"
              data-mj-field
              style={{ maxWidth: 320, minHeight: 42 }}
              placeholder="Search action, wedding, person…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search the audit log"
            />
          </div>

          {all.length === 0 ? (
            <Empty title="Nothing logged yet" body="Actions appear here as you and your team create and change weddings." />
          ) : rows.length === 0 ? (
            <Empty title="No matches" body={`Nothing for "${q}".`} />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead>
                  <tr><th>When</th><th>Action</th><th>Wedding</th><th>By</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {rows.map((l, i) => (
                    <tr key={l.id || i}>
                      <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{relTime(l.created_at)}</td>
                      <td><code style={{ fontSize: 12 }}>{l.action}</code></td>
                      <td className="wmod-td-muted">{l.profile_slug || l.profile_id || '—'}</td>
                      <td className="wmod-td-muted">{l.admin_email || l.admin_id || '—'}</td>
                      <td className="wmod-td-muted" style={{ maxWidth: 320, overflowWrap: 'anywhere', fontSize: 12.5 }}>
                        {l.details && Object.keys(l.details).length > 0
                          ? Object.entries(l.details).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </StudioModule>
  );
}
