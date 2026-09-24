import { useState } from 'react';
import AdminModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/AdminModule';
import * as eventsApi from '@/api/events';       // legacy festival engine (usually OFF)
import { listPhotographers } from '@/api/admin';
import { createFor as createWeddingFor, listPaginated } from '@/api/weddings';

// Admin Events = the canonical operational panel for the platform's events.
//
// An "event" IS a wedding profile (db.profiles). The super-admin sees EVERY
// studio's events via /api/admin/profiles/paginated — the same records the
// photographer dashboard and the "create & assign" panel below use, so the
// three surfaces can never disagree. (This page previously read the dormant
// festival engine db.events and so always showed Total 0 while photographers
// saw their events — see admin-events-two-collections.)
//
// The festival engine is preserved as a secondary panel that appears only when
// that module is switched on (its routes 404 when off → the panel hides).

const ACTIONS = [
  ['feature', 'Feature', 'ghost'],
  ['unfeature', 'Unfeature', 'ghost'],
  ['flag', 'Flag', 'ghost'],
  ['unflag', 'Unflag', 'ghost'],
  ['hide', 'Hide', 'ghost'],
  ['unhide', 'Unhide', 'ghost'],
  ['suspend', 'Suspend', 'danger'],
  ['restore', 'Restore', 'primary'],
];

// Suspending takes an event off the public internet; the server records the
// reason in the audit log, so asking for one here is not busywork.
const NEEDS_REASON = new Set(['suspend', 'reject', 'flag']);

const STATUS_TABS = [
  ['all', 'Any status'],
  ['published', 'Published'],
  ['draft', 'Draft'],
  ['expiring', 'Expiring'],
  ['archived', 'Archived'],
];

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v).slice(0, 10)
    : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Create a wedding invitation and assign it to a photographer. The backend
// already supports this: create_profile (server.py) honours
// ?on_behalf_of=<photographerId> for a super-admin and stamps the new
// profile's admin_id to that studio — so the invitation lands on THEIR
// dashboard. This panel is the missing UI for that endpoint.
function CreateAssignWedding({ onCreated }) {
  const { data: pgRaw } = useAsync(
    () => listPhotographers().then((r) => r.data).catch(() => []),
    [],
  );
  const photographers = Array.isArray(pgRaw) ? pgRaw : (pgRaw?.items || pgRaw?.admins || []);

  const BLANK = {
    owner: '', groom_name: '', bride_name: '', event_type: 'wedding',
    event_date: '', venue: '', city: '', design_id: 'royal_heritage',
  };
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setDone(null);
    if (!form.owner) { setErr('Choose the photographer this wedding belongs to.'); return; }
    if (!form.groom_name.trim() || !form.bride_name.trim() || !form.event_date || !form.venue.trim()) {
      setErr('Names, event date and venue are all required.'); return;
    }
    setBusy(true);
    try {
      const { data } = await createWeddingFor(form.owner, {
        groom_name: form.groom_name.trim(),
        bride_name: form.bride_name.trim(),
        event_type: form.event_type,
        event_date: new Date(form.event_date).toISOString(),
        venue: form.venue.trim(),
        city: form.city.trim() || undefined,
        design_id: form.design_id || undefined,
        invitation_category: 'wedding',
      });
      const owner = photographers.find((p) => p.id === form.owner);
      setDone({ ...data, ownerName: owner?.name || owner?.email || form.owner });
      setForm(BLANK);
      if (onCreated) onCreated();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not create the wedding.');
    } finally { setBusy(false); }
  };

  const fld = { minWidth: 170, flex: '1 1 170px' };
  return (
    <Panel
      title="Create a wedding & assign it to a photographer"
      sub="Creates the invitation under the chosen studio's account — it shows up on their dashboard and they manage it from there."
      pad={false}
    >
      <form onSubmit={submit} style={{ padding: '16px 22px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="wmod-field" style={{ minWidth: 220, flex: '1 1 220px' }}>
          <label className="wmod-label" htmlFor="ca-owner">Photographer</label>
          <select id="ca-owner" data-mj-field className="wmod-input" value={form.owner} onChange={(e) => set('owner', e.target.value)}>
            <option value="">Choose a studio…</option>
            {photographers.map((p) => (
              <option key={p.id} value={p.id}>{(p.name || p.email || p.id)}{p.name && p.email ? ` — ${p.email}` : ''}</option>
            ))}
          </select>
        </div>
        <div className="wmod-field" style={fld}>
          <label className="wmod-label" htmlFor="ca-groom">Groom</label>
          <input id="ca-groom" data-mj-field className="wmod-input" value={form.groom_name} onChange={(e) => set('groom_name', e.target.value)} placeholder="Arjun" />
        </div>
        <div className="wmod-field" style={fld}>
          <label className="wmod-label" htmlFor="ca-bride">Bride</label>
          <input id="ca-bride" data-mj-field className="wmod-input" value={form.bride_name} onChange={(e) => set('bride_name', e.target.value)} placeholder="Meera" />
        </div>
        <div className="wmod-field" style={{ minWidth: 140 }}>
          <label className="wmod-label" htmlFor="ca-type">Type</label>
          <select id="ca-type" data-mj-field className="wmod-input" value={form.event_type} onChange={(e) => set('event_type', e.target.value)}>
            {['wedding', 'engagement', 'reception', 'haldi', 'mehendi', 'sangeet'].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="wmod-field" style={{ minWidth: 150 }}>
          <label className="wmod-label" htmlFor="ca-date">Event date</label>
          <input id="ca-date" type="date" data-mj-field className="wmod-input" value={form.event_date} onChange={(e) => set('event_date', e.target.value)} />
        </div>
        <div className="wmod-field" style={fld}>
          <label className="wmod-label" htmlFor="ca-venue">Venue</label>
          <input id="ca-venue" data-mj-field className="wmod-input" value={form.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Taj West End" />
        </div>
        <div className="wmod-field" style={fld}>
          <label className="wmod-label" htmlFor="ca-city">City</label>
          <input id="ca-city" data-mj-field className="wmod-input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="Bengaluru" />
        </div>
        <button type="submit" className="wmod-btn wmod-btn--primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create & assign'}
        </button>
      </form>
      {err && <div style={{ padding: '0 22px 16px' }}><InlineError message={err} /></div>}
      {done && (
        <div style={{ margin: '0 22px 18px', padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.35)', fontSize: 13 }}>
          Created <strong>{done.groom_name} &amp; {done.bride_name}</strong> under <strong>{done.ownerName}</strong>.{' '}
          {done.slug && <a href={`/invite/${done.slug}`} target="_blank" rel="noreferrer">/invite/{done.slug}</a>}
        </div>
      )}
    </Panel>
  );
}

export default function AdminEvents() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  // Canonical list + the three headline counts, all from db.profiles. A
  // super-admin token returns every studio's events. The three count calls are
  // page_size:1 (we only read `total`), so they are cheap.
  const { data, error, loading, reload } = useAsync(() => Promise.all([
    listPaginated({ status: status || 'all', q, page_size: 100, sort: 'newest' }).then((r) => r.data).catch(() => null),
    listPaginated({ status: 'all', page_size: 1 }).then((r) => r.data?.total ?? 0).catch(() => 0),
    listPaginated({ status: 'published', page_size: 1 }).then((r) => r.data?.total ?? 0).catch(() => 0),
    listPaginated({ status: 'draft', page_size: 1 }).then((r) => r.data?.total ?? 0).catch(() => 0),
    listPhotographers().then((r) => r.data).catch(() => []),
    // Legacy festival engine — null (hidden) whenever the module is off.
    eventsApi.adminSearch({ limit: 25 }).then((r) => r.data).catch(() => null),
  ]).then(([page, total, published, draft, pg, festival]) =>
    ({ page, total, published, draft, pg, festival })), [q, status]);

  const rows = data?.page?.items || [];
  const pgList = Array.isArray(data?.pg) ? data.pg : (data?.pg?.items || data?.pg?.admins || []);
  const ownerMap = {};
  pgList.forEach((p) => { ownerMap[p.id] = p.name || p.email || p.id; });

  const festivalRows = data?.festival?.items || data?.festival?.events || [];
  const isPublished = (e) => e.is_published || String(e.status || '').toUpperCase() === 'PUBLISHED';

  const moderate = (ev, action) => {
    const id = ev.event_id || ev.id;
    let reason = '';
    if (NEEDS_REASON.has(action)) {
      reason = window.prompt(`Why are you about to ${action} “${ev.title || id}”? This goes in the audit log.`) || '';
      if (!reason.trim()) return;   // cancelled, or refused to say
    }
    setBusy(`${id}-${action}`); setErr(null);
    eventsApi.adminModerate(id, action, reason.trim())
      .then(() => { flash(`Event ${action}d.`); return reload(); })
      .catch((e) => setErr(e?.response?.data?.detail || 'That did not work.'))
      .finally(() => setBusy(null));
  };

  return (
    <AdminModule
      active="Events"
      title="Events"
      sub="Every event on the platform — created by MAJA and assigned to a studio. This is the canonical list; a photographer sees only their own."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Total', value: loading ? '—' : numberFmt.format(data?.total ?? 0) },
        { label: 'Published', value: loading ? '—' : numberFmt.format(data?.published ?? 0) },
        { label: 'Draft', value: loading ? '—' : numberFmt.format(data?.draft ?? 0) },
        { label: 'Showing', value: loading ? '—' : numberFmt.format(rows.length) },
      ]}
      />

      <InlineError message={err} />

      <CreateAssignWedding onCreated={reload} />

      {loading && <Loading rows={3} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="Events" sub="Search by couple, slug, city or venue." pad={false}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--mj-border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="wmod-field" style={{ minWidth: 220 }}>
                <label className="wmod-label" htmlFor="ev-q">Search</label>
                <input id="ev-q" data-mj-field className="wmod-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Arjun & Meera…" />
              </div>
              <div className="wmod-field" style={{ minWidth: 170 }}>
                <label className="wmod-label" htmlFor="ev-status">Status</label>
                <select id="ev-status" data-mj-field className="wmod-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUS_TABS.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty
                  title={q || status !== 'all' ? 'Nothing matches that' : 'No events yet'}
                  body={q || status !== 'all'
                    ? 'Try a different search, or clear the status filter.'
                    : 'Create one above and assign it to a photographer — it appears here and on their dashboard instantly.'}
                />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr>
                    <th>Event</th><th>Assigned photographer</th><th>Date</th><th>Venue</th>
                    <th>Status</th><th>AI match</th><th>Updated</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.groom_name || '—'} &amp; {e.bride_name || '—'}</strong>
                          <br />
                          <span className="wmod-td-muted" style={{ fontSize: 12 }}>
                            <code>{String(e.id || '').slice(0, 8)}</code>
                            {e.slug && (
                              <>
                                {' · '}
                                <a href={`/invite/${e.slug}`} target="_blank" rel="noreferrer">/invite/{e.slug}</a>
                              </>
                            )}
                          </span>
                        </td>
                        <td className="wmod-td-muted">{ownerMap[e.admin_id] || e.admin_id || '—'}</td>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.event_date)}</td>
                        <td className="wmod-td-muted">{e.venue || e.city || '—'}</td>
                        <td>
                          <span className={`wmod-pill ${isPublished(e) ? 'wmod-pill--yes' : 'wmod-pill--neutral'}`}>
                            {isPublished(e) ? 'Published' : 'Draft'}
                          </span>
                          {e.archived_at && <span className="wmod-pill wmod-pill--no" style={{ marginLeft: 6 }}>Archived</span>}
                        </td>
                        <td>
                          <span className={`wmod-pill ${e.gallery_config?.enabled ? 'wmod-pill--yes' : 'wmod-pill--neutral'}`}>
                            {e.gallery_config?.enabled ? 'On' : 'Off'}
                          </span>
                        </td>
                        <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{e.updated_at ? relTime(e.updated_at) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {/* Legacy festival engine — appears only when that module is on. */}
          {festivalRows.length > 0 && (
            <Panel title="Festival events (legacy engine)" sub="Community festival events (db.events). Moderation actions apply only to these." pad={false}>
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead><tr><th>Event</th><th>Status</th><th>Owner</th><th /></tr></thead>
                  <tbody>
                    {festivalRows.map((e) => {
                      const id = e.event_id || e.id;
                      return (
                        <tr key={id}>
                          <td>
                            {e.title || 'Untitled'}
                            {e.is_featured && <span className="wmod-pill wmod-pill--yes" style={{ marginLeft: 8 }}>Featured</span>}
                            {e.is_flagged && <span className="wmod-pill wmod-pill--no" style={{ marginLeft: 8 }}>Flagged</span>}
                            {e.is_suspended && <span className="wmod-pill wmod-pill--no" style={{ marginLeft: 8 }}>Suspended</span>}
                            {e.publish_slug && (
                              <>
                                <br />
                                <a className="wmod-td-muted" href={`/e/${e.publish_slug}`} target="_blank" rel="noreferrer">/e/{e.publish_slug}</a>
                              </>
                            )}
                          </td>
                          <td><span className="wmod-pill wmod-pill--neutral">{String(e.status || '—').replace(/_/g, ' ')}</span></td>
                          <td className="wmod-td-muted">{e.owner_name || e.owner_id || '—'}</td>
                          <td className="wmod-td-actions">
                            {ACTIONS.map(([a, label, tone]) => (
                              <button
                                key={a}
                                type="button"
                                className={`wmod-btn wmod-btn--sm wmod-btn--${tone}`}
                                style={{ marginLeft: 6 }}
                                disabled={busy === `${id}-${a}`}
                                onClick={() => moderate(e, a)}
                              >
                                {busy === `${id}-${a}` ? '…' : label}
                              </button>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      )}

      <Toast message={toast} />
    </AdminModule>
  );
}
