import { useState } from 'react';
import { Link } from 'react-router-dom';
import StudioModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/StudioModule';
import * as api from '@/api/events';

// Dynamic Event Engine dashboard — festivals and community celebrations, as
// opposed to weddings under /studio/wedding/*.
//
// Field names are the backend's, verified against event_lifecycle_service.py:
// event_id / title / publish_slug / status. The engine is behind a server
// gate, so a 404 on the registry means "disabled", not "broken" — this page
// says so instead of rendering an empty list that reads as a bug.

const DRAFT_STATES = new Set(['draft', 'DRAFT']);

export default function EventsDashboard() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [newType, setNewType] = useState('');

  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      // 404 here is the documented "module off" signal.
      api.registry().then((r) => r.data).catch((e) => (e?.response?.status === 404 ? null : Promise.reject(e))),
      api.list().then((r) => r.data).catch(() => null),
    ]).then(([reg, events]) => ({ reg, events })),
  );

  const types = data?.reg?.event_types || [];
  const events = data?.events?.events || [];
  const engineOff = data?.reg === null;

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try { await fn(); flash(msg); await reload(); }
    catch (e) { setErr(e?.response?.data?.detail || 'That did not work.'); }
    finally { setBusy(null); }
  };

  return (
    <StudioModule
      active="Events"
      title="Events"
      sub="Festivals and community celebrations. Weddings live under Your weddings — these are a different product with a committee and a shared purse."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && engineOff && (
        <Panel title="The event engine is switched off">
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--mj-muted)', margin: '0 0 16px', maxWidth: '62ch' }}>
            This deployment has the event module disabled, so every event route
            returns nothing — including the list of available festival types. A
            super-admin turns it on from the feature-flag switchboard; the
            types then appear here and you can create your first event.
          </p>
          <Link className="wmod-btn wmod-btn--ghost" to="/studio/dashboard">Back to weddings</Link>
        </Panel>
      )}

      {!loading && !error && !engineOff && (
        <>
          <StatRow items={[
            { label: 'Your events', value: numberFmt.format(events.length) },
            { label: 'Published', value: numberFmt.format(events.filter((e) => !DRAFT_STATES.has(e.status)).length) },
            { label: 'Types available', value: numberFmt.format(types.length) },
          ]}
          />

          <InlineError message={err} />

          <Panel title="Start an event" sub="Pick the kind of celebration. The engine seeds its schedule, sections and starter content, then you fill in the details.">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="wmod-field" style={{ minWidth: 240 }}>
                <label className="wmod-label" htmlFor="ev-type">Event type</label>
                <select id="ev-type" data-mj-field className="wmod-input" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  <option value="">Choose…</option>
                  {types.map((t) => (
                    <option key={t.event_type} value={t.event_type}>
                      {t.name}{t.category ? ` · ${t.category}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="wmod-btn wmod-btn--primary"
                disabled={busy === 'new' || !newType}
                onClick={() => run('new', async () => {
                  await api.create(newType);
                  setNewType('');
                }, 'Draft event created. Open it to add the details.')}
              >
                {busy === 'new' ? 'Creating…' : 'Create draft'}
              </button>
            </div>
            <p className="wmod-hint" style={{ marginTop: 10 }}>
              A new event starts as a draft with no title — you name it in the builder.
            </p>
          </Panel>

          <Panel title="Your events" pad={false}>
            {events.length === 0 ? (
              <Empty title="No events yet" body="Create a draft above; everything after that happens in its builder." />
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>Event</th><th>Type</th><th>Status</th><th>Updated</th><th /></tr></thead>
                  <tbody>
                    {events.map((e) => {
                      const isDraft = DRAFT_STATES.has(e.status);
                      return (
                        <tr key={e.event_id}>
                          <td>
                            {e.title || <span className="wmod-td-muted">Untitled draft</span>}
                            {e.publish_slug && <><br /><span className="wmod-td-muted">/e/{e.publish_slug}</span></>}
                          </td>
                          <td className="wmod-td-muted" style={{ textTransform: 'capitalize' }}>
                            {String(e.event_type || '').replace(/_/g, ' ')}
                          </td>
                          <td>
                            <span className={`wmod-pill wmod-pill--${isDraft ? 'neutral' : 'yes'}`}>
                              {isDraft ? 'Draft' : String(e.status || '').toLowerCase()}
                            </span>
                          </td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{relTime(e.updated_at)}</td>
                          <td className="wmod-td-actions">
                            <Link className="wmod-btn wmod-btn--primary wmod-btn--sm" to={`/events/${e.event_id}/builder`}>Open</Link>
                            {e.publish_slug && (
                              <a className="wmod-btn wmod-btn--ghost wmod-btn--sm" style={{ marginLeft: 6 }} href={`/e/${e.publish_slug}`} target="_blank" rel="noreferrer">
                                View
                              </a>
                            )}
                          </td>
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

      <Toast message={toast} />
    </StudioModule>
  );
}
