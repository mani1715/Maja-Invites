import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, shortDate,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Fulfillment — the done-for-you build workflow. This is how MAJA actually
// makes money: a buyer pays, fills in their details, and the team builds the
// invitation by hand. Without this screen orders could be taken and paid for
// but never delivered (audit C2).
//
// Three actions per request, in the order the owner performs them:
//   1. Build draft  -> POST /build-invitation. Creates a DRAFT profile from the
//      buyer's own answers. Explicitly not a delivery.
//   2. Prepare Drive-> POST /drive. Ensures the QR/selfie folders exist.
//   3. Deliver      -> POST /deliver with the live URL. This is what the buyer
//      finally sees, so it is confirmed before firing.

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending_info', label: 'Awaiting details' },
  { id: 'building', label: 'Building' },
  { id: 'delivered', label: 'Delivered' },
];

export default function AdminFulfillment() {
  const [status, setStatus] = useState('all');
  const [toast, flash] = useFlash();
  const { data, error, loading, reload } = useAsync(
    () => api.fulfillmentRequests(status === 'all' ? {} : { status }).then((r) => r.data),
    [status],
  );

  const counts = data?.counts || {};

  return (
    <AdminModule
      active="Fulfillment"
      title="Fulfillment"
      sub="Paid orders waiting to be built and delivered. Building a draft is safe — the buyer sees nothing until you press Deliver."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Total orders', value: loading ? '—' : numberFmt.format(counts.total || 0) },
        { label: 'Awaiting details', value: loading ? '—' : numberFmt.format(counts.pending_info || 0), hint: 'Buyer has not filled the form' },
        { label: 'Delivered', value: loading ? '—' : numberFmt.format(counts.delivered || 0) },
        { label: 'From studios', value: loading ? '—' : numberFmt.format(counts.premium || 0), hint: `${counts.normal || 0} direct` },
      ]}
      />

      <Segmented ariaLabel="Fulfillment filters" value={status} onChange={setStatus} options={FILTERS} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (data?.requests?.length ? (
        data.requests.map((r) => (
          <RequestCard key={r.fulfillment_code || r.code || r.id} r={r} reload={reload} flash={flash} />
        ))
      ) : (
        <Panel>
          <Empty
            title="Nothing in the queue"
            body={status === 'all'
              ? 'No paid orders are waiting. New purchases land here the moment payment clears.'
              : 'No orders in this state right now.'}
          />
        </Panel>
      ))}

      <Toast message={toast} />
    </AdminModule>
  );
}

function RequestCard({ r, reload, flash }) {
  const code = r.fulfillment_code || r.code;
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [liveUrl, setLiveUrl] = useState(r.live_url || '');
  const [confirming, setConfirming] = useState(false);
  const [detail, setDetail] = useState(null);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      const res = await fn();
      flash(msg);
      await reload();
      return res;
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That step did not complete. Nothing was delivered.');
      return null;
    } finally { setBusy(null); }
  };

  const buildDraft = () => run('build', async () => {
    const { data } = await api.fulfillmentBuild(code);
    // The builder hands back the draft's slug — pre-fill the deliver box so the
    // owner does not retype a URL they just created.
    const slug = data?.slug || data?.profile?.slug;
    if (slug) setLiveUrl(`${window.location.origin}/invite/${slug}`);
    return data;
  }, 'Draft invitation built. Review it, then deliver.');

  const prepDrive = () => run('drive', () => api.fulfillmentDrive(code), 'Drive folders prepared.');

  const deliver = () => run('deliver', () => api.fulfillmentDeliver(code, {
    live_url: liveUrl.trim(),
    profile_id: r.profile_id || detail?.profile_id,
  }), 'Delivered. The buyer can see the link now.');

  const openDetail = async () => {
    if (detail) { setDetail(null); return; }
    setBusy('detail');
    setErr(null);
    try {
      const { data } = await api.fulfillmentRequest(code);
      setDetail(data?.request || data);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not open this order.');
    } finally { setBusy(null); }
  };

  const delivered = r.build_status === 'delivered';
  const info = r.info || detail?.info;

  return (
    <Panel
      title={`${code} · ${r.buyer_name || r.buyer?.name || 'Buyer'}`}
      sub={`${r.buyer_kind === 'photographer' ? 'Studio order' : 'Direct order'} · paid ${shortDate(r.paid_at)}${r.package_name ? ` · ${r.package_name}` : ''}`}
      actions={(
        <>
          <span className={`wmod-pill ${delivered ? 'wmod-pill--yes' : r.build_status === 'building' ? 'wmod-pill--maybe' : 'wmod-pill--neutral'}`}>
            {delivered ? 'Delivered' : r.build_status === 'building' ? 'Building' : 'Awaiting details'}
          </span>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={openDetail} disabled={busy === 'detail'}>
            {detail ? 'Hide details' : busy === 'detail' ? 'Opening…' : 'Full details'}
          </button>
        </>
      )}
    >
      <InlineError message={err} />

      <div className="wmod-grid" style={{ marginBottom: 16 }}>
        <Kv label="Buyer email" value={r.buyer_email || r.buyer?.email} />
        <Kv label="Phone" value={r.buyer_phone || r.buyer?.phone} />
        <Kv label="Storage account" value={r.storage_account} />
        <Kv label="Drive folder" value={r.drive_folder || r.folders?.root} />
      </div>

      {detail && info && (
        <div style={{ background: 'var(--mj-section)', border: '1px solid var(--mj-border)', borderRadius: 'var(--mj-radius-card-inner)', padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--mj-primary)', margin: '0 0 10px' }}>
            What the buyer filled in
          </p>
          <dl style={{ margin: 0 }}>
            {Object.entries(info).map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--mj-border)', fontSize: 13 }}>
                <dt style={{ color: 'var(--mj-muted)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>
                  {v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {!info && !delivered && (
        <p className="wmod-hint" style={{ marginBottom: 14 }}>
          The buyer has not submitted their details yet, so there is nothing to build from.
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <button type="button" className="wmod-btn wmod-btn--ghost" onClick={buildDraft} disabled={!!busy || !info}>
          {busy === 'build' ? 'Building…' : '1. Build draft'}
        </button>
        <button type="button" className="wmod-btn wmod-btn--ghost" onClick={prepDrive} disabled={!!busy}>
          {busy === 'drive' ? 'Preparing…' : '2. Prepare Drive'}
        </button>

        <div className="wmod-field" style={{ flex: '1 1 280px', minWidth: 220 }}>
          <label className="wmod-label" htmlFor={`live-${code}`}>3. Live invitation URL</label>
          <input
            id={`live-${code}`}
            data-mj-field
            className="wmod-input"
            value={liveUrl}
            onChange={(e) => { setLiveUrl(e.target.value); setConfirming(false); }}
            placeholder="https://…/invite/riya-aarav"
            inputMode="url"
          />
        </div>

        {!confirming ? (
          <button
            type="button"
            className="wmod-btn wmod-btn--primary"
            onClick={() => setConfirming(true)}
            disabled={!!busy || !liveUrl.trim()}
          >
            {delivered ? 'Re-deliver' : 'Deliver'}
          </button>
        ) : (
          <>
            <button type="button" className="wmod-btn wmod-btn--primary" onClick={deliver} disabled={busy === 'deliver'}>
              {busy === 'deliver' ? 'Delivering…' : 'Confirm — buyer will see this'}
            </button>
            <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => setConfirming(false)} disabled={busy === 'deliver'}>
              Cancel
            </button>
          </>
        )}
      </div>

      {delivered && r.live_url && (
        <p className="wmod-hint" style={{ marginTop: 12 }}>
          Delivered {shortDate(r.delivered_at)} ·{' '}
          <a href={r.live_url} target="_blank" rel="noreferrer" data-mj-link>{r.live_url}</a>
        </p>
      )}
    </Panel>
  );
}

function Kv({ label, value }) {
  return (
    <div className="wmod-field">
      <span className="wmod-label" style={{ marginBottom: 3 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: value ? 'var(--mj-ink)' : 'var(--mj-faint)', overflowWrap: 'anywhere' }}>
        {value || '—'}
      </span>
    </div>
  );
}
