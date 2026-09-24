import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, rupees, shortDate,
} from '@/components/StudioModule';
import client from '@/api/client';

// Client work: contracts (with e-sign), proofing galleries, and print orders.
// Three separate routers, one screen — they are the same job from the studio's
// side, which is "what do I still owe this couple".

const work = {
  contracts: () => client.get('/api/studio/contracts'),
  createContract: (p) => client.post('/api/studio/contracts', p),
  contractAction: (id, action) => client.post(`/api/studio/contracts/${id}/${action}`),
  proofing: () => client.get('/api/studio/proofing'),
  printOrders: () => client.get('/api/studio/print-orders'),
  setPrintStatus: (id, status) => client.post(`/api/studio/print-orders/${id}/status`, { status }),
  weddings: () => client.get('/api/studio/my-weddings'),
};

const PRINT_STATES = ['received', 'in_production', 'shipped', 'delivered'];

export default function StudioClientWork() {
  const [view, setView] = useState('contracts');
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      work.contracts().then((r) => r.data).catch(() => null),
      work.proofing().then((r) => r.data).catch(() => null),
      work.printOrders().then((r) => r.data).catch(() => null),
    ]).then(([contracts, proofing, prints]) => ({ contracts, proofing, prints })),
  );

  const contracts = data?.contracts?.contracts || data?.contracts?.items || (Array.isArray(data?.contracts) ? data.contracts : []);
  const proofing = data?.proofing?.galleries || data?.proofing?.items || (Array.isArray(data?.proofing) ? data.proofing : []);
  const prints = data?.prints?.orders || data?.prints?.items || (Array.isArray(data?.prints) ? data.prints : []);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not go through.');
    } finally { setBusy(null); }
  };

  const signed = contracts.filter((c) => c.status === 'signed').length;
  const awaitingPrint = prints.filter((p) => p.status !== 'delivered').length;

  return (
    <StudioModule
      active="Client work"
      title="Client work"
      sub="Contracts, proofing galleries and print orders — everything the couple is still waiting on."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Contracts', value: loading ? '—' : numberFmt.format(contracts.length), hint: `${signed} signed` },
        { label: 'Proofing galleries', value: loading ? '—' : numberFmt.format(proofing.length) },
        { label: 'Print orders open', value: loading ? '—' : numberFmt.format(awaitingPrint) },
        { label: 'Print value', value: loading ? '—' : rupees.format(prints.reduce((s, p) => s + Number(p.amount || 0), 0)) },
      ]}
      />

      <Segmented
        ariaLabel="Client work views"
        value={view}
        onChange={setView}
        options={[
          { id: 'contracts', label: 'Contracts', count: contracts.length },
          { id: 'proofing', label: 'Proofing', count: proofing.length },
          { id: 'prints', label: 'Print orders', count: prints.length },
        ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && view === 'contracts' && (
        <Panel title="Contracts" sub="Send one for e-signature; voiding is permanent and the couple is notified." pad={false}>
          {contracts.length === 0 ? (
            <Empty title="No contracts yet" body="Create one against a wedding to get it signed before the shoot." />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Wedding</th><th>Title</th><th>Value</th><th>Status</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id}>
                      <td>{c.profile_name || c.profile_id || '—'}</td>
                      <td className="wmod-td-muted">{c.title || 'Contract'}</td>
                      <td>{rupees.format(c.amount || 0)}</td>
                      <td>
                        <span className={`wmod-pill wmod-pill--${c.status === 'signed' ? 'yes' : c.status === 'void' ? 'no' : 'maybe'}`}>
                          {c.status || 'draft'}
                        </span>
                      </td>
                      <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(c.created_at)}</td>
                      <td className="wmod-td-actions">
                        {c.status !== 'signed' && c.status !== 'void' && (
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--primary wmod-btn--sm"
                            disabled={busy === `s-${c.id}`}
                            onClick={() => run(`s-${c.id}`, () => work.contractAction(c.id, 'send'), 'Sent for signature.')}
                          >
                            {busy === `s-${c.id}` ? 'Sending…' : 'Send'}
                          </button>
                        )}
                        {c.status !== 'void' && (
                          <button
                            type="button"
                            className="wmod-btn wmod-btn--danger wmod-btn--sm"
                            style={{ marginLeft: 6 }}
                            disabled={busy === `v-${c.id}`}
                            onClick={() => run(`v-${c.id}`, () => work.contractAction(c.id, 'void'), 'Contract voided.')}
                          >
                            Void
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
      )}

      {!loading && !error && view === 'proofing' && (
        <Panel title="Proofing galleries" sub="Selections the couple makes before you finish the edit." pad={false}>
          {proofing.length === 0 ? (
            <Empty title="No proofing galleries" body="Create one to let a couple pick their favourites without a WhatsApp thread of screenshots." />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Gallery</th><th>Wedding</th><th>Photos</th><th>Selected</th><th>Created</th></tr></thead>
                <tbody>
                  {proofing.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name || g.title || g.id}</td>
                      <td className="wmod-td-muted">{g.profile_name || g.profile_id || '—'}</td>
                      <td className="wmod-td-muted">{numberFmt.format(g.photo_count ?? 0)}</td>
                      <td>{numberFmt.format(g.selected_count ?? 0)}</td>
                      <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(g.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {!loading && !error && view === 'prints' && (
        <Panel title="Print orders" sub="Albums and prints a couple has ordered. Move the status as it progresses." pad={false}>
          {prints.length === 0 ? (
            <Empty title="No print orders" body="Orders placed from a delivered gallery appear here." />
          ) : (
            <div className="wmod-tablewrap">
              <table className="wmod-table">
                <thead><tr><th>Order</th><th>Wedding</th><th>Items</th><th>Value</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {prints.map((o) => (
                    <tr key={o.id}>
                      <td><code style={{ fontSize: 12 }}>{o.id}</code></td>
                      <td className="wmod-td-muted">{o.profile_name || o.profile_id || '—'}</td>
                      <td className="wmod-td-muted">{numberFmt.format(o.item_count ?? (o.items || []).length)}</td>
                      <td>{rupees.format(o.amount || 0)}</td>
                      <td>
                        <span className={`wmod-pill wmod-pill--${o.status === 'delivered' ? 'yes' : 'maybe'}`}>
                          {String(o.status || 'received').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="wmod-td-actions">
                        <select
                          data-mj-field
                          className="wmod-input"
                          style={{ minHeight: 36, width: 'auto', fontSize: 12.5 }}
                          value={o.status || 'received'}
                          disabled={busy === o.id}
                          onChange={(e) => run(o.id, () => work.setPrintStatus(o.id, e.target.value), 'Status updated.')}
                          aria-label={`Status for order ${o.id}`}
                        >
                          {PRINT_STATES.map((s) => (
                            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
