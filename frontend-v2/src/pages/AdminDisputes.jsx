import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, rupees, shortDate,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Disputes — Razorpay chargebacks and buyer complaints. Money is involved, so
// every state change is confirmed before it fires and nothing here can issue a
// refund: refunds live in the pricing hub, deliberately behind their own screen.

const STATES = [
  { id: 'open', label: 'Open' },
  { id: 'under_review', label: 'Under review' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
  { id: 'all', label: 'All' },
];

export default function AdminDisputes() {
  const [status, setStatus] = useState('open');
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.disputes(status === 'all' ? {} : { status }).then((r) => r.data),
      api.disputeStats().then((r) => r.data).catch(() => null),
    ]).then(([list, stats]) => ({ list, stats })),
    [status],
  );

  const rows = data?.list?.disputes || data?.list?.items || (Array.isArray(data?.list) ? data.list : []);
  const stats = data?.stats || {};

  return (
    <AdminModule
      active="Disputes"
      title="Disputes"
      sub="Chargebacks and payment complaints. Respond with evidence before the acquirer's deadline — an unanswered dispute is an automatic loss."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Open', value: loading ? '—' : numberFmt.format(stats.open ?? rows.length) },
        { label: 'At stake', value: loading ? '—' : rupees.format(stats.amount_at_risk ?? 0) },
        { label: 'Won', value: loading ? '—' : numberFmt.format(stats.won ?? 0) },
        { label: 'Lost', value: loading ? '—' : numberFmt.format(stats.lost ?? 0), hint: stats.lost_amount ? rupees.format(stats.lost_amount) : undefined },
      ]}
      />

      <Segmented ariaLabel="Dispute status" value={status} onChange={setStatus} options={STATES} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (rows.length > 0 ? (
        rows.map((d) => <DisputeCard key={d.id || d.dispute_id} d={d} reload={reload} flash={flash} />)
      ) : (
        <Panel>
          <Empty
            title={status === 'open' ? 'No open disputes' : 'Nothing here'}
            body={status === 'open'
              ? 'Nothing is being contested right now. New chargebacks appear here when the gateway reports them.'
              : 'No disputes in this state.'}
          />
        </Panel>
      ))}

      <Toast message={toast} />
    </AdminModule>
  );
}

function DisputeCard({ d, reload, flash }) {
  const id = d.id || d.dispute_id;
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(null);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      setConfirm(null);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That change did not save.');
    } finally { setBusy(null); }
  };

  const settled = d.status === 'won' || d.status === 'lost';

  return (
    <Panel
      title={`${d.reason || 'Dispute'} · ${rupees.format(d.amount || 0)}`}
      sub={`${d.buyer_name || d.buyer_email || 'Buyer'} · order ${d.order_id || '—'} · raised ${shortDate(d.created_at)}${d.respond_by ? ` · respond by ${shortDate(d.respond_by)}` : ''}`}
      actions={(
        <span className={`wmod-pill wmod-pill--${d.status === 'won' ? 'yes' : d.status === 'lost' ? 'no' : 'maybe'}`}>
          {d.status || 'open'}
        </span>
      )}
    >
      <InlineError message={err} />

      {d.description && (
        <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 14px', overflowWrap: 'anywhere' }}>{d.description}</p>
      )}

      {!settled && (
        <>
          <div className="wmod-field" style={{ marginBottom: 12 }}>
            <label className="wmod-label" htmlFor={`ev-${id}`}>Evidence / internal note</label>
            <textarea
              id={`ev-${id}`}
              data-mj-field
              className="wmod-input"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Delivery proof, correspondence, link access logs…"
            />
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="wmod-btn wmod-btn--ghost"
              disabled={busy === 'ev' || !note.trim()}
              onClick={() => run('ev', async () => { await api.disputeEvidence(id, { note: note.trim() }); setNote(''); }, 'Evidence added.')}
            >
              {busy === 'ev' ? 'Saving…' : 'Add evidence'}
            </button>

            <button
              type="button"
              className="wmod-btn wmod-btn--ghost"
              disabled={busy === 'review'}
              onClick={() => run('review', () => api.disputeUpdate(id, { status: 'under_review' }), 'Marked under review.')}
            >
              Mark under review
            </button>

            {confirm === 'won' ? (
              <button type="button" className="wmod-btn wmod-btn--primary" disabled={busy === 'won'}
                onClick={() => run('won', () => api.disputeUpdate(id, { status: 'won' }), 'Dispute marked won.')}>
                {busy === 'won' ? 'Saving…' : 'Confirm — won'}
              </button>
            ) : (
              <button type="button" className="wmod-btn wmod-btn--primary" onClick={() => setConfirm('won')}>Mark won</button>
            )}

            {confirm === 'lost' ? (
              <button type="button" className="wmod-btn wmod-btn--danger" disabled={busy === 'lost'}
                onClick={() => run('lost', () => api.disputeUpdate(id, { status: 'lost' }), 'Dispute marked lost.')}>
                {busy === 'lost' ? 'Saving…' : 'Confirm — lost'}
              </button>
            ) : (
              <button type="button" className="wmod-btn wmod-btn--danger" onClick={() => setConfirm('lost')}>Mark lost</button>
            )}

            {confirm && (
              <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => setConfirm(null)}>Cancel</button>
            )}
          </div>
        </>
      )}

      {settled && (
        <p className="wmod-hint" style={{ margin: 0 }}>
          Settled {shortDate(d.resolved_at || d.updated_at)}. Nothing further to do here.
        </p>
      )}
    </Panel>
  );
}
