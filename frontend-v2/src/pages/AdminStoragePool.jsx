import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Multi-drive storage pool — 20 endpoints in storage_pool_service.py that had
// no screen, so the recycle bin, the retry pipeline, capacity alerts and the
// pool switch were all database-only.
//
// The pool is flag-gated and DEFAULT OFF. Everything here answers while it is
// off; the flag only governs whether uploads route through the pool. That is
// why this page is useful before you turn it on — you connect accounts and
// watch capacity first, then flip it.
//
// PUT /settings refuses to enable an empty pool, because uploads would just
// log failures. Its 400 explains that in words, so we surface the server's
// message rather than pre-empting it with our own guess.

function bytes(n) {
  const v = Number(n || 0);
  if (v <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(v) / Math.log(1024)), u.length - 1);
  return `${(v / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function AdminStoragePool() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const { data, error, loading, reload } = useAsync(() => Promise.all([
    api.poolDashboard().then((r) => r.data).catch(() => null),
    api.poolAccounts().then((r) => r.data).catch(() => null),
    api.poolDeletedEvents().then((r) => r.data).catch(() => null),
    api.poolFailures({ limit: 50 }).then((r) => r.data).catch(() => null),
    api.poolAlerts(false).then((r) => r.data).catch(() => null),
    api.poolSettings().then((r) => r.data).catch(() => null),
  ]).then(([dash, accts, deleted, failures, alerts, settings]) =>
    ({ dash, accts, deleted, failures, alerts, settings })));

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try { await fn(); flash(msg); await reload(); }
    catch (e) { setErr(e?.response?.data?.detail || 'That did not work.'); }
    finally { setBusy(null); }
  };

  const dash = data?.dash;
  const accounts = data?.accts?.accounts || [];
  const oauthReady = data?.accts?.configured;
  const deleted = data?.deleted?.items || [];
  const retention = data?.deleted?.retention_days;
  const failures = data?.failures?.items || [];
  const alerts = data?.alerts?.alerts || [];
  const enabled = data?.settings?.enabled;

  return (
    <AdminModule
      active="Storage pool"
      title="Storage pool"
      sub="Drive accounts pooled into one store, with a recycle bin, a retry pipeline and capacity alerts."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Capacity', value: loading ? '—' : bytes(dash?.total_bytes ?? dash?.total) },
        { label: 'Used', value: loading ? '—' : bytes(dash?.used_bytes ?? dash?.used) },
        { label: 'Accounts', value: loading ? '—' : numberFmt.format(accounts.length) },
        { label: 'Open alerts', value: loading ? '—' : numberFmt.format(alerts.length) },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={3} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel
            title="Pool routing"
            sub="When this is off, uploads use the normal path and the accounts below sit idle."
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`wmod-pill wmod-pill--${enabled ? 'yes' : 'neutral'}`}>
                {enabled ? 'Routing through the pool' : 'Off'}
              </span>
              <button
                type="button"
                className={`wmod-btn wmod-btn--sm ${enabled ? 'wmod-btn--ghost' : 'wmod-btn--primary'}`}
                disabled={busy === 'flag'}
                onClick={() => run('flag', () => api.poolSetEnabled(!enabled), `Pool routing turned ${enabled ? 'off' : 'on'}.`)}
              >
                {busy === 'flag' ? 'Saving…' : enabled ? 'Turn off' : 'Turn on'}
              </button>
            </div>
            {!enabled && (
              <p className="wmod-hint" style={{ marginTop: 12 }}>
                The server will refuse to turn this on until at least one account
                is active — otherwise every upload would just record a failure.
              </p>
            )}
            {dash?.emergency && (
              <p className="wmod-error-body" style={{ marginTop: 12 }}>
                Under 10% of pool capacity remains
                {dash.days_remaining != null ? ` — roughly ${numberFmt.format(dash.days_remaining)} days at the current rate` : ''}.
                Connect another account.
              </p>
            )}
          </Panel>

          <Panel
            title="Accounts"
            sub={oauthReady === false
              ? 'Google OAuth is not configured on this server, so no account can be connected yet.'
              : 'Ordered by pool position. The one marked current receives new uploads.'}
            pad={false}
          >
            {accounts.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty
                  title="No accounts connected"
                  body="Until one is connected the pool has nowhere to write, and routing cannot be switched on."
                />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>Account</th><th>Slot</th><th>Used</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {accounts.map((a) => {
                      const off = a.status === 'disabled';
                      return (
                        <tr key={a.id || a.account_id}>
                          <td>
                            {a.email || a.label || a.id}
                            {a.pool_order != null && <><br /><span className="wmod-td-muted">position {a.pool_order}</span></>}
                          </td>
                          <td className="wmod-td-muted">{a.slot || '—'}</td>
                          <td>
                            {bytes(a.committed_bytes)} / {bytes(a.capacity_bytes)}
                            <br /><span className="wmod-td-muted">{a.used_pct ?? 0}%</span>
                          </td>
                          <td><span className={`wmod-pill wmod-pill--${off ? 'neutral' : 'yes'}`}>{a.status || '—'}</span></td>
                          <td className="wmod-td-actions">
                            <button
                              type="button"
                              className={`wmod-btn wmod-btn--sm ${off ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
                              disabled={busy === (a.id || a.account_id)}
                              onClick={() => run(
                                a.id || a.account_id,
                                () => (off ? api.poolEnableAccount(a.id || a.account_id) : api.poolDisableAccount(a.id || a.account_id)),
                                off ? 'Account enabled.' : 'Account disabled.',
                              )}
                            >
                              {busy === (a.id || a.account_id) ? '…' : off ? 'Enable' : 'Disable'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Recycle bin"
            sub={retention != null
              ? `Soft-deleted events. Recoverable for ${retention} days, then purged automatically.`
              : 'Soft-deleted events, recoverable until their purge date.'}
            pad={false}
          >
            {deleted.length === 0 ? (
              <div className="wmod-panel-body"><Empty title="Nothing deleted" body="Soft-deleted events wait here before their storage is released." /></div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>Event</th><th>Size</th><th>Purges</th><th /></tr></thead>
                  <tbody>
                    {deleted.map((d) => {
                      const id = d.event_id || d.id;
                      return (
                        <tr key={id}>
                          <td>{d.title || d.name || id}</td>
                          <td>{bytes(d.total_bytes)}</td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>
                            {d.purge_after ? relTime(d.purge_after) : '—'}
                          </td>
                          <td className="wmod-td-actions">
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--primary wmod-btn--sm"
                              disabled={busy === `r-${id}`}
                              onClick={() => run(`r-${id}`, () => api.poolRestoreEvent(id), 'Event restored.')}
                            >
                              {busy === `r-${id}` ? '…' : 'Restore'}
                            </button>
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--danger wmod-btn--sm"
                              style={{ marginLeft: 8 }}
                              disabled={busy === `p-${id}`}
                              // Irreversible, so it asks first. The scheduled
                              // purge does this anyway; the button only skips
                              // the remaining wait.
                              onClick={() => {
                                if (!window.confirm('Delete this event’s files permanently? This cannot be undone.')) return;
                                run(`p-${id}`, () => api.poolPurgeEvent(id), 'Purged.');
                              }}
                            >
                              {busy === `p-${id}` ? '…' : 'Purge now'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Failed uploads"
            sub="Failed, deferred and unrecoverable. The retry pipeline runs hourly on its own; this button runs it now."
            pad={false}
          >
            <div className="wmod-panel-body" style={{ paddingBottom: failures.length ? 0 : undefined }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--primary wmod-btn--sm"
                disabled={busy === 'retry'}
                onClick={() => run('retry', () => api.poolRetryFailures(), 'Retry pipeline run.')}
              >
                {busy === 'retry' ? 'Running…' : 'Retry now'}
              </button>
            </div>
            {failures.length === 0 ? (
              <div className="wmod-panel-body"><Empty title="No failed uploads" /></div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>File</th><th>Status</th><th>When</th><th>Reason</th></tr></thead>
                  <tbody>
                    {failures.map((f, i) => (
                      <tr key={f.id || i}>
                        <td>{f.filename || f.key || f.id || '—'}</td>
                        <td><span className="wmod-pill wmod-pill--neutral">{f.status}</span></td>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{f.started_at ? relTime(f.started_at) : '—'}</td>
                        <td className="wmod-td-muted">{f.error || f.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Alerts" sub="Unacknowledged only. Acknowledging hides it; it does not fix the cause." pad={false}>
            {alerts.length === 0 ? (
              <div className="wmod-panel-body"><Empty title="No open alerts" /></div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>Alert</th><th>Last seen</th><th /></tr></thead>
                  <tbody>
                    {alerts.map((a) => (
                      <tr key={a.id}>
                        <td>{a.message || a.kind || a.id}</td>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{a.last_seen_at ? relTime(a.last_seen_at) : '—'}</td>
                        <td className="wmod-td-actions">
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                            disabled={busy === `a-${a.id}`}
                            onClick={() => run(`a-${a.id}`, () => api.poolAckAlert(a.id), 'Acknowledged.')}
                          >
                            {busy === `a-${a.id}` ? '…' : 'Acknowledge'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}
