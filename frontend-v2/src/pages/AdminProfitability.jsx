import AdminModule, {
  Panel, StatRow, Empty, useAsync, Loading, ErrorPanel, numberFmt, rupees,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Profitability — revenue against the COGS the usage-metering work started
// recording (`usage_metering.py`). The backend is explicit that costs are
// ESTIMATES from metered usage, not invoices, so this page says so rather than
// presenting a margin number as fact.

export default function AdminProfitability() {
  const { data, error, loading, reload } = useAsync(
    () => api.profitability().then((r) => r.data),
  );

  const d = data || {};
  const revenue = d.revenue ?? d.total_revenue ?? 0;
  const cost = d.cost ?? d.total_cost ?? d.estimated_cost ?? 0;
  const margin = revenue - cost;
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
  const lines = d.cost_breakdown || d.costs || d.lines || [];
  const items = Array.isArray(lines) ? lines : Object.entries(lines).map(([label, amount]) => ({ label, amount }));

  return (
    <AdminModule
      active="Profitability"
      title="Profitability"
      sub="Revenue against metered infrastructure cost. Costs are estimates derived from usage records, not provider invoices — treat the margin as directional."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Revenue', value: loading ? '—' : rupees.format(revenue) },
        { label: 'Estimated cost', value: loading ? '—' : rupees.format(cost) },
        { label: 'Gross margin', value: loading ? '—' : rupees.format(margin), hint: revenue > 0 ? `${marginPct}%` : undefined },
        { label: 'Weddings served', value: loading ? '—' : numberFmt.format(d.profile_count ?? d.weddings ?? 0) },
      ]}
      />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="Where the money goes" sub="Each line is a metered cost centre. Storage and face-match dominate at scale." pad={false}>
            {items.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty
                  title="No cost lines yet"
                  body="Usage metering records accumulate as weddings are served. This fills in once there is measurable activity."
                />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Cost centre</th><th>Estimated</th><th>Share of revenue</th></tr>
                  </thead>
                  <tbody>
                    {items.map((l) => {
                      const amt = Number(l.amount ?? l.cost ?? 0);
                      const pct = revenue > 0 ? Math.round((amt / revenue) * 100) : 0;
                      return (
                        <tr key={l.label || l.name}>
                          <td style={{ textTransform: 'capitalize' }}>{String(l.label || l.name).replace(/_/g, ' ')}</td>
                          <td>{rupees.format(amt)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, minWidth: 80, height: 8, borderRadius: 999, background: 'var(--mj-section-deep)', overflow: 'hidden' }}>
                                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: 'var(--mj-primary)' }} />
                              </div>
                              <span className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{pct}%</span>
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

          <Panel title="How to read this">
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--mj-muted)', margin: 0, maxWidth: '68ch' }}>
              Revenue is settled INR from paid orders and subscriptions. Cost is
              reconstructed from usage records — gigabytes stored, faces indexed,
              searches run — multiplied by the configured unit rates. It does not
              include the VM, bandwidth, or anything billed as a flat monthly
              fee, so real margin is lower than the number above.
            </p>
          </Panel>
        </>
      )}
    </AdminModule>
  );
}
