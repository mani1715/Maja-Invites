import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, shortDate,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Build queue — the studio-facing half of fulfillment. Same orders, narrower
// question: which ones still need work right now, and which delivered orders
// have a buyer waiting on an edit.
//
// `edit_requested` is the one that quietly costs goodwill: the link is already
// live, the buyer asked for a change, and nothing surfaces it anywhere else.

export default function AdminBuildQueue() {
  const [toast, flash] = useFlash();
  const { data, error, loading, reload } = useAsync(() => api.buildQueue().then((r) => r.data));

  const orders = data?.orders || [];
  const editRequests = orders.filter((o) => o.edit_requested);
  const needsInfo = orders.filter((o) => o.build_status === 'pending_info');
  const building = orders.filter((o) => o.build_status === 'building');

  return (
    <AdminModule
      active="Build queue"
      title="Build queue"
      sub="Paid orders that need attention. Edit requests come from buyers whose link is already live."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'In the queue', value: loading ? '—' : numberFmt.format(data?.count || 0) },
        { label: 'Awaiting details', value: loading ? '—' : numberFmt.format(needsInfo.length), hint: 'Buyer has not filled the form' },
        { label: 'Building', value: loading ? '—' : numberFmt.format(building.length) },
        { label: 'Edit requests', value: loading ? '—' : numberFmt.format(data?.edit_requests || 0), hint: editRequests.length ? 'Live links waiting on a change' : 'None outstanding' },
      ]}
      />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {editRequests.length > 0 && (
            <OrderTable
              title="Edit requests"
              sub="These invitations are already live. The buyer has asked for a change — apply it on the link, then clear the flag."
              orders={editRequests}
              reload={reload}
              flash={flash}
              highlight
            />
          )}

          {orders.length === 0 ? (
            <Panel>
              <Empty
                title="Queue is clear"
                body="No paid order is waiting on a build. New purchases appear here as soon as payment clears."
              />
            </Panel>
          ) : (
            <OrderTable
              title="All open orders"
              sub="Sorted newest first."
              orders={orders}
              reload={reload}
              flash={flash}
            />
          )}
        </>
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}

function OrderTable({ title, sub, orders, reload, flash, highlight }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [delivering, setDelivering] = useState(null); // order id
  const [profileId, setProfileId] = useState('');

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      setDelivering(null);
      setProfileId('');
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That action did not complete.');
    } finally { setBusy(null); }
  };

  return (
    <Panel title={title} sub={sub} pad={false}>
      <div style={{ padding: '0 22px' }}><InlineError message={err} /></div>
      <div className="wmod-tablewrap">
        <table className="wmod-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Buyer</th>
              <th>Status</th>
              <th>Paid</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={highlight ? { background: 'var(--mj-section)' } : undefined}>
                <td>
                  <code style={{ fontSize: 12 }}>{o.fulfillment_code || o.id}</code>
                  {o.package_name && <><br /><span className="wmod-td-muted">{o.package_name}</span></>}
                </td>
                <td>
                  {o.buyer?.name || '—'}
                  {o.buyer?.email && <><br /><span className="wmod-td-muted">{o.buyer.email}</span></>}
                </td>
                <td>
                  <span className={`wmod-pill ${o.build_status === 'delivered' ? 'wmod-pill--yes' : o.build_status === 'building' ? 'wmod-pill--maybe' : 'wmod-pill--neutral'}`}>
                    {o.build_status === 'pending_info' ? 'Awaiting details' : o.build_status || 'paid'}
                  </span>
                  {o.edit_requested && <><br /><span className="wmod-pill wmod-pill--maybe" style={{ marginTop: 6 }}>Edit requested</span></>}
                </td>
                <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(o.paid_at)}</td>
                <td className="wmod-td-actions">
                  {o.edit_requested && (
                    <button
                      type="button"
                      className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                      disabled={busy === `edit-${o.id}`}
                      onClick={() => run(`edit-${o.id}`, () => api.buildQueueEditApplied(o.id), 'Edit marked as applied.')}
                    >
                      {busy === `edit-${o.id}` ? 'Saving…' : 'Edit applied'}
                    </button>
                  )}
                  {delivering === o.id ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <input
                        data-mj-field
                        className="wmod-input"
                        style={{ minHeight: 36, width: 200, fontSize: 12.5 }}
                        placeholder="profile id of the live link"
                        value={profileId}
                        onChange={(e) => setProfileId(e.target.value)}
                        aria-label="Profile id to attach"
                      />
                      <button
                        type="button"
                        className="wmod-btn wmod-btn--primary wmod-btn--sm"
                        disabled={busy === `del-${o.id}` || !profileId.trim()}
                        onClick={() => run(`del-${o.id}`, () => api.buildQueueDeliver(o.id, profileId.trim()), 'Order delivered.')}
                      >
                        {busy === `del-${o.id}` ? 'Delivering…' : 'Confirm'}
                      </button>
                      <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setDelivering(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="wmod-btn wmod-btn--primary wmod-btn--sm"
                      style={{ marginLeft: 8 }}
                      onClick={() => { setDelivering(o.id); setProfileId(o.profile_id || ''); }}
                    >
                      Deliver
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
