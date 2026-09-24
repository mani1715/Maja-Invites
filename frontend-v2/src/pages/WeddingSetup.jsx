import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import WeddingModule, { Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash } from '@/components/WeddingModule';
import { numberFmt, shortDate, relTime } from '@/components/AdminModule';
import * as api from '@/api/weddingClient';
import { EVENT_TYPES } from '@/lib/weddingSchema';

// Setup tab — the per-ceremony invitation links (each with its own QR) and
// WhatsApp delivery. Replaces the legacy EventInvitationWizard and
// WhatsAppManager.
//
// Theme settings are deliberately NOT here: the wizard's Design step already
// owns that, and two places to change one field is how they drift apart.
// /studio/profile/:id/theme-settings redirects into the wizard instead.

export default function WeddingSetup() {
  const { weddingId } = useParams();
  return (
    <WeddingModule weddingId={weddingId} active="Setup" title="Setup">
      {(profile) => <SetupBody profileId={profile.id} profile={profile} />}
    </WeddingModule>
  );
}

function SetupBody({ profileId, profile }) {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'whatsapp' ? 'whatsapp' : 'links';
  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'whatsapp') next.set('view', 'whatsapp'); else next.delete('view');
    setParams(next, { replace: true });
  };

  const [links, setLinks] = useState(null);
  const [waStatus, setWaStatus] = useState(null);
  const [waLogs, setWaLogs] = useState([]);
  const [error, setError] = useState(null);
  const [toast, flash] = useFlash();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [l, s, lg] = await Promise.all([
        api.eventInvitations(profileId).then((r) => r.data),
        api.whatsappStatus().then((r) => r.data).catch(() => null),
        api.whatsappLogs(profileId).then((r) => r.data).catch(() => null),
      ]);
      setLinks(l?.invitations || l?.items || (Array.isArray(l) ? l : []));
      setWaStatus(s);
      setWaLogs(lg?.logs || lg?.items || (Array.isArray(lg) ? lg : []));
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load setup.');
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const rows = links || [];
  const configured = waStatus?.configured ?? waStatus?.enabled;

  return (
    <>
      <StatRow items={[
        { label: 'Ceremony links', value: links === null ? '—' : numberFmt.format(rows.length) },
        { label: 'Ceremonies on the wedding', value: numberFmt.format((profile.events || []).length) },
        { label: 'WhatsApp', value: waStatus === null ? '—' : (configured ? 'Connected' : 'Not connected') },
        { label: 'Messages sent', value: numberFmt.format(waLogs.length) },
      ]}
      />

      <Segmented
        ariaLabel="Setup views"
        value={view}
        onChange={setView}
        options={[{ id: 'links', label: 'Ceremony links' }, { id: 'whatsapp', label: 'WhatsApp' }]}
      />

      <InlineError message={error} />

      {view === 'links' && (
        <LinksPanel profileId={profileId} profile={profile} rows={rows} reload={load} flash={flash} />
      )}
      {view === 'whatsapp' && (
        <WhatsAppPanel profileId={profileId} profile={profile} status={waStatus} logs={waLogs} reload={load} flash={flash} />
      )}

      <Toast message={toast} />
    </>
  );
}

function LinksPanel({ profileId, profile, rows, reload, flash }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [newType, setNewType] = useState('');

  const used = rows.map((r) => r.event_type);
  const available = (profile.events || [])
    .map((e) => e.event_type)
    .filter((t) => !used.includes(t));

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not work.');
    } finally { setBusy(null); }
  };

  const label = (t) => EVENT_TYPES.find((e) => e.id === t)?.label || t;

  return (
    <>
      <InlineError message={err} />

      <Panel
        title="Per-ceremony links"
        sub="One link and QR per function, so the haldi guests are not sent the reception card. Guests who only have the main link still see everything."
        actions={available.length > 0 ? (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
            <select
              data-mj-field
              className="wmod-input"
              style={{ minHeight: 38, width: 'auto', fontSize: 12.5 }}
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              aria-label="Ceremony to create a link for"
            >
              <option value="">Choose a ceremony…</option>
              {available.map((t) => <option key={t} value={t}>{label(t)}</option>)}
            </select>
            <button
              type="button"
              className="wmod-btn wmod-btn--primary wmod-btn--sm"
              disabled={busy === 'new' || !newType}
              onClick={() => run('new', async () => {
                await api.createEventInvitation(profileId, { event_type: newType });
                setNewType('');
              }, 'Link created.')}
            >
              {busy === 'new' ? 'Creating…' : 'Create link'}
            </button>
          </span>
        ) : null}
        pad={false}
      >
        {(profile.events || []).length === 0 ? (
          <Empty
            title="No ceremonies on this wedding yet"
            body="Add them in the editor first — each ceremony can then get its own link."
            action={<Link className="wmod-btn wmod-btn--primary" to={`/studio/wedding/${profileId}/edit`}>Open the editor</Link>}
          />
        ) : rows.length === 0 ? (
          <Empty
            title="No per-ceremony links yet"
            body="Optional. Create one when you want to send different guests to different functions."
          />
        ) : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead>
                <tr><th>Ceremony</th><th>Link</th><th>Scans</th><th>Created</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const url = `${window.location.origin}/invite/${profile.slug}/${r.event_type}`;
                  return (
                    <tr key={r.id || r.invitation_id}>
                      <td>{label(r.event_type)}</td>
                      <td className="wmod-td-muted" style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12, overflowWrap: 'anywhere' }}>
                        /invite/{profile.slug}/{r.event_type}
                      </td>
                      <td className="wmod-td-muted">{numberFmt.format(r.scan_count ?? 0)}</td>
                      <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(r.created_at)}</td>
                      <td className="wmod-td-actions">
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          onClick={() => { navigator.clipboard?.writeText(url); flash('Link copied.'); }}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--ghost wmod-btn--sm"
                          style={{ marginLeft: 6 }}
                          disabled={busy === `qr-${r.id}`}
                          onClick={() => run(`qr-${r.id}`, () => api.regenerateQr(r.id || r.invitation_id), 'QR regenerated.')}
                        >
                          {busy === `qr-${r.id}` ? 'Working…' : 'New QR'}
                        </button>
                        <button
                          type="button"
                          className="wmod-btn wmod-btn--danger wmod-btn--sm"
                          style={{ marginLeft: 6 }}
                          disabled={busy === `d-${r.id}`}
                          onClick={() => run(`d-${r.id}`, () => api.deleteEventInvitation(r.id || r.invitation_id), 'Link removed.')}
                        >
                          Remove
                        </button>
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
  );
}

function WhatsAppPanel({ profileId, profile, status, logs, reload, flash }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const configured = status?.configured ?? status?.enabled;

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'The message did not send.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <InlineError message={err} />

      {!configured && (
        <Panel title="WhatsApp is not connected">
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--mj-muted)', margin: '0 0 14px', maxWidth: '62ch' }}>
            Sending from the platform needs a WhatsApp Business sender to be
            configured by MAJA. Until it is, use the per-guest WhatsApp links on
            the Guests tab — those open your own WhatsApp with the message
            pre-filled, which works today and costs nothing.
          </p>
          <Link className="wmod-btn wmod-btn--primary" to={`/studio/wedding/${profileId}/guests`}>
            Open Guests
          </Link>
        </Panel>
      )}

      {configured && (
        <Panel
          title="Send to everyone on the guest list"
          sub="Uses each guest's personalised link, so you can still see who opened it."
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="wmod-btn wmod-btn--primary"
              disabled={busy === 'inv'}
              onClick={() => run('inv', () => api.sendInvitation({ profile_id: profileId }), 'Invitations queued.')}
            >
              {busy === 'inv' ? 'Sending…' : 'Send the invitation'}
            </button>
            <button
              type="button"
              className="wmod-btn wmod-btn--ghost"
              disabled={busy === 'rem'}
              onClick={() => run('rem', () => api.sendReminder({ profile_id: profileId }), 'Reminders queued.')}
            >
              {busy === 'rem' ? 'Sending…' : 'Send an RSVP reminder'}
            </button>
          </div>
          <p className="wmod-hint" style={{ marginTop: 12 }}>
            Reminders go only to guests who have not replied yet.
          </p>
        </Panel>
      )}

      <Panel title="Send log" sub="What has gone out for this wedding." pad={false}>
        {logs.length === 0 ? (
          <Empty title="Nothing sent yet" />
        ) : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead><tr><th>To</th><th>Kind</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {logs.slice(0, 60).map((l, i) => (
                  <tr key={l.id || i}>
                    <td className="wmod-td-muted">{l.to || l.phone || '—'}</td>
                    <td className="wmod-td-muted">{l.kind || l.template || '—'}</td>
                    <td>
                      <span className={`wmod-pill wmod-pill--${l.status === 'sent' || l.status === 'delivered' ? 'yes' : l.status === 'pending' ? 'maybe' : 'no'}`}>
                        {l.status || '—'}
                      </span>
                    </td>
                    <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{relTime(l.created_at)}</td>
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
