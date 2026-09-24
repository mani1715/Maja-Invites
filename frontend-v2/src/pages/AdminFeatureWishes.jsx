import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Feature-wish board. Buyers submit features they would pay for, with a stored
// consent record; the backend has triaged them since day one and nothing in
// the console ever read the queue.
//
// Contract (feature_wishes.py):
//   GET   /admin/feature-wishes/summary -> { total, new, open, latest[] }
//   GET   /admin/feature-wishes?status&only_new -> { items[], statuses[] }
//   PATCH /admin/feature-wishes/{id}  body: { status?, admin_note?,
//                                             quoted_price_inr?, is_new? }
// Statuses: new · contacted · quoted · agreed · declined · closed

const n = (v) => numberFmt.format(Number(v) || 0);

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'quoted', label: 'Quoted' },
  { id: 'agreed', label: 'Agreed' },
  { id: 'declined', label: 'Declined' },
  { id: 'closed', label: 'Closed' },
];

const TONE = {
  new: 'maybe', contacted: 'maybe', quoted: 'maybe',
  agreed: 'yes', declined: 'no', closed: 'no',
};

export default function AdminFeatureWishes() {
  const [status, setStatus] = useState('');
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.featureWishes(status ? { status } : {}).then((r) => r.data),
      api.featureWishSummary().then((r) => r.data).catch(() => null),
    ]).then(([list, summary]) => ({ list, summary })),
    [status],
  );

  const items = data?.list?.items || [];
  const statuses = data?.list?.statuses || FILTERS.map((f) => f.id).filter(Boolean);
  const summary = data?.summary || {};

  return (
    <AdminModule
      active="Feature wishes"
      title="Feature wishes"
      sub="Features buyers asked for and said they would pay for. Each one carries the consent text they agreed to at the time."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Total', value: loading ? '—' : n(summary.total ?? items.length) },
        { label: 'New', value: loading ? '—' : n(summary.new) },
        { label: 'Open', value: loading ? '—' : n(summary.open) },
      ]}
      />

      <Segmented ariaLabel="Wish status" value={status} onChange={setStatus} options={FILTERS} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (items.length === 0 ? (
        <Panel>
          <Empty
            title={status ? `Nothing ${status}` : 'No wishes yet'}
            body="When a buyer submits a feature request from the pricing or contact page, it lands here."
          />
        </Panel>
      ) : items.map((w) => (
        <Wish key={w.id} w={w} statuses={statuses} reload={reload} flash={flash} />
      )))}

      <Toast message={toast} />
    </AdminModule>
  );
}

function Wish({ w, statuses, reload, flash }) {
  const [note, setNote] = useState(w.admin_note || '');
  const [price, setPrice] = useState(w.quoted_price_inr ?? '');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const patch = async (key, payload, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await api.patchFeatureWish(w.id, payload);
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not go through.');
    } finally { setBusy(null); }
  };

  return (
    <Panel
      title={w.title || w.summary || `Request ${w.id}`}
      sub={[
        w.name || w.email || 'Anonymous',
        w.phone,
        w.created_at ? `asked ${relTime(w.created_at)}` : null,
      ].filter(Boolean).join(' · ')}
      actions={(
        <>
          {w.is_new && <span className="wmod-pill wmod-pill--maybe">Unread</span>}
          <span className={`wmod-pill wmod-pill--${TONE[w.status] || 'maybe'}`}>{w.status || 'new'}</span>
        </>
      )}
    >
      <InlineError message={err} />

      {(w.text || w.details) && (
        <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 16px', overflowWrap: 'anywhere' }}>
          {w.text || w.details}
        </p>
      )}

      {w.consent_text && (
        <p style={{ fontSize: 12, color: 'var(--mj-faint)', margin: '0 0 16px', lineHeight: 1.6 }}>
          Consented to: “{w.consent_text}”
        </p>
      )}

      <div className="wmod-field" style={{ marginBottom: 12 }}>
        <label className="wmod-label" htmlFor={`note-${w.id}`}>Internal note</label>
        <textarea
          id={`note-${w.id}`}
          className="wmod-input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Only the team sees this."
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="wmod-field" style={{ flex: '0 0 180px' }}>
          <label className="wmod-label" htmlFor={`price-${w.id}`}>Quoted price (₹)</label>
          <input
            id={`price-${w.id}`}
            className="wmod-input"
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>

        <div className="wmod-field" style={{ flex: '0 0 180px' }}>
          <label className="wmod-label" htmlFor={`status-${w.id}`}>Status</label>
          <select
            id={`status-${w.id}`}
            className="wmod-input"
            value={w.status || 'new'}
            onChange={(e) => patch('status', { status: e.target.value, is_new: false }, 'Status updated.')}
            disabled={busy === 'status'}
          >
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <button
          type="button"
          className="wmod-btn wmod-btn--primary"
          disabled={busy === 'save'}
          onClick={() => patch('save', {
            admin_note: note,
            quoted_price_inr: price === '' ? null : Number(price) || 0,
            is_new: false,
          }, 'Saved.')}
        >
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>

        {w.is_new && (
          <button
            type="button"
            className="wmod-btn wmod-btn--ghost"
            disabled={busy === 'read'}
            onClick={() => patch('read', { is_new: false }, 'Marked read.')}
          >
            Mark read
          </button>
        )}
      </div>
    </Panel>
  );
}
