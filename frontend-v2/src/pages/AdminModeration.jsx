import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Community moderation. The public Pixora feed ships user-generated content
// with no moderation UI at all in the deployed app (audit H2) — reports were
// being filed into a queue nobody could open.
//
// Destructive actions (delete, suspend) are two-step: nothing here is
// reversible from the UI.

export default function AdminModeration() {
  const [selected, setSelected] = useState([]);
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.moderationReports({ status: 'open' }).then((r) => r.data),
      api.moderationAutoStatus().then((r) => r.data).catch(() => null),
    ]).then(([reports, auto]) => ({ reports, auto })),
  );

  const reports = data?.reports?.reports || data?.reports?.items || (Array.isArray(data?.reports) ? data.reports : []);
  const auto = data?.auto || {};

  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      setSelected([]);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That action did not complete.');
    } finally { setBusy(null); }
  };

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = reports.length > 0 && reports.every((r) => selected.includes(r.id));

  return (
    <AdminModule
      active="Moderation"
      title="Moderation"
      sub="Reports raised against community posts and accounts. Auto-screening catches the obvious cases; everything else needs a human."
      actions={(
        <>
          <button
            type="button"
            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
            onClick={() => run('rescreen', () => api.moderationRescreen(), 'Re-screen started.')}
            disabled={busy === 'rescreen'}
          >
            {busy === 'rescreen' ? 'Re-screening…' : 'Re-screen all'}
          </button>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>
        </>
      )}
    >
      <StatRow items={[
        { label: 'Open reports', value: loading ? '—' : numberFmt.format(reports.length) },
        { label: 'Auto-screening', value: loading ? '—' : (auto.enabled ? 'On' : 'Off'), hint: auto.last_run ? `last run ${relTime(auto.last_run)}` : undefined },
        { label: 'Auto-flagged', value: loading ? '—' : numberFmt.format(auto.flagged ?? 0) },
        { label: 'Selected', value: numberFmt.format(selected.length), hint: selected.length ? 'Bulk actions available' : undefined },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (reports.length === 0 ? (
        <Panel>
          <Empty
            title="Nothing reported"
            body="The community queue is clear. Reports from guests and studios land here for review."
          />
        </Panel>
      ) : (
        <Panel
          title="Open reports"
          sub="Dismiss clears the report and leaves the content up. Delete removes the content permanently."
          actions={selected.length > 0 ? (
            <>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                disabled={busy === 'dismiss'}
                onClick={() => run('dismiss', () => api.moderationResolve(selected, 'dismiss'), `${selected.length} report(s) dismissed.`)}
              >
                Dismiss {selected.length}
              </button>
              <ConfirmButton
                label={`Delete content (${selected.length})`}
                confirmLabel="Confirm — permanent"
                danger
                busy={busy === 'delete'}
                onConfirm={() => run('delete', () => api.moderationDelete(selected, 'post'), `${selected.length} item(s) deleted.`)}
              />
              <ConfirmButton
                label="Suspend authors"
                confirmLabel="Confirm suspend"
                danger
                busy={busy === 'suspend'}
                onConfirm={() => run('suspend', () => api.moderationAccountStatus(
                  reports.filter((r) => selected.includes(r.id)).map((r) => r.author_admin_id || r.admin_id).filter(Boolean),
                  'suspended',
                ), 'Accounts suspended.')}
              />
            </>
          ) : null}
          pad={false}
        >
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? [] : reports.map((r) => r.id))}
                      aria-label="Select all reports"
                      style={{ width: 18, height: 18, accentColor: 'var(--mj-primary)' }}
                    />
                  </th>
                  <th>Reported</th>
                  <th>Reason</th>
                  <th>Author</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`Select report ${r.id}`}
                        style={{ width: 18, height: 18, accentColor: 'var(--mj-primary)' }}
                      />
                    </td>
                    <td style={{ maxWidth: 300 }}>
                      <span className="wmod-pill wmod-pill--neutral">{r.target_kind || r.kind || 'post'}</span>
                      {(r.excerpt || r.content) && (
                        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--mj-muted)', overflowWrap: 'anywhere' }}>
                          {String(r.excerpt || r.content).slice(0, 160)}
                        </p>
                      )}
                    </td>
                    <td><span className="wmod-pill wmod-pill--maybe">{r.reason || 'unspecified'}</span></td>
                    <td className="wmod-td-muted">{r.author_name || r.author_admin_id || '—'}</td>
                    <td className="wmod-td-muted">{r.reporter_name || r.reported_by || '—'}</td>
                    <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{relTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}

      <Toast message={toast} />
    </AdminModule>
  );
}

function ConfirmButton({ label, confirmLabel, onConfirm, busy, danger }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className={`wmod-btn wmod-btn--sm ${danger ? 'wmod-btn--danger' : 'wmod-btn--ghost'}`} onClick={() => setArmed(true)}>
        {label}
      </button>
    );
  }
  return (
    <>
      <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" onClick={onConfirm} disabled={busy}>
        {busy ? 'Working…' : confirmLabel}
      </button>
      <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setArmed(false)} disabled={busy}>
        Cancel
      </button>
    </>
  );
}
