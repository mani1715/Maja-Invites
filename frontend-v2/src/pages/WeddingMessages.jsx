import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import WeddingModule, { Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash } from '@/components/WeddingModule';
import * as api from '@/api/weddingMessages';

// Messages tab — replaces the legacy WishesManagement + GreetingsManagement
// pair. Wishes are the moderated wall shown on the invitation; greetings are
// the older collection kept for weddings created before the wall existed.
// The greetings half only appears when that wedding actually has some, so a
// new wedding never sees a legacy concept it will never use.

const numberFmt = new Intl.NumberFormat('en-IN');

export default function WeddingMessages() {
  const { weddingId } = useParams();
  return (
    <WeddingModule weddingId={weddingId} active="Messages" title="Messages">
      {(profile) => <MessagesBody profileId={profile.id} />}
    </WeddingModule>
  );
}

function MessagesBody({ profileId }) {
  const [params, setParams] = useSearchParams();
  const [wishes, setWishes] = useState(null);
  const [greetings, setGreetings] = useState(null);
  const [error, setError] = useState(null);
  const [opError, setOpError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, flash] = useFlash();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, g] = await Promise.all([
        api.listWishes(profileId),
        api.listGreetings(profileId).catch(() => ({ data: [] })),
      ]);
      setWishes(w.data);
      setGreetings(g.data || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load messages.');
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const hasGreetings = (greetings?.length || 0) > 0;
  const requested = params.get('view');
  const view = requested === 'greetings' && hasGreetings ? 'greetings' : 'wishes';
  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'greetings') next.set('view', 'greetings'); else next.delete('view');
    setParams(next, { replace: true });
  };

  const counts = wishes?.counts || {};
  const loading = wishes === null && !error;

  const act = async (fn, msg, id) => {
    setBusyId(id);
    setOpError(null);
    try {
      await fn();
      flash(msg);
      await load();
    } catch (e) {
      setOpError(e?.response?.data?.detail || 'That action did not go through.');
    } finally { setBusyId(null); }
  };

  return (
    <>
      <StatRow items={[
        { label: 'Approved', value: numberFmt.format(counts.approved || 0), hint: 'Live on the invitation' },
        { label: 'Awaiting review', value: numberFmt.format(counts.pending || 0), hint: counts.pending ? 'Guests are waiting' : 'Nothing to review' },
        { label: 'Rejected', value: numberFmt.format(counts.rejected || 0) },
        { label: 'Featured', value: numberFmt.format(counts.featured || 0), hint: 'Pinned to the top' },
      ]}
      />

      {hasGreetings && (
        <Segmented
          ariaLabel="Message views"
          value={view}
          onChange={setView}
          options={[
            { id: 'wishes', label: 'Wishes wall', count: wishes?.wishes?.length },
            { id: 'greetings', label: 'Greetings (legacy)', count: greetings.length },
          ]}
        />
      )}

      <InlineError message={error} />
      <InlineError message={opError} />

      {loading && <div className="wmod-skel" style={{ height: 320 }} />}

      {!loading && view === 'wishes' && (
        <WishesPanel
          profileId={profileId}
          wishes={wishes?.wishes || []}
          pending={counts.pending || 0}
          busyId={busyId}
          act={act}
        />
      )}

      {!loading && view === 'greetings' && (
        <GreetingsPanel greetings={greetings} busyId={busyId} act={act} />
      )}

      <Toast message={toast} />
    </>
  );
}

function WishesPanel({ profileId, wishes, pending, busyId, act }) {
  const [filter, setFilter] = useState('pending');

  const shown = useMemo(() => {
    if (filter === 'all') return wishes;
    if (filter === 'featured') return wishes.filter((w) => w.is_featured);
    return wishes.filter((w) => (w.status || w.approval_status) === filter);
  }, [wishes, filter]);

  const tabs = [
    ['pending', 'Awaiting review'],
    ['approved', 'Approved'],
    ['rejected', 'Rejected'],
    ['featured', 'Featured'],
    ['all', 'All'],
  ];

  return (
    <Panel
      title="Wishes wall"
      sub="Guests write these on the invitation. Nothing appears publicly until you approve it."
      actions={pending > 0 ? (
        <button
          type="button"
          className="wmod-btn wmod-btn--primary wmod-btn--sm"
          onClick={() => act(() => api.bulkApproveWishes(profileId), `Approved ${pending} wish${pending === 1 ? '' : 'es'}.`, 'bulk')}
          disabled={busyId === 'bulk'}
        >
          {busyId === 'bulk' ? 'Approving…' : `Approve all ${pending}`}
        </button>
      ) : null}
      pad={false}
    >
      <div style={{ padding: '14px 22px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--mj-border)' }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`wmod-btn wmod-btn--sm ${filter === id ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {wishes.length === 0 ? (
        <Empty
          title="No wishes yet"
          body="When guests leave a message on the invitation it lands here for review. Make sure the wishes wall is switched on in the wedding editor."
        />
      ) : shown.length === 0 ? (
        <Empty title="Nothing here" body="No wishes in this filter." />
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((w) => {
            const status = w.status || w.approval_status;
            const busy = busyId === w.id;
            return (
              <li key={w.id} style={{ padding: '16px 22px', borderBottom: '1px solid var(--mj-border)' }}>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14 }}>{w.author_name || w.guest_name || 'A guest'}</strong>
                    {w.is_featured && <span className="wmod-pill wmod-pill--vip" style={{ marginLeft: 8 }}>Featured</span>}
                    <span className={`wmod-pill wmod-pill--${status === 'approved' ? 'yes' : status === 'rejected' ? 'no' : 'maybe'}`} style={{ marginLeft: 8 }}>
                      {status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending'}
                    </span>
                  </div>
                  <span className="wmod-td-muted" style={{ fontSize: 12.5 }}>
                    {w.created_at ? new Date(w.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                  </span>
                </div>
                <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 12px', color: 'var(--mj-ink)', overflowWrap: 'anywhere' }}>
                  {w.message || w.text}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {status !== 'approved' && (
                    <button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" disabled={busy}
                      onClick={() => act(() => api.approveWish(profileId, w.id), 'Wish approved.', w.id)}>
                      Approve
                    </button>
                  )}
                  {status !== 'rejected' && (
                    <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" disabled={busy}
                      onClick={() => act(() => api.rejectWish(profileId, w.id), 'Wish rejected.', w.id)}>
                      Reject
                    </button>
                  )}
                  <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" disabled={busy}
                    onClick={() => act(() => api.featureWish(profileId, w.id), w.is_featured ? 'Wish unfeatured.' : 'Wish featured.', w.id)}>
                    {w.is_featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" disabled={busy} style={{ marginLeft: 'auto' }}
                    onClick={() => act(() => api.deleteWish(profileId, w.id), 'Wish deleted.', w.id)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function GreetingsPanel({ greetings, busyId, act }) {
  return (
    <Panel
      title="Greetings"
      sub="The older greetings collection. Kept so nothing written before the wishes wall is lost — new messages arrive on the wall instead."
      pad={false}
    >
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {greetings.map((g) => {
          const busy = busyId === g.id;
          const status = g.approval_status;
          return (
            <li key={g.id} style={{ padding: '16px 22px', borderBottom: '1px solid var(--mj-border)' }}>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8 }}>
                <div>
                  <strong style={{ fontSize: 14 }}>{g.guest_name || 'A guest'}</strong>
                  <span className={`wmod-pill wmod-pill--${status === 'approved' ? 'yes' : status === 'rejected' ? 'no' : 'maybe'}`} style={{ marginLeft: 8 }}>
                    {status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Pending'}
                  </span>
                </div>
                <span className="wmod-td-muted" style={{ fontSize: 12.5 }}>
                  {g.created_at ? new Date(g.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                </span>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 12px', overflowWrap: 'anywhere' }}>{g.message}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {status !== 'approved' && (
                  <button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" disabled={busy}
                    onClick={() => act(() => api.approveGreeting(g.id), 'Greeting approved.', g.id)}>Approve</button>
                )}
                {status !== 'rejected' && (
                  <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" disabled={busy}
                    onClick={() => act(() => api.rejectGreeting(g.id), 'Greeting rejected.', g.id)}>Reject</button>
                )}
                <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" disabled={busy} style={{ marginLeft: 'auto' }}
                  onClick={() => act(() => api.deleteGreeting(g.id), 'Greeting deleted.', g.id)}>Delete</button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
