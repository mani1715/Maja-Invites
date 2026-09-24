import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, useAsync, Loading, ErrorPanel,
  numberFmt, rupees, shortDate,
} from '@/components/StudioModule';
import * as api from '@/api/studioOps';

// Studio earnings. The endpoint existed and `api/studio.js` even exported a
// helper for it, which nothing called — so a photographer could take Shagun
// payments and plan purchases and never see a rupee of it summarised.

const RANGES = [
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '365', label: '12 months' },
];

export default function StudioEarnings() {
  const [days, setDays] = useState('90');
  const { data, error, loading, reload } = useAsync(
    () => api.earnings(days).then((r) => r.data),
    [days],
  );

  const d = data || {};
  const rows = d.entries || d.ledger || d.items || [];
  const byKind = d.by_kind || d.breakdown || {};

  return (
    <StudioModule
      active="Earnings"
      title="Earnings"
      sub="Everything that has come in, and what MAJA took. Figures are settled amounts from the finance ledger, not pending payments."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Gross', value: loading ? '—' : rupees.format(d.gross ?? d.total ?? 0), hint: `last ${days} days` },
        { label: 'Platform fees', value: loading ? '—' : rupees.format(d.fees ?? d.platform_fees ?? 0) },
        { label: 'Net to you', value: loading ? '—' : rupees.format(d.net ?? d.payout ?? ((d.gross ?? 0) - (d.fees ?? 0))) },
        { label: 'Transactions', value: loading ? '—' : numberFmt.format(d.count ?? rows.length) },
      ]}
      />

      <Segmented ariaLabel="Date range" value={days} onChange={setDays} options={RANGES} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {Object.keys(byKind).length > 0 && (
            <Panel title="Where it came from">
              {Object.entries(byKind).map(([kind, v]) => {
                const amt = Number(typeof v === 'object' ? (v.amount ?? v.total ?? 0) : v);
                const gross = Number(d.gross ?? d.total ?? 0);
                const pct = gross > 0 ? Math.round((amt / gross) * 100) : 0;
                return (
                  <div key={kind} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
                      <span style={{ textTransform: 'capitalize' }}>{kind.replace(/_/g, ' ')}</span>
                      <span className="wmod-td-muted">{rupees.format(amt)} · {pct}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--mj-section-deep)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--mj-primary)' }} />
                    </div>
                  </div>
                );
              })}
            </Panel>
          )}

          <Panel title="Transactions" sub="Newest first." pad={false}>
            {rows.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty
                  title="Nothing yet in this window"
                  body="Shagun blessings, plan purchases and link sales show up here once they settle."
                />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>When</th><th>What</th><th>Wedding</th><th>Gross</th><th>Fee</th><th>Net</th></tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 100).map((r, i) => (
                      <tr key={r.id || i}>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(r.created_at || r.date)}</td>
                        <td style={{ textTransform: 'capitalize' }}>{String(r.kind || r.type || 'payment').replace(/_/g, ' ')}</td>
                        <td className="wmod-td-muted">{r.profile_name || r.profile_id || '—'}</td>
                        <td>{rupees.format(r.amount ?? r.gross ?? 0)}</td>
                        <td className="wmod-td-muted">{rupees.format(r.fee ?? r.platform_fee ?? 0)}</td>
                        <td>{rupees.format(r.net ?? ((r.amount ?? 0) - (r.fee ?? 0)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </StudioModule>
  );
}
