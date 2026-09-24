import AdminModule, {
  Panel, StatRow, Empty, useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// System health. `request_metrics.py` and `/api/admin/system/*` were both built
// during the v2 migration and then had no reader — p95 latency was being
// measured and thrown away.

function tone(ok) {
  return ok ? 'yes' : 'no';
}

export default function AdminSystemHealth() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.systemHealth().then((r) => r.data).catch(() => null),
      api.systemMetrics().then((r) => r.data).catch(() => null),
    ]).then(([health, metrics]) => ({ health, metrics })),
  );

  const health = data?.health || {};
  const metrics = data?.metrics || {};
  const checks = health.checks || health.services || {};
  const endpoints = metrics.endpoints || metrics.routes || [];

  return (
    <AdminModule
      active="System health"
      title="System health"
      sub="Live dependency checks and request latency. p95 is the number that matters — the average hides the requests people actually complain about."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Status', value: loading ? '—' : (health.status || (health.ok ? 'healthy' : 'unknown')) },
        { label: 'Requests seen', value: loading ? '—' : numberFmt.format(metrics.total_requests ?? 0) },
        { label: 'p95 latency', value: loading ? '—' : (metrics.p95_ms != null ? `${Math.round(metrics.p95_ms)} ms` : '—') },
        { label: 'Errors (5xx)', value: loading ? '—' : numberFmt.format(metrics.error_count ?? metrics.errors ?? 0) },
      ]}
      />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="Dependencies" sub="Postgres, Redis and the storage/AI backends this deploy needs to work.">
            {Object.keys(checks).length === 0 ? (
              <Empty title="No dependency checks reported" body="The health endpoint returned no per-service detail." />
            ) : (
              Object.entries(checks).map(([name, v]) => {
                const ok = v === true || v === 'ok' || v?.ok === true || v?.status === 'ok';
                return (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--mj-border)', fontSize: 13.5 }}>
                    <span style={{ textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</span>
                    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {typeof v === 'object' && v?.latency_ms != null && (
                        <span className="wmod-td-muted">{Math.round(v.latency_ms)} ms</span>
                      )}
                      <span className={`wmod-pill wmod-pill--${tone(ok)}`}>{ok ? 'OK' : 'Failing'}</span>
                    </span>
                  </div>
                );
              })
            )}
            {health.checked_at && (
              <p className="wmod-hint" style={{ marginTop: 12 }}>Checked {relTime(health.checked_at)}.</p>
            )}
          </Panel>

          <Panel
            title="Slowest endpoints"
            sub="Ranked by p95. A slow admin list is annoying; a slow /invite/:slug is a guest closing the tab."
            pad={false}
          >
            {endpoints.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty title="No per-endpoint metrics yet" body="Metrics accumulate in memory per worker and reset on restart. Give it some traffic." />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Endpoint</th><th>Calls</th><th>p50</th><th>p95</th><th>Errors</th></tr>
                  </thead>
                  <tbody>
                    {[...endpoints]
                      .sort((a, b) => (b.p95_ms || 0) - (a.p95_ms || 0))
                      .slice(0, 25)
                      .map((e) => (
                        <tr key={e.route || e.path || e.endpoint}>
                          <td><code style={{ fontSize: 12 }}>{e.route || e.path || e.endpoint}</code></td>
                          <td className="wmod-td-muted">{numberFmt.format(e.count ?? 0)}</td>
                          <td className="wmod-td-muted">{e.p50_ms != null ? `${Math.round(e.p50_ms)} ms` : '—'}</td>
                          <td>
                            <span className={`wmod-pill wmod-pill--${(e.p95_ms || 0) > 1000 ? 'no' : (e.p95_ms || 0) > 400 ? 'maybe' : 'yes'}`}>
                              {e.p95_ms != null ? `${Math.round(e.p95_ms)} ms` : '—'}
                            </span>
                          </td>
                          <td className="wmod-td-muted">{numberFmt.format(e.errors ?? 0)}</td>
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
