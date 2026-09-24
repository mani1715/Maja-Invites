import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Fleet view of per-event camera SFTP transfers. Credentials are never shown
// here (bcrypt-hashed, revealed once to the owner at create/rotate); admin can
// see who/which event/status/last activity and REVOKE, plus a global audit of
// received/rejected files.

export default function AdminCameras() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.cameraTransfers().then((r) => r.data).catch(() => null),
      api.cameraEventsGlobal(100).then((r) => r.data).catch(() => null),
    ]).then(([transfers, events]) => ({ transfers, events })),
  );

  const transfers = data?.transfers?.transfers || [];
  const events = data?.events?.events || [];
  const active = transfers.filter((t) => t.status === 'active' && !t.expired).length;
  const rejected = events.filter((e) => e.result === 'rejected').length;

  const revoke = async (profileId) => {
    if (!window.confirm('Revoke this camera credential? The camera can no longer upload until re-enabled by the studio.')) return;
    setBusy(profileId); setErr(null);
    try { await api.cameraRevoke(profileId); flash('Credential revoked.'); await reload(); }
    catch (e) { setErr(e?.response?.data?.detail || 'Could not revoke.'); }
    finally { setBusy(null); }
  };

  return (
    <AdminModule
      active="Cameras"
      title="Camera transfers"
      sub="Per-event SFTP camera credentials. Photos travel camera → SFTP → S3 → the normal gallery/face pipeline; the site never handles the bytes."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Active credentials', value: loading ? '—' : numberFmt.format(active) },
        { label: 'Total (non-revoked)', value: loading ? '—' : numberFmt.format(transfers.length) },
        { label: 'Recent events', value: loading ? '—' : numberFmt.format(events.length) },
        { label: 'Rejected', value: loading ? '—' : numberFmt.format(rejected), hint: rejected ? 'Files that failed validation' : 'None' },
      ]}
      />

      <InlineError message={err} />
      {toast}

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="Camera credentials" sub="One per event. Revoke to cut a camera off immediately." pad={false}>
            {transfers.length === 0 ? (
              <Empty title="No camera transfers" body="No studio has enabled camera transfer for an event yet." />
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Username</th><th>Event</th><th>Photographer</th><th>Camera</th><th>Status</th><th>Last seen</th><th /></tr>
                  </thead>
                  <tbody>
                    {transfers.map((t) => (
                      <tr key={t.id}>
                        <td><code style={{ fontSize: 12 }}>{t.username}</code></td>
                        <td className="wmod-td-muted">{t.profile_id}</td>
                        <td className="wmod-td-muted">{t.admin_id}</td>
                        <td className="wmod-td-muted">{t.camera_key}</td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: t.expired ? '#b45309' : t.status === 'active' ? '#15803d' : '#b91c1c' }}>
                            {t.expired ? 'expired' : t.status}
                          </span>
                        </td>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{t.last_seen_at ? relTime(t.last_seen_at) : '—'}</td>
                        <td className="wmod-td-actions">
                          {t.status !== 'revoked' && (
                            <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" disabled={busy === t.profile_id}
                              onClick={() => revoke(t.profile_id)}>
                              {busy === t.profile_id ? 'Revoking…' : 'Revoke'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Recent transfer activity" sub="Every received file — stored, duplicate, or rejected." pad={false}>
            {events.length === 0 ? (
              <Empty title="No activity yet" body="Files received from cameras will appear here." />
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>When</th><th>Event</th><th>File</th><th>Result</th><th>Reason</th></tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{relTime(e.created_at)}</td>
                        <td className="wmod-td-muted">{e.profile_id}</td>
                        <td className="wmod-td-muted" style={{ maxWidth: 220, overflowWrap: 'anywhere' }}>{e.filename}</td>
                        <td>
                          <span style={{ fontSize: 12, fontWeight: 600, color: e.result === 'stored' ? '#15803d' : e.result === 'duplicate' ? '#6b7280' : '#b91c1c' }}>{e.result}</span>
                        </td>
                        <td className="wmod-td-muted" style={{ maxWidth: 200, overflowWrap: 'anywhere' }}>{e.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </AdminModule>
  );
}
