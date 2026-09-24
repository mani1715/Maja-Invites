import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import WeddingModule, { Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash } from '@/components/WeddingModule';
import * as api from '@/api/weddingGuests';
import GuestVoiceNote from '@/components/wedding/GuestVoiceNote';
import ThankYouEditor from '@/components/wedding/ThankYouEditor';

// Guests tab. Replaces the legacy GuestListManager + RSVPManagement pair —
// same capabilities, one screen, switched by a segmented control so the
// per-wedding rail stays at 8 tabs.
//
// ?view=rsvps deep-links the RSVP half; App.jsx's legacy-URL redirects use it.

const MEALS = [
  { id: 'unspecified', label: 'Not specified' },
  { id: 'veg', label: 'Vegetarian' },
  { id: 'non_veg', label: 'Non-vegetarian' },
  { id: 'jain', label: 'Jain' },
];

const numberFmt = new Intl.NumberFormat('en-IN');

export default function WeddingGuests() {
  const { weddingId } = useParams();
  return (
    <WeddingModule weddingId={weddingId} active="Guests" title="Guests">
      {(profile) => <GuestsBody profileId={profile.id} profile={profile} />}
    </WeddingModule>
  );
}

function GuestsBody({ profileId, profile }) {
  const [params, setParams] = useSearchParams();
  const rawView = params.get('view');
  const view = rawView === 'rsvps' ? 'rsvps' : rawView === 'thanks' ? 'thanks' : 'list';
  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'list') next.delete('view'); else next.set('view', v);
    setParams(next, { replace: true });
  };

  const [guests, setGuests] = useState(null);
  const [rsvps, setRsvps] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, flash] = useFlash();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [g, r, s] = await Promise.all([
        api.listGuests(profileId),
        api.listRsvps(profileId),
        api.rsvpStats(profileId).catch(() => ({ data: null })),
      ]);
      setGuests(g.data);
      setRsvps(r.data || []);
      setStats(s.data);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load guests.');
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const loading = guests === null && rsvps === null && !error;

  return (
    <>
      <StatRow items={[
        { label: 'On the list', value: guests ? numberFmt.format(guests.total) : '—', hint: guests ? `${guests.vip} VIP` : undefined },
        { label: 'RSVPs in', value: stats ? numberFmt.format(stats.total_rsvps) : (rsvps ? numberFmt.format(rsvps.length) : '—'), hint: stats ? `${stats.attending_count} yes · ${stats.not_attending_count} no` : undefined },
        { label: 'Heads expected', value: stats ? numberFmt.format(stats.total_guest_count) : '—', hint: stats ? `${stats.maybe_count} still maybe` : undefined },
        { label: 'Invitations opened', value: guests ? numberFmt.format(guests.opened) : '—', hint: guests ? `${guests.sent} marked sent` : undefined },
      ]}
      />

      <Segmented
        ariaLabel="Guest views"
        value={view}
        onChange={setView}
        options={[
          { id: 'list', label: 'Guest list', count: guests?.total },
          { id: 'rsvps', label: 'RSVP replies', count: rsvps?.length },
          { id: 'thanks', label: 'Thank you' },
        ]}
      />

      <InlineError message={error} />

      {loading && <div className="wmod-skel" style={{ height: 320 }} />}

      {!loading && view === 'list' && (
        <GuestList
          profileId={profileId}
          data={guests}
          reload={load}
          flash={flash}
          busy={busy}
          setBusy={setBusy}
          slug={profile.slug}
        />
      )}

      {!loading && view === 'rsvps' && (
        <RsvpList profileId={profileId} rsvps={rsvps} flash={flash} />
      )}

      {!loading && view === 'thanks' && (
        <ThankYouEditor profileId={profileId} flash={flash} />
      )}

      <Toast message={toast} />
    </>
  );
}

// ------------------------------------------------------------- guest list

function GuestList({ profileId, data, reload, flash, busy, setBusy, slug }) {
  const [editing, setEditing] = useState(null); // guest object or 'new'
  const [selected, setSelected] = useState([]);
  const [q, setQ] = useState('');
  const [opError, setOpError] = useState(null);
  const fileRef = useRef(null);

  const guests = data?.guests || [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return guests;
    return guests.filter((g) => [g.name, g.phone, g.email, g.relationship]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)));
  }, [guests, q]);

  const allShownSelected = filtered.length > 0 && filtered.every((g) => selected.includes(g.id));

  const toggleAll = () => {
    setSelected(allShownSelected ? [] : filtered.map((g) => g.id));
  };

  const removeSelected = async () => {
    if (!selected.length) return;
    setBusy(true);
    setOpError(null);
    try {
      await api.bulkDeleteGuests(profileId, selected);
      flash(`${selected.length} guest${selected.length === 1 ? '' : 's'} removed.`);
      setSelected([]);
      await reload();
    } catch (e) {
      setOpError(e?.response?.data?.detail || 'Could not remove those guests.');
    } finally { setBusy(false); }
  };

  const doImport = async (file) => {
    if (!file) return;
    setBusy(true);
    setOpError(null);
    try {
      const { data: res } = await api.importGuests(profileId, file);
      const added = res?.imported ?? res?.added ?? 0;
      const skipped = res?.skipped ?? 0;
      flash(`Imported ${added} guest${added === 1 ? '' : 's'}${skipped ? `, skipped ${skipped}` : ''}.`);
      await reload();
    } catch (e) {
      setOpError(e?.response?.data?.detail || 'Import failed. Check the file matches the template.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const copyWhatsapp = async () => {
    setBusy(true);
    setOpError(null);
    try {
      const { data: res } = await api.whatsappLinks(profileId, selected.length ? selected : undefined);
      const rows = res?.links || res || [];
      const text = (Array.isArray(rows) ? rows : [])
        .map((r) => `${r.name || r.guest_name || ''}\t${r.whatsapp_url || r.url || r.link || ''}`)
        .join('\n');
      if (!text) { setOpError('No links came back for those guests.'); return; }
      await navigator.clipboard.writeText(text);
      flash('Personalised WhatsApp links copied.');
    } catch (e) {
      setOpError(e?.response?.data?.detail || 'Could not build the WhatsApp links.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <InlineError message={opError} />

      <Panel
        title="Guest list"
        sub="Everyone the studio has added. Each guest gets a personalised link so you can see who opened the invitation."
        actions={(
          <>
            <a className="wmod-btn wmod-btn--ghost wmod-btn--sm" href={api.guestTemplateUrl(profileId)}>CSV template</a>
            <label className="wmod-btn wmod-btn--ghost wmod-btn--sm" htmlFor="guest-import">
              Import CSV
              <input
                ref={fileRef}
                id="guest-import"
                type="file"
                accept=".csv,text/csv"
                style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
                onChange={(e) => doImport(e.target.files?.[0])}
                disabled={busy}
              />
            </label>
            <button type="button" className="wmod-btn wmod-btn--primary wmod-btn--sm" onClick={() => setEditing('new')}>
              + Add guest
            </button>
          </>
        )}
        pad={false}
      >
        <div style={{ padding: '14px 22px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid var(--mj-border)' }}>
          <input
            className="wmod-input"
            data-mj-field
            style={{ maxWidth: 280, minHeight: 42 }}
            placeholder="Search name, phone, email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search guests"
          />
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={copyWhatsapp} disabled={busy || guests.length === 0}>
            {selected.length ? `WhatsApp links (${selected.length})` : 'WhatsApp links (all)'}
          </button>
          {selected.length > 0 && (
            <button type="button" className="wmod-btn wmod-btn--danger wmod-btn--sm" onClick={removeSelected} disabled={busy}>
              Remove {selected.length}
            </button>
          )}
        </div>

        {guests.length === 0 ? (
          <Empty
            title="No guests yet"
            body="Add them one at a time, or import a CSV. Once they're here you can send each guest their own link and see who has opened it."
            action={<button type="button" className="wmod-btn wmod-btn--primary" onClick={() => setEditing('new')}>Add the first guest</button>}
          />
        ) : filtered.length === 0 ? (
          <Empty title="No guests match that search" body={`Nothing for "${q}".`} />
        ) : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all shown guests" style={{ width: 18, height: 18, accentColor: 'var(--mj-primary)' }} />
                  </th>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Relationship</th>
                  <th>Seat</th>
                  <th>Meal</th>
                  <th>Status</th>
                  <th>Voice invitation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(g.id)}
                        onChange={() => setSelected((s) => (s.includes(g.id) ? s.filter((x) => x !== g.id) : [...s, g.id]))}
                        aria-label={`Select ${g.name}`}
                        style={{ width: 18, height: 18, accentColor: 'var(--mj-primary)' }}
                      />
                    </td>
                    <td>
                      {g.name}
                      {g.is_vip && <span className="wmod-pill wmod-pill--vip" style={{ marginLeft: 8 }}>VIP</span>}
                    </td>
                    <td className="wmod-td-muted">
                      {g.phone || '—'}
                      {g.email && <><br />{g.email}</>}
                    </td>
                    <td className="wmod-td-muted">{g.relationship || '—'}</td>
                    <td className="wmod-td-muted">
                      {[g.table_number && `T${g.table_number}`, g.seat_number].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="wmod-td-muted">{MEALS.find((m) => m.id === g.meal_preference)?.label || '—'}</td>
                    <td>
                      <span className={`wmod-pill ${g.invitation_opened ? 'wmod-pill--yes' : 'wmod-pill--neutral'}`}>
                        {g.invitation_opened ? 'Opened' : g.invitation_sent ? 'Sent' : 'Not sent'}
                      </span>
                    </td>
                    <td>
                      <GuestVoiceNote profileId={profileId} guest={g} onChanged={reload} flash={flash} />
                    </td>
                    <td className="wmod-td-actions">
                      <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setEditing(g)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && (
        <GuestForm
          profileId={profileId}
          guest={editing === 'new' ? null : editing}
          slug={slug}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { setEditing(null); flash(msg); await reload(); }}
        />
      )}
    </>
  );
}

function GuestForm({ profileId, guest, onClose, onSaved }) {
  const isEdit = !!guest;
  const [f, setF] = useState(() => ({
    name: guest?.name || '',
    phone: guest?.phone || '',
    email: guest?.email || '',
    relationship: guest?.relationship || '',
    table_number: guest?.table_number || '',
    seat_number: guest?.seat_number || '',
    meal_preference: guest?.meal_preference || 'unspecified',
    is_vip: !!guest?.is_vip,
    invitation_sent: !!guest?.invitation_sent,
  }));
  const [err, setErr] = useState(null);
  const [fieldErr, setFieldErr] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (patch) => { setF((p) => ({ ...p, ...patch })); setErr(null); };

  const submit = async (e) => {
    e.preventDefault();
    const fe = {};
    if (!f.name.trim()) fe.name = 'A name is required.';
    if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) fe.email = 'That email does not look right.';
    setFieldErr(fe);
    if (Object.keys(fe).length) return;

    setSaving(true);
    setErr(null);
    const payload = {
      ...f,
      name: f.name.trim(),
      phone: f.phone.trim() || null,
      email: f.email.trim() || null,
      relationship: f.relationship.trim() || null,
      table_number: f.table_number.trim() || null,
      seat_number: f.seat_number.trim() || null,
    };
    try {
      if (isEdit) {
        await api.updateGuest(profileId, guest.id, payload);
        onSaved('Guest updated.');
      } else {
        await api.createGuest(profileId, payload);
        onSaved('Guest added.');
      }
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not save this guest.');
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setSaving(true);
    try {
      await api.deleteGuest(profileId, guest.id);
      onSaved('Guest removed.');
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not remove this guest.');
      setSaving(false);
    }
  };

  return (
    <Panel title={isEdit ? `Edit ${guest.name}` : 'Add a guest'}>
      <form onSubmit={submit}>
        <InlineError message={err} />
        <div className="wmod-grid">
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-name">Name</label>
            <input id="g-name" data-mj-field className="wmod-input" value={f.name} onChange={(e) => set({ name: e.target.value })} required />
            {fieldErr.name && <p className="wmod-err">{fieldErr.name}</p>}
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-rel">Relationship</label>
            <input id="g-rel" data-mj-field className="wmod-input" value={f.relationship} onChange={(e) => set({ relationship: e.target.value })} placeholder="Bride's cousin" />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-phone">Phone</label>
            <input id="g-phone" data-mj-field className="wmod-input" value={f.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" placeholder="+919876543210" />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-email">Email</label>
            <input id="g-email" data-mj-field className="wmod-input" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} />
            {fieldErr.email && <p className="wmod-err">{fieldErr.email}</p>}
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-table">Table</label>
            <input id="g-table" data-mj-field className="wmod-input" value={f.table_number} onChange={(e) => set({ table_number: e.target.value })} />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-seat">Seat</label>
            <input id="g-seat" data-mj-field className="wmod-input" value={f.seat_number} onChange={(e) => set({ seat_number: e.target.value })} />
          </div>
          <div className="wmod-field">
            <label className="wmod-label" htmlFor="g-meal">Meal</label>
            <select id="g-meal" data-mj-field className="wmod-input" value={f.meal_preference} onChange={(e) => set({ meal_preference: e.target.value })}>
              {MEALS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="wmod-field wmod-field--wide" style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}>
            <label className="wmod-check">
              <input type="checkbox" checked={f.is_vip} onChange={(e) => set({ is_vip: e.target.checked })} />
              VIP guest
            </label>
            <label className="wmod-check">
              <input type="checkbox" checked={f.invitation_sent} onChange={(e) => set({ invitation_sent: e.target.checked })} />
              Invitation sent
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <button type="submit" className="wmod-btn wmod-btn--primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add guest'}
          </button>
          <button type="button" className="wmod-btn wmod-btn--ghost" onClick={onClose} disabled={saving}>Cancel</button>
          {isEdit && (
            <button type="button" className="wmod-btn wmod-btn--danger" onClick={doDelete} disabled={saving} style={{ marginLeft: 'auto' }}>
              Remove guest
            </button>
          )}
        </div>
      </form>
    </Panel>
  );
}

// -------------------------------------------------------------- rsvp list

function RsvpList({ profileId, rsvps, flash }) {
  const [filter, setFilter] = useState('all');
  const [err, setErr] = useState(null);

  // `rsvps` is null while loading and stays null when the fetch fails. Reading
  // .length off it threw before either state could render, so a 500 from the
  // RSVP endpoint took the whole Guests page to the error boundary instead of
  // showing "couldn't load". A list component must survive not having a list.
  const rows = Array.isArray(rsvps) ? rsvps : [];

  const shown = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    yes: rows.filter((r) => r.status === 'yes').length,
    no: rows.filter((r) => r.status === 'no').length,
    maybe: rows.filter((r) => r.status === 'maybe').length,
  }), [rows]);

  const download = async () => {
    setErr(null);
    try {
      const res = await api.exportRsvps(profileId);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `rsvps-${profileId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash('RSVP export downloaded.');
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not export the RSVPs.');
    }
  };

  return (
    <>
      <InlineError message={err} />
      <Panel
        title="RSVP replies"
        sub="Replies that came in from the public invitation. Anyone with the link can respond, so these will not always match the guest list."
        actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={download} disabled={rows.length === 0}>Export CSV</button>}
        pad={false}
      >
        <div style={{ padding: '14px 22px', display: 'flex', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--mj-border)' }}>
          {[['all', 'All'], ['yes', 'Attending'], ['no', 'Declined'], ['maybe', 'Maybe']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`wmod-btn wmod-btn--sm ${filter === id ? 'wmod-btn--primary' : 'wmod-btn--ghost'}`}
              onClick={() => setFilter(id)}
            >
              {label} ({counts[id]})
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <Empty
            title="No replies yet"
            body="Once the invitation is published and guests start opening it, their RSVPs land here. Make sure the RSVP section is switched on in the wedding editor."
          />
        ) : shown.length === 0 ? (
          <Empty title="Nothing in this filter" body="Try another status." />
        ) : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Reply</th>
                  <th>Heads</th>
                  <th>Diet</th>
                  <th>Message</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.guest_name}
                      {r.guest_phone && <><br /><span className="wmod-td-muted">{r.guest_phone}</span></>}
                    </td>
                    <td>
                      <span className={`wmod-pill wmod-pill--${r.status === 'yes' ? 'yes' : r.status === 'no' ? 'no' : 'maybe'}`}>
                        {r.status === 'yes' ? 'Attending' : r.status === 'no' ? 'Declined' : 'Maybe'}
                      </span>
                    </td>
                    <td className="wmod-td-muted">
                      {r.guest_count}
                      {r.kids_count > 0 && <span> (+{r.kids_count} kids)</span>}
                      {r.plus_one && <span> +1</span>}
                    </td>
                    <td className="wmod-td-muted">
                      {r.dietary_preference || '—'}
                      {r.allergies && <><br /><span style={{ color: 'var(--mj-warning)' }}>{r.allergies}</span></>}
                    </td>
                    <td className="wmod-td-muted" style={{ maxWidth: 280 }}>{r.message || '—'}</td>
                    <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>
                      {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
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
