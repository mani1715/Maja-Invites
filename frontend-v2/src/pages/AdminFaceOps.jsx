import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Face-match operations. The dead-letter queue and its requeue endpoint were
// ADDED during the v2 migration and then shipped with no UI — so failed
// face-index jobs piled up invisibly and guests silently never found their
// photos (audit H1).

export default function AdminFaceOps() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [reindexId, setReindexId] = useState('');

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.faceOverview().then((r) => r.data).catch(() => null),
      api.faceDeadLetters().then((r) => r.data).catch(() => null),
      api.providers().then((r) => r.data).catch(() => null),
    ]).then(([overview, dl, providers]) => ({ overview, dl, providers })),
  );

  const overview = data?.overview || {};
  const deadLetters = data?.dl?.dead_letters || data?.dl?.items || (Array.isArray(data?.dl) ? data.dl : []);
  const providers = data?.providers?.providers || data?.providers || {};

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That job could not be queued.');
    } finally { setBusy(null); }
  };

  return (
    <AdminModule
      active="Face ops"
      title="Face operations"
      sub="The selfie-to-photos pipeline. Dead letters are jobs that failed every retry — until they are requeued, those photos are invisible to face search."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Photos indexed', value: loading ? '—' : numberFmt.format(overview.indexed_photos ?? overview.total_photos ?? 0) },
        { label: 'Queue depth', value: loading ? '—' : numberFmt.format(overview.queue_depth ?? 0), hint: 'Waiting to be processed' },
        { label: 'Dead letters', value: loading ? '—' : numberFmt.format(deadLetters.length), hint: deadLetters.length ? 'Needs a requeue' : 'Nothing stuck' },
        { label: 'Searches (24h)', value: loading ? '—' : numberFmt.format(overview.searches_24h ?? 0) },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel
            title="Dead letter queue"
            sub="Each row is a face-index job that exhausted its retries. Requeue puts it back on the worker."
            actions={deadLetters.length > 0 ? (
              <button
                type="button"
                className="wmod-btn wmod-btn--primary wmod-btn--sm"
                disabled={busy === 'all'}
                onClick={() => run('all', async () => {
                  // Sequential, not parallel: the worker queue is the thing we
                  // are trying to unstick — do not stampede it.
                  for (const dl of deadLetters) {
                    // eslint-disable-next-line no-await-in-loop
                    await api.faceRequeue(dl.id || dl.dl_id);
                  }
                }, `Requeued ${deadLetters.length} job(s).`)}
              >
                {busy === 'all' ? 'Requeueing…' : `Requeue all ${deadLetters.length}`}
              </button>
            ) : null}
            pad={false}
          >
            {deadLetters.length === 0 ? (
              <Empty title="Queue is clean" body="No face-match job has failed past its retries." />
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Job</th><th>Wedding</th><th>Error</th><th>Attempts</th><th>Failed</th><th /></tr>
                  </thead>
                  <tbody>
                    {deadLetters.map((dl) => {
                      const id = dl.id || dl.dl_id;
                      return (
                        <tr key={id}>
                          <td><code style={{ fontSize: 12 }}>{dl.job_type || dl.kind || 'FACE_INDEX'}</code></td>
                          <td className="wmod-td-muted">{dl.profile_id || '—'}</td>
                          <td className="wmod-td-muted" style={{ maxWidth: 280, overflowWrap: 'anywhere' }}>{dl.error || dl.reason || '—'}</td>
                          <td className="wmod-td-muted">{dl.attempts ?? '—'}</td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{relTime(dl.created_at || dl.failed_at)}</td>
                          <td className="wmod-td-actions">
                            <button
                              type="button"
                              className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                              disabled={busy === id}
                              onClick={() => run(id, () => api.faceRequeue(id), 'Job requeued.')}
                            >
                              {busy === id ? 'Requeueing…' : 'Requeue'}
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

          <Panel title="Reindex a wedding" sub="Rebuilds the face collection from scratch. Use after restoring photos, or when a guest reports that search finds nothing.">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="wmod-field" style={{ flex: '1 1 260px' }}>
                <label className="wmod-label" htmlFor="reindex-id">Wedding (profile) id</label>
                <input
                  id="reindex-id"
                  data-mj-field
                  className="wmod-input"
                  value={reindexId}
                  onChange={(e) => setReindexId(e.target.value)}
                  placeholder="profile id"
                />
              </div>
              <button
                type="button"
                className="wmod-btn wmod-btn--primary"
                disabled={busy === 'reindex' || !reindexId.trim()}
                onClick={() => run('reindex', async () => {
                  await api.faceReindex(reindexId.trim());
                  setReindexId('');
                }, 'Reindex queued.')}
              >
                {busy === 'reindex' ? 'Queueing…' : 'Queue reindex'}
              </button>
            </div>
          </Panel>

          <Panel title="Providers" sub="Which face-match backend is live. Keys are never shown — only whether they are present.">
            {Object.keys(providers).length === 0 ? (
              <Empty title="No provider info" body="The provider endpoint returned nothing." />
            ) : (
              Object.entries(providers).map(([name, v]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--mj-border)', fontSize: 13.5, gap: 12 }}>
                  <span style={{ textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</span>
                  <span className={`wmod-pill wmod-pill--${v === true || v?.configured || v?.active ? 'yes' : 'neutral'}`}>
                    {typeof v === 'object'
                      ? (v.active ? 'Active' : v.configured ? 'Configured' : 'Not configured')
                      : (v ? 'Configured' : 'Not configured')}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}
