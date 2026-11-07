import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, shortDate,
} from '@/components/AdminModule';
import * as customDesignApi from '@/api/customDesign';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'quote_provided', label: 'Quoted' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' },
];

export default function AdminCustomRequests() {
  const [status, setStatus] = useState('all');
  const [toast, flash] = useFlash();

  const { data, error, loading, reload } = useAsync(
    () => customDesignApi.listRequests(status === 'all' ? {} : { status }).then((r) => r.data),
    [status],
  );

  const requests = data?.items || data?.requests || [];

  const counts = {
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    in_progress: requests.filter((r) => r.status === 'in_progress').length,
    completed: requests.filter((r) => r.status === 'completed').length,
  };

  return (
    <AdminModule
      active="Custom Requests"
      title="Custom Design Requests"
      sub="Review custom design assistance and bespoke artwork requests, quote prices, fulfill changes, and restore revision snapshots."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Total requests', value: loading ? '—' : numberFmt.format(counts.total) },
        { label: 'Pending review', value: loading ? '—' : numberFmt.format(counts.pending), hint: 'Requires admin attention' },
        { label: 'In Progress', value: loading ? '—' : numberFmt.format(counts.in_progress) },
        { label: 'Completed', value: loading ? '—' : numberFmt.format(counts.completed) },
      ]}
      />

      <Segmented ariaLabel="Custom request status" value={status} onChange={setStatus} options={FILTERS} />

      {loading && <Loading />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (requests.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {requests.map((r) => (
            <RequestCard key={r.id} req={r} reload={reload} flash={flash} />
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            title={status === 'all' ? 'No custom design requests' : `No ${status} requests`}
            body="When photographers request design help or bespoke stage matching, requests appear here."
          />
        </Panel>
      ))}

      <Toast message={toast} />
    </AdminModule>
  );
}

function RequestCard({ req, reload, flash }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);
  const [newStatus, setNewStatus] = useState(req.status || 'pending');
  const [quotePrice, setQuotePrice] = useState(req.quoted_price != null ? req.quoted_price : '');
  const [adminNotes, setAdminNotes] = useState(req.admin_notes || '');

  // Revision state
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [restoringId, setRestoringId] = useState(null);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        status: newStatus,
        admin_notes: adminNotes.trim() || null,
      };
      if (quotePrice !== '') {
        const num = parseFloat(quotePrice);
        if (!isNaN(num) && num >= 0) {
          payload.quoted_price = num;
        }
      }
      await customDesignApi.updateRequest(req.id, payload);
      flash('Custom design request updated.');
      setEditing(false);
      reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Failed to update request.');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadRevisions = async () => {
    if (!req.profile_id) return;
    setRevisionsOpen(true);
    setRevisionsLoading(true);
    try {
      const res = await customDesignApi.listRevisions(req.profile_id);
      setRevisions(res.data?.revisions || []);
      setCurrentVersion(res.data?.current_version || null);
    } catch (e) {
      flash('Failed to load revisions: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setRevisionsLoading(false);
    }
  };

  const handleRestoreRevision = async (revId) => {
    if (!window.confirm('Are you sure you want to restore this revision? Current invitation state will be preserved as a backup.')) return;
    setRestoringId(revId);
    try {
      await customDesignApi.restoreRevision(req.profile_id, revId);
      flash('Revision restored successfully. Existing URL preserved.');
      await handleLoadRevisions();
    } catch (e) {
      flash('Failed to restore: ' + (e?.response?.data?.detail || e.message));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Panel>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              padding: '2px 8px',
              borderRadius: 4,
              background: req.request_type === 'bespoke_paid' ? '#fef3c7' : '#e0e7ff',
              color: req.request_type === 'bespoke_paid' ? '#92400e' : '#3730a3',
            }}>
              {req.request_type === 'bespoke_paid' ? 'Bespoke Paid' : 'Design Assistance'}
            </span>
            <span style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 4,
              background: req.status === 'completed' ? '#dcfce7' : (req.status === 'in_progress' ? '#e0f2fe' : '#f3f4f6'),
              color: req.status === 'completed' ? '#166534' : (req.status === 'in_progress' ? '#075985' : '#374151'),
            }}>
              {req.status}
            </span>
            <span style={{ fontSize: 12, color: 'var(--mj-muted)' }}>
              Submitted {shortDate(req.created_at)}
            </span>
          </div>

          <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 600 }}>{req.title}</h3>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--mj-text)', whiteSpace: 'pre-wrap' }}>
            {req.requirements || req.description}
          </p>

          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--mj-muted)' }}>
            <strong>Studio:</strong> {req.creator_email || req.studio_id}
            {req.profile_id && (
              <span style={{ marginLeft: 16 }}>
                <strong>Linked Profile:</strong> <code>{req.profile_id}</code>
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {req.profile_id && (
            <>
              <a
                href={`/studio/wedding/new?profile_id=${req.profile_id}`}
                target="_blank"
                rel="noreferrer"
                className="wmod-btn wmod-btn--secondary wmod-btn--sm"
              >
                Edit in Wizard ↗
              </a>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                onClick={handleLoadRevisions}
              >
                Revision History
              </button>
            </>
          )}
          <button
            type="button"
            className="wmod-btn wmod-btn--ghost wmod-btn--sm"
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Cancel' : 'Manage / Quote'}
          </button>
        </div>
      </div>

      {(req.quoted_price != null || req.admin_notes) && !editing && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 6, fontSize: 13, border: '1px solid #e2e8f0' }}>
          {req.quoted_price != null && (
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#0f172a' }}>
              Quoted Price: ₹{req.quoted_price.toLocaleString('en-IN')}
            </p>
          )}
          {req.admin_notes && (
            <p style={{ margin: 0, color: '#475569' }}>
              <strong>Admin Notes:</strong> {req.admin_notes}
            </p>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={handleUpdate} style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          <InlineError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Status</label>
              <select
                className="wmod-input"
                style={{ width: '100%' }}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="quote_provided">Quote Provided</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Quote Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="50"
                className="wmod-input"
                style={{ width: '100%' }}
                placeholder="e.g. 1500"
                value={quotePrice}
                onChange={(e) => setQuotePrice(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Admin / Delivery Notes</label>
            <textarea
              rows={2}
              className="wmod-input"
              style={{ width: '100%' }}
              placeholder="Notes to studio explaining completed artwork or quote breakdown..."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="wmod-btn wmod-btn--primary wmod-btn--sm" disabled={busy}>
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* Revision History Modal / Drawer */}
      {revisionsOpen && (
        <div className="ife-modal-overlay" role="dialog" aria-modal="true">
          <div className="ife-modal-card" style={{ maxWidth: 640 }}>
            <header className="ife-header">
              <div className="ife-header-info">
                <h3 className="ife-title">Revision History</h3>
                <p className="ife-subtitle">Profile: {req.profile_id} (Current version: {currentVersion || '—'})</p>
              </div>
              <button
                type="button"
                className="ife-close-btn"
                onClick={() => setRevisionsOpen(false)}
              >
                &times;
              </button>
            </header>

            <div style={{ padding: 20, maxHeight: '60vh', overflowY: 'auto' }}>
              {revisionsLoading ? (
                <Loading rows={2} />
              ) : revisions.length === 0 ? (
                <Empty
                  title="No revisions recorded"
                  body="Revisions are auto-saved each time an invitation profile is edited."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {revisions.map((rev) => (
                    <div
                      key={rev.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 6,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          Version {rev.version}
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--mj-muted)', fontWeight: 400 }}>
                            {shortDate(rev.created_at)}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          Role: {rev.role || 'studio'} • {rev.note || 'Edit snapshot'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="wmod-btn wmod-btn--secondary wmod-btn--sm"
                        disabled={restoringId === rev.id}
                        onClick={() => handleRestoreRevision(rev.id)}
                      >
                        {restoringId === rev.id ? 'Restoring…' : 'Restore'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <footer style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f3f4f6' }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                onClick={() => setRevisionsOpen(false)}
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      )}
    </Panel>
  );
}
