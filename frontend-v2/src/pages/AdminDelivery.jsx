import AdminModule, {
  Panel, StatRow, Empty, useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Outbound delivery — email/SMS/WhatsApp send log and per-channel success
// rates. This is where "the couple never got their link" gets answered.

function pct(n, d) {
  if (!d) return null;
  return Math.round((n / d) * 100);
}

export default function AdminDelivery() {
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.deliveryStats().then((r) => r.data).catch(() => null),
      api.deliveryRecent({ limit: 50 }).then((r) => r.data).catch(() => null),
    ]).then(([stats, recent]) => ({ stats, recent })),
  );

  const s = data?.stats || {};
  const rows = data?.recent?.events || data?.recent?.items || (Array.isArray(data?.recent) ? data.recent : []);
  const channels = s.channels || s.by_channel || {};

  const sent = s.sent ?? s.total_sent ?? 0;
  const delivered = s.delivered ?? 0;
  const failed = s.failed ?? s.bounced ?? 0;

  return (
    <AdminModule
      active="Delivery"
      title="Delivery"
      sub="Every invitation link, OTP and receipt this platform sends out, and whether it arrived. Start here when someone says they never got it."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Sent', value: loading ? '—' : numberFmt.format(sent) },
        { label: 'Delivered', value: loading ? '—' : numberFmt.format(delivered), hint: pct(delivered, sent) != null ? `${pct(delivered, sent)}%` : undefined },
        { label: 'Failed', value: loading ? '—' : numberFmt.format(failed), hint: pct(failed, sent) != null ? `${pct(failed, sent)}%` : undefined },
        { label: 'Channels live', value: loading ? '—' : numberFmt.format(Object.keys(channels).length) },
      ]}
      />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="By channel" sub="A channel sitting well below the others usually means a credential or sender-reputation problem, not bad luck.">
            {Object.keys(channels).length === 0 ? (
              <Empty title="No channel data" body="Nothing has been sent yet, or the send log is empty." />
            ) : (
              Object.entries(channels).map(([name, v]) => {
                const cSent = Number(v?.sent ?? v?.total ?? v ?? 0);
                const cOk = Number(v?.delivered ?? 0);
                const rate = pct(cOk, cSent);
                return (
                  <div key={name} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 6 }}>
                      <span style={{ textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</span>
                      <span className="wmod-td-muted">
                        {numberFmt.format(cSent)} sent{rate != null ? ` · ${rate}% delivered` : ''}
                      </span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--mj-section-deep)', overflow: 'hidden' }}>
                      <div style={{ width: `${rate ?? 0}%`, height: '100%', background: (rate ?? 0) < 80 ? 'var(--mj-warning)' : 'var(--mj-primary)' }} />
                    </div>
                  </div>
                );
              })
            )}
          </Panel>

          <Panel title="Recent sends" sub="Newest first. A failed row carries the provider's own reason." pad={false}>
            {rows.length === 0 ? (
              <div className="wmod-panel-body"><Empty title="Nothing sent yet" /></div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>To</th><th>Channel</th><th>Kind</th><th>Status</th><th>Reason</th><th>When</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((e, i) => {
                      const ok = e.status === 'delivered' || e.status === 'sent';
                      return (
                        <tr key={e.id || i}>
                          <td style={{ overflowWrap: 'anywhere' }}>{e.to || e.recipient || '—'}</td>
                          <td className="wmod-td-muted">{e.channel || '—'}</td>
                          <td className="wmod-td-muted">{e.kind || e.template || '—'}</td>
                          <td><span className={`wmod-pill wmod-pill--${ok ? 'yes' : e.status === 'pending' ? 'maybe' : 'no'}`}>{e.status || '—'}</span></td>
                          <td className="wmod-td-muted" style={{ maxWidth: 240, overflowWrap: 'anywhere' }}>{e.error || e.reason || '—'}</td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{relTime(e.created_at || e.sent_at)}</td>
                        </tr>
                      );
                    })}
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
