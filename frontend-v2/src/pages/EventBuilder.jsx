import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import StudioModule, {
  Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash,
  numberFmt, rupees, shortDate,
} from '@/components/StudioModule';
import * as api from '@/api/events';
import EventTemplatePicker from '@/components/events/EventTemplatePicker';
import EventInvitationCard from '@/components/events/EventInvitationCard';

// Event builder. Writes go through PATCH /autosave with a patch body — that is
// the only write path the lifecycle service exposes, and publishing is gated
// behind POST /validate, which returns the exact list of what is still missing.
// Showing those errors verbatim is the point: the backend already knows why an
// event cannot go live, so the UI should not guess.

const DRAFT_STATES = new Set(['draft', 'DRAFT']);

export default function EventBuilder() {
  const { eventId } = useParams();
  const [view, setView] = useState('details');
  const [event, setEvent] = useState(null);
  const [committee, setCommittee] = useState([]);
  const [finance, setFinance] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, flash] = useFlash();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [e, m, f] = await Promise.all([
        api.get(eventId).then((r) => r.data),
        api.members(eventId).then((r) => r.data).catch(() => null),
        api.financeDashboard(eventId).then((r) => r.data).catch(() => null),
      ]);
      setEvent(e?.event || e);
      setCommittee(m?.members || m?.items || (Array.isArray(m) ? m : []));
      setFinance(f);
    } catch (e) {
      setError(e?.response?.status === 404
        ? 'That event no longer exists, or the event module is switched off.'
        : e?.response?.data?.detail || 'Could not load this event.');
    } finally { setLoading(false); }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const isDraft = event ? DRAFT_STATES.has(event.status) : true;

  return (
    <StudioModule
      active="Events"
      title={event?.title || 'Untitled event'}
      sub={event
        ? `${String(event.event_type || '').replace(/_/g, ' ')} · ${event.publish_slug ? `/e/${event.publish_slug}` : 'not published yet'}`
        : ' '}
      actions={(
        <>
          <Link className="wmod-btn wmod-btn--ghost wmod-btn--sm" to="/events">All events</Link>
          {event?.publish_slug && (
            <a className="wmod-btn wmod-btn--ghost wmod-btn--sm" href={`/e/${event.publish_slug}`} target="_blank" rel="noreferrer">View public page</a>
          )}
        </>
      )}
    >
      {loading && <div className="wmod-skel" style={{ height: 340 }} />}
      {!loading && error && (
        <Panel tone="error">
          <p className="wmod-error-body">{error}</p>
          <Link className="wmod-btn wmod-btn--primary" to="/events">Back to events</Link>
        </Panel>
      )}

      {!loading && !error && event && (
        <>
          <StatRow items={[
            { label: 'Status', value: isDraft ? 'Draft' : String(event.status || '').toLowerCase() },
            { label: 'Committee', value: numberFmt.format(committee.length) },
            { label: 'Collected', value: rupees.format(finance?.total_collected ?? finance?.total_donations ?? 0) },
            { label: 'Spent', value: rupees.format(finance?.total_spent ?? finance?.total_expenses ?? 0) },
          ]}
          />

          <Segmented
            ariaLabel="Event views"
            value={view}
            onChange={setView}
            options={[
              { id: 'details', label: 'Details' },
              { id: 'design', label: 'Design' },
              { id: 'committee', label: 'Committee', count: committee.length },
              { id: 'money', label: 'Money' },
            ]}
          />

          {view === 'details' && (
            <Details event={event} eventId={eventId} isDraft={isDraft} reload={load} flash={flash} />
          )}
          {view === 'design' && (
            <Design event={event} eventId={eventId} reload={load} flash={flash} />
          )}
          {view === 'committee' && (
            <Committee eventId={eventId} rows={committee} reload={load} flash={flash} />
          )}
          {view === 'money' && <Money finance={finance} event={event} eventId={eventId} />}
        </>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}

function Details({ event, eventId, isDraft, reload, flash }) {
  const [f, setF] = useState({
    title: event.title || '',
    description: event.description || '',
    start_date: (event.start_date || '').slice(0, 10),
    end_date: (event.end_date || '').slice(0, 10),
    language: event.language || 'en',
  });
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [validation, setValidation] = useState(null);

  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErr(null); };

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try { await fn(); if (msg) flash(msg); await reload(); }
    catch (e) { setErr(e?.response?.data?.detail || 'That did not save.'); }
    finally { setBusy(null); }
  };

  const save = () => run('save', () => api.autosave(eventId, {
    title: f.title.trim() || null,
    description: f.description.trim() || null,
    start_date: f.start_date || null,
    end_date: f.end_date || null,
    language: f.language,
  }), 'Saved.');

  const goLive = async () => {
    setBusy('publish');
    setErr(null);
    setValidation(null);
    try {
      // The server owns the readiness rules; ask before trying.
      const { data: v } = await api.validate(eventId);
      if (!v.ok) { setValidation(v.errors || []); return; }
      await api.publish(eventId);
      flash('Event is live.');
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not publish.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <InlineError message={err} />

      {validation && validation.length > 0 && (
        <Panel title="Not ready to publish yet" sub="The server checks these before an event can go live.">
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.8, color: 'var(--mj-error-text)' }}>
            {validation.map((v, i) => <li key={i}>{typeof v === 'string' ? v : v.message || JSON.stringify(v)}</li>)}
          </ul>
        </Panel>
      )}

      <Panel title="Event details">
        <div className="wmod-grid">
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="e-title">Title</label>
            <input id="e-title" data-mj-field className="wmod-input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Nagar Mandal Ganesh Utsav 2026" />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="e-start">Starts</label>
            <input id="e-start" data-mj-field className="wmod-input" type="date" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="e-end">Ends</label>
            <input id="e-end" data-mj-field className="wmod-input" type="date" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </div>
          <div className="wmod-field wmod-field--wide">
            <label className="wmod-label" htmlFor="e-desc">Description</label>
            <textarea id="e-desc" data-mj-field className="wmod-input" rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" className="wmod-btn wmod-btn--primary" disabled={busy === 'save'} onClick={save}>
            {busy === 'save' ? 'Saving…' : 'Save details'}
          </button>
          {isDraft ? (
            <button type="button" className="wmod-btn wmod-btn--primary" disabled={busy === 'publish'} onClick={goLive}>
              {busy === 'publish' ? 'Checking…' : 'Publish event'}
            </button>
          ) : (
            <button
              type="button"
              className="wmod-btn wmod-btn--ghost"
              disabled={busy === 'archive'}
              onClick={() => run('archive', () => api.archive(eventId), 'Event archived.')}
            >
              {busy === 'archive' ? 'Working…' : 'Archive event'}
            </button>
          )}
        </div>
        {event.edit_count > 0 && (
          <p className="wmod-hint" style={{ marginTop: 12 }}>
            Edited {event.edit_count} time{event.edit_count === 1 ? '' : 's'} since publishing.
          </p>
        )}
      </Panel>
    </>
  );
}

function Design({ event, eventId, reload, flash }) {
  // `theme` is stored as ONE object at the event root (registry section
  // `theme_selection`, store `root_obj:theme`), and autosave REPLACES that
  // object wholesale rather than merging into it. So the colours have to be
  // sent back with the template or picking a design would silently wipe them.
  const theme = event.theme || {};
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [picked, setPicked] = useState(theme.template || event.template_id || '');

  const save = async (templateId) => {
    setPicked(templateId);
    setBusy(true);
    setErr(null);
    try {
      await api.autosave(eventId, { theme_selection: { ...theme, template: templateId } });
      flash('Design saved.');
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not save that design.');
      setPicked(theme.template || event.template_id || '');
    } finally { setBusy(false); }
  };

  // The event doc already carries the resolved template (artwork + text-zone
  // layout) — the backend attaches it on read — so the live preview needs no
  // extra request and cannot disagree with what the public page will show.
  const live = event.template;
  const content = event.content || {};

  return (
    <>
      <InlineError message={err} />

      <Panel
        title="Invitation design"
        sub="Approved artwork. Your wording is laid into the empty centre — the same card guests will see."
      >
        <EventTemplatePicker
          eventType={event.event_type}
          value={picked}
          onPick={save}
          disabled={busy}
          preview={false}
        />
      </Panel>

      {live && (
        <Panel title="How it looks" sub="This is the live card, with whatever invitation content you have saved so far.">
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ width: 260, flex: '0 0 auto' }}>
              <EventInvitationCard template={live} content={content} variant="preview" />
            </div>
            <div style={{ flex: '1 1 240px', minWidth: 220 }}>
              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600 }}>{live.name}</p>
              <p className="wmod-hint" style={{ margin: '0 0 14px' }}>{live.palette}</p>
              {!content.heading && !content.welcome_message && (
                <p className="wmod-hint">
                  The centre is empty because no invitation wording is saved yet.
                  Add it in the builder and it appears here and on the public page.
                </p>
              )}
              {event.publish_slug && (
                <a
                  className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                  href={`/e/${event.publish_slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open the public page
                </a>
              )}
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

function Committee({ eventId, rows, reload, flash }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try { await fn(); flash(msg); await reload(); }
    catch (e) { setErr(e?.response?.data?.detail || 'That did not work.'); }
    finally { setBusy(null); }
  };

  return (
    <>
      <InlineError message={err} />
      <Panel title="Committee" sub="The people running this event. Shown publicly so donors know who they are giving to." pad={false}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--mj-border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="wmod-field" style={{ minWidth: 160 }}>
            <label className="wmod-label" htmlFor="cm-name">Name</label>
            <input id="cm-name" data-mj-field className="wmod-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="wmod-field" style={{ minWidth: 140 }}>
            <label className="wmod-label" htmlFor="cm-role">Role</label>
            <input id="cm-role" data-mj-field className="wmod-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Treasurer" />
          </div>
          <div className="wmod-field" style={{ minWidth: 150 }}>
            <label className="wmod-label" htmlFor="cm-phone">Phone</label>
            <input id="cm-phone" data-mj-field className="wmod-input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </div>
          <button
            type="button"
            className="wmod-btn wmod-btn--primary"
            disabled={busy === 'add' || !name.trim()}
            onClick={() => run('add', async () => {
              await api.addMember(eventId, { name: name.trim(), role: role.trim() || null, phone: phone.trim() || null });
              setName(''); setRole(''); setPhone('');
            }, 'Member added.')}
          >
            {busy === 'add' ? 'Adding…' : 'Add'}
          </button>
        </div>

        {rows.length === 0 ? (
          <Empty title="No committee members yet" body="Add at least the organiser and the treasurer — donors look for them." />
        ) : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th /></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id || m.member_id}>
                    <td>{m.name}</td>
                    <td className="wmod-td-muted">{m.role || '—'}</td>
                    <td className="wmod-td-muted">{m.phone || '—'}</td>
                    <td className="wmod-td-actions">
                      <button
                        type="button"
                        className="wmod-btn wmod-btn--danger wmod-btn--sm"
                        disabled={busy === (m.id || m.member_id)}
                        onClick={() => run(m.id || m.member_id, () => api.removeMember(eventId, m.id || m.member_id), 'Removed.')}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Money({ finance, event, eventId }) {
  if (!finance) {
    return (
      <Panel>
        <Empty
          title="Money tracking is not set up for this event"
          body="Once the finance module is configured and donations start arriving, the ledger and the shareable public report appear here."
        />
      </Panel>
    );
  }

  const donations = finance.donations || finance.recent_donations || [];
  const expenses = finance.expenses || finance.recent_expenses || [];
  const collected = Number(finance.total_collected ?? finance.total_donations ?? 0);
  const spent = Number(finance.total_spent ?? finance.total_expenses ?? 0);

  return (
    <>
      <Panel title="Balance" sub="Visible to the committee, and publicly if you have the spending report switched on.">
        <Row label="Collected" value={rupees.format(collected)} />
        <Row label="Spent" value={rupees.format(spent)} />
        <Row label="In hand" value={rupees.format(collected - spent)} last />
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {event?.publish_slug && (
            <a className="wmod-btn wmod-btn--ghost" href={`/e/${event.publish_slug}/money`} target="_blank" rel="noreferrer">
              Public money page
            </a>
          )}
          <a className="wmod-btn wmod-btn--ghost" href={api.moneyReportCsv(eventId)}>Download CSV</a>
        </div>
      </Panel>

      <Panel title="Recent donations" pad={false}>
        {donations.length === 0 ? <Empty title="No donations yet" /> : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead><tr><th>From</th><th>Amount</th><th>Method</th><th>When</th></tr></thead>
              <tbody>
                {donations.slice(0, 30).map((d, i) => (
                  <tr key={d.id || i}>
                    <td>{d.donor_name || d.name || 'Anonymous'}</td>
                    <td>{rupees.format(d.amount || 0)}</td>
                    <td className="wmod-td-muted">{d.method || d.mode || '—'}</td>
                    <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(d.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Recent expenses" pad={false}>
        {expenses.length === 0 ? <Empty title="No expenses recorded" /> : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead><tr><th>What</th><th>Amount</th><th>When</th></tr></thead>
              <tbody>
                {expenses.slice(0, 30).map((x, i) => (
                  <tr key={x.id || i}>
                    <td>{x.title || x.description || x.category || 'Expense'}</td>
                    <td>{rupees.format(x.amount || 0)}</td>
                    <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(x.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Row({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--mj-border)', fontSize: 13.5 }}>
      <span className="wmod-td-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
