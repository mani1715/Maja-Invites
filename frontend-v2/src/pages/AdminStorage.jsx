import AdminModule, {
  Panel, StatRow, Empty, useAsync, Loading, ErrorPanel, numberFmt,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Storage overview. The multi-drive pool is the single largest cost centre and
// the one most likely to fail quietly — an account near capacity stops
// accepting uploads mid-wedding.

function gb(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n === 0) return '0 GB';
  const g = n / 1024 ** 3;
  if (g >= 1024) return `${(g / 1024).toFixed(2)} TB`;
  return `${g.toFixed(g < 10 ? 2 : 1)} GB`;
}

export default function AdminStorage() {
  const { data, error, loading, reload } = useAsync(
    () => api.storageOverview().then((r) => r.data),
  );

  const d = data || {};
  const accounts = d.accounts || d.pool || [];
  const consumers = d.top_consumers || d.consumers || [];
  const usedPct = d.total_capacity_bytes
    ? Math.round((Number(d.total_used_bytes || 0) / Number(d.total_capacity_bytes)) * 100)
    : null;

  return (
    <AdminModule
      active="Storage"
      title="Storage"
      sub="The Drive pool and S3 originals behind every gallery. Watch the per-account headroom — a full account rejects uploads while a wedding is happening."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Total used', value: loading ? '—' : gb(d.total_used_bytes), hint: usedPct != null ? `${usedPct}% of pool` : undefined },
        { label: 'Capacity', value: loading ? '—' : gb(d.total_capacity_bytes) },
        { label: 'Accounts', value: loading ? '—' : numberFmt.format(accounts.length || d.account_count || 0) },
        { label: 'Files', value: loading ? '—' : numberFmt.format(d.file_count ?? d.total_files ?? 0) },
      ]}
      />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="Pool accounts" sub="Anything above 85% needs attention before the next big upload." pad={false}>
            {accounts.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty
                  title="No pool accounts reported"
                  body="The multi-drive pool is flag-gated (storage_pool_enabled) and off by default. With it off, everything lands in S3 instead."
                />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Account</th><th>Kind</th><th>Used</th><th>Capacity</th><th>Headroom</th></tr>
                  </thead>
                  <tbody>
                    {accounts.map((a) => {
                      const used = Number(a.used_bytes || 0);
                      const cap = Number(a.capacity_bytes || 0);
                      const pct = cap > 0 ? Math.round((used / cap) * 100) : 0;
                      return (
                        <tr key={a.id || a.email || a.name}>
                          <td>{a.email || a.name || a.id}</td>
                          <td className="wmod-td-muted">{a.kind || a.provider || '—'}</td>
                          <td className="wmod-td-muted">{gb(used)}</td>
                          <td className="wmod-td-muted">{gb(cap)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 70, height: 8, borderRadius: 999, background: 'var(--mj-section-deep)', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct > 85 ? 'var(--mj-error)' : pct > 65 ? 'var(--mj-warning)' : 'var(--mj-primary)' }} />
                              </div>
                              <span className={`wmod-pill wmod-pill--${pct > 85 ? 'no' : pct > 65 ? 'maybe' : 'yes'}`}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Biggest consumers" sub="Weddings using the most space. Usually the ones with an un-culled raw upload." pad={false}>
            {consumers.length === 0 ? (
              <div className="wmod-panel-body"><Empty title="No usage recorded yet" /></div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Wedding</th><th>Studio</th><th>Files</th><th>Size</th></tr>
                  </thead>
                  <tbody>
                    {consumers.slice(0, 25).map((c) => (
                      <tr key={c.profile_id || c.id}>
                        <td>{c.name || c.slug || c.profile_id}</td>
                        <td className="wmod-td-muted">{c.studio_name || c.admin_id || '—'}</td>
                        <td className="wmod-td-muted">{numberFmt.format(c.file_count ?? 0)}</td>
                        <td>{gb(c.bytes ?? c.used_bytes)}</td>
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
