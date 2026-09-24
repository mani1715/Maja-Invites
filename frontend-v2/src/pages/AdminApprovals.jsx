import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, rupees, relTime,
} from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// Approvals. Four separate submission flows in the product end in a moderation
// queue, and none of those queues had a screen — so studios could apply for
// verification, list themselves as talent, list a vendor business, or ask us to
// build their portfolio, and the request would sit at "pending" forever with
// nobody able to see it.
//
// /admin/moderation/* is a DIFFERENT system (content reports) and covers none
// of this.
//
// Contracts:
//   GET  /admin/pixora/verifications?status  -> { verifications[] }
//   POST /admin/pixora/verifications/{studioId}/review { decision, level, reason }
//   GET  /admin/talent                       -> { talent[] }
//   POST /admin/talent/{id}/action { action } — approve|reject|feature|unfeature|delete
//   GET  /admin/vendors?status               -> { vendors[], count }
//   POST /admin/vendors/{id}/action { action }
//        — approve|reject|suspend|verify|feature|unfeature|hide|unhide|delete
//   GET  /admin/portfolio-build-requests     -> { requests[] }
//   POST /admin/portfolio-build-requests/{id}/status?status=…   (query param!)

const n = (v) => numberFmt.format(Number(v) || 0);
const pending = (rows) => rows.filter((r) => (r.status || 'pending') === 'pending').length;

const TABS = [
  { id: 'verification', label: 'Verification' },
  { id: 'talent', label: 'Talent' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'builds', label: 'Portfolio builds' },
];

const TONE = {
  approved: 'yes', verified: 'yes', done: 'yes',
  rejected: 'no', suspended: 'no', declined: 'no',
  pending: 'maybe', in_progress: 'maybe',
};

export default function AdminApprovals() {
  const [tab, setTab] = useState('verification');
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.adminVerifications().then((r) => r.data).catch(() => null),
      api.adminTalent().then((r) => r.data).catch(() => null),
      api.adminVendors().then((r) => r.data).catch(() => null),
      api.adminBuildRequests().then((r) => r.data).catch(() => null),
    ]).then(([v, t, ve, b]) => ({ v, t, ve, b })),
  );

  const verifications = data?.v?.verifications || [];
  const talent = data?.t?.talent || [];
  const vendors = data?.ve?.vendors || [];
  const builds = data?.b?.requests || [];

  const act = async (fn, msg) => {
    try { await fn(); flash(msg); await reload(); }
    catch (e) { flash(e?.response?.data?.detail || 'That did not go through.'); }
  };

  return (
    <AdminModule
      active="Approvals"
      title="Approvals"
      sub="Everything a studio has submitted and is waiting on you for. Nothing here moves until somebody decides."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Verification', value: loading ? '—' : n(pending(verifications)), hint: 'awaiting review' },
        { label: 'Talent', value: loading ? '—' : n(pending(talent)), hint: 'awaiting review' },
        { label: 'Vendors', value: loading ? '—' : n(pending(vendors)), hint: 'awaiting review' },
        { label: 'Portfolio builds', value: loading ? '—' : n(pending(builds)), hint: 'awaiting build' },
      ]}
      />

      <Segmented ariaLabel="Approval queues" value={tab} onChange={setTab} options={TABS} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && tab === 'verification' && (
        <Verifications rows={verifications} act={act} />
      )}

      {!loading && !error && tab === 'talent' && (
        <Queue
          rows={talent}
          empty="No talent listings"
          emptyBody="Studios listing themselves as second shooters or editors appear here for review."
          title={(t) => t.name || t.headline || t.owner_id}
          body={(t) => [t.headline, (t.specialties || []).join(' · '), t.rate_card].filter(Boolean).join(' — ')}
          actions={(t) => [
            ...(t.status !== 'approved' ? [['Approve', 'primary', () => api.talentAction(t.id, 'approve'), 'Approved.']] : []),
            ...(t.status !== 'rejected' ? [['Reject', 'ghost', () => api.talentAction(t.id, 'reject'), 'Rejected.']] : []),
            [t.featured ? 'Unfeature' : 'Feature', 'ghost',
              () => api.talentAction(t.id, t.featured ? 'unfeature' : 'feature'),
              t.featured ? 'Unfeatured.' : 'Featured.'],
          ]}
          act={act}
        />
      )}

      {!loading && !error && tab === 'vendors' && (
        <Queue
          rows={vendors}
          empty="No vendor listings"
          emptyBody="Decor, makeup and other vendor businesses appear here for review before they go public."
          title={(v) => v.business_name || v.id}
          body={(v) => [
            v.category,
            [v.city, v.state].filter(Boolean).join(', '),
            v.price_min_inr ? `from ${rupees.format(v.price_min_inr)}` : null,
            v.hidden ? 'hidden' : null,
          ].filter(Boolean).join(' · ')}
          actions={(v) => [
            ...(v.status !== 'approved' ? [['Approve', 'primary', () => api.vendorAction(v.id, 'approve'), 'Approved.']] : []),
            ...(v.status !== 'rejected' ? [['Reject', 'ghost', () => api.vendorAction(v.id, 'reject'), 'Rejected.']] : []),
            ...(v.status === 'approved' ? [['Suspend', 'ghost', () => api.vendorAction(v.id, 'suspend'), 'Suspended.']] : []),
            [v.featured ? 'Unfeature' : 'Feature', 'ghost',
              () => api.vendorAction(v.id, v.featured ? 'unfeature' : 'feature'),
              v.featured ? 'Unfeatured.' : 'Featured.'],
            [v.hidden ? 'Unhide' : 'Hide', 'ghost',
              () => api.vendorAction(v.id, v.hidden ? 'unhide' : 'hide'),
              v.hidden ? 'Visible again.' : 'Hidden.'],
          ]}
          act={act}
        />
      )}

      {!loading && !error && tab === 'builds' && (
        <Queue
          rows={builds}
          empty="No portfolio build requests"
          emptyBody="Studios who ask us to build their portfolio for them (from Build my portfolio) appear here with their brief."
          title={(b) => b.studio_name || b.studio_id}
          body={(b) => {
            const d = b.details || {};
            const parts = Object.entries(d)
              .filter(([, v]) => String(v || '').trim())
              .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
            return [...parts, b.notes].filter(Boolean).join('\n');
          }}
          actions={(b) => [
            ...(b.status !== 'in_progress' ? [['Start', 'primary', () => api.setBuildRequestStatus(b.id, 'in_progress'), 'Marked in progress.']] : []),
            ...(b.status !== 'done' ? [['Mark done', 'ghost', () => api.setBuildRequestStatus(b.id, 'done'), 'Marked done.']] : []),
          ]}
          act={act}
        />
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}

// Verification carries a level and a rejection reason, so it does not fit the
// generic queue below.
const LEVELS = [
  [1, 'Verified Photographer'],
  [2, 'Verified Studio'],
  [3, 'Premium Studio'],
  [4, 'Elite Pixora Professional'],
];

function Verifications({ rows, act }) {
  const [level, setLevel] = useState({});
  const [reason, setReason] = useState({});

  if (rows.length === 0) {
    return (
      <Panel>
        <Empty
          title="No verification applications"
          body="Studios applying for a verified badge from Pixora → Growth → Verification appear here with the documents they submitted."
        />
      </Panel>
    );
  }

  return rows.map((v) => {
    const sid = v.studio_id || v.id;
    const chosen = level[sid] ?? v.requested_level ?? 1;
    return (
      <Panel
        key={sid}
        title={v.studio_name || sid}
        sub={[
          `Applied for level ${v.requested_level ?? 1}`,
          v.updated_at ? relTime(v.updated_at) : null,
        ].filter(Boolean).join(' · ')}
        actions={<span className={`wmod-pill wmod-pill--${TONE[v.status] || 'maybe'}`}>{v.status || 'pending'}</span>}
      >
        <ul className="wmod-list" style={{ marginBottom: 16 }}>
          {[
            ['Government ID', v.gov_id_url],
            ['Business proof', v.business_proof_url],
            ['Website', v.website],
            ['Instagram', v.instagram],
            ['Portfolio', v.portfolio_link],
            ['Phone', v.phone],
            ['Email', v.email],
          ].filter(([, val]) => val).map(([label, val]) => (
            <li className="wmod-item" key={label}>
              <div className="wmod-item-head">
                <span className="wmod-item-title">{label}</span>
                {String(val).startsWith('http') || String(val).startsWith('/')
                  ? <a className="wmod-btn wmod-btn--ghost wmod-btn--sm" href={val} target="_blank" rel="noreferrer">Open</a>
                  : <span className="wmod-item-meta">{val}</span>}
              </div>
            </li>
          ))}
        </ul>

        {v.note && <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '0 0 16px' }}>{v.note}</p>}

        {v.status !== 'approved' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="wmod-field" style={{ flex: '0 0 220px' }}>
              <label className="wmod-label" htmlFor={`lvl-${sid}`}>Grant level</label>
              <select
                id={`lvl-${sid}`}
                className="wmod-input"
                value={chosen}
                onChange={(e) => setLevel((l) => ({ ...l, [sid]: Number(e.target.value) }))}
              >
                {LEVELS.map(([lv, label]) => <option key={lv} value={lv}>{lv} — {label}</option>)}
              </select>
            </div>
            <div className="wmod-field" style={{ flex: '1 1 220px' }}>
              <label className="wmod-label" htmlFor={`rsn-${sid}`}>Reason (sent on rejection)</label>
              <input
                id={`rsn-${sid}`}
                className="wmod-input"
                value={reason[sid] || ''}
                onChange={(e) => setReason((r) => ({ ...r, [sid]: e.target.value }))}
                placeholder="Why, in a sentence they can act on"
              />
            </div>
            <button
              type="button"
              className="wmod-btn wmod-btn--primary"
              onClick={() => act(() => api.reviewVerification(sid, 'approve', chosen, reason[sid] || ''), 'Verified.')}
            >
              Approve
            </button>
            <button
              type="button"
              className="wmod-btn wmod-btn--ghost"
              onClick={() => act(() => api.reviewVerification(sid, 'reject', null, reason[sid] || ''), 'Rejected.')}
            >
              Reject
            </button>
          </div>
        )}
      </Panel>
    );
  });
}

/** Generic approve/reject queue — talent, vendors and build requests all share
 *  the same shape: a titled row, a description, and a row of verbs. */
function Queue({ rows, empty, emptyBody, title, body, actions, act }) {
  if (rows.length === 0) {
    return <Panel><Empty title={empty} body={emptyBody} /></Panel>;
  }
  return rows.map((r) => {
    const text = body(r);
    return (
      <Panel
        key={r.id}
        title={title(r)}
        sub={r.created_at ? relTime(r.created_at) : undefined}
        actions={(
          <>
            {r.featured && <span className="wmod-pill wmod-pill--yes">Featured</span>}
            <span className={`wmod-pill wmod-pill--${TONE[r.status] || 'maybe'}`}>{r.status || 'pending'}</span>
          </>
        )}
      >
        {text && (
          <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 16px', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
            {text}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {actions(r).map(([label, kind, fn, msg]) => (
            <button
              key={label}
              type="button"
              className={`wmod-btn wmod-btn--${kind} wmod-btn--sm`}
              onClick={() => act(fn, msg)}
            >
              {label}
            </button>
          ))}
        </div>
      </Panel>
    );
  });
}
