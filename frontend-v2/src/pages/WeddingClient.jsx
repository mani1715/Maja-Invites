import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import WeddingModule, { Panel, StatRow, Segmented, Empty, Toast, InlineError, useFlash } from '@/components/WeddingModule';
import { rupees, shortDate } from '@/components/AdminModule';
import * as api from '@/api/weddingClient';

// Client tab — replaces the legacy ClientHubPage. Two things the studio needs
// per booking: the couple's own scoped login, and what they still owe.
//
// The access code is shown once on creation and never again, the same way the
// backend treats it. Regenerating invalidates the old one immediately.

export default function WeddingClient() {
  const { weddingId } = useParams();
  return (
    <WeddingModule weddingId={weddingId} active="Client" title="Client">
      {(profile) => <ClientBody profileId={profile.id} profile={profile} />}
    </WeddingModule>
  );
}

function ClientBody({ profileId, profile }) {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'budget' ? 'budget' : 'access';
  const setView = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'budget') next.set('view', 'budget'); else next.delete('view');
    setParams(next, { replace: true });
  };

  const [access, setAccess] = useState(null);
  const [budget, setBudget] = useState(null);
  const [error, setError] = useState(null);
  const [toast, flash] = useFlash();

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, b] = await Promise.all([
        // 404 here just means access was never issued — not an error.
        api.getAccess(profileId).then((r) => r.data).catch((e) => (e?.response?.status === 404 ? null : Promise.reject(e))),
        api.getBudget(profileId).then((r) => r.data).catch(() => null),
      ]);
      setAccess(a);
      setBudget(b);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load the client details.');
    }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const total = Number(budget?.total ?? budget?.agreed_amount ?? 0);
  const paid = Number(budget?.paid ?? (budget?.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0));

  return (
    <>
      <StatRow items={[
        { label: 'Couple access', value: access ? 'Issued' : 'Not issued', hint: access?.username ? `as ${access.username}` : undefined },
        { label: 'Agreed fee', value: rupees.format(total) },
        { label: 'Received', value: rupees.format(paid), hint: total > 0 ? `${Math.round((paid / total) * 100)}%` : undefined },
        { label: 'Outstanding', value: rupees.format(Math.max(0, total - paid)) },
      ]}
      />

      <Segmented
        ariaLabel="Client views"
        value={view}
        onChange={setView}
        options={[{ id: 'access', label: 'Couple access' }, { id: 'budget', label: 'Budget & payments' }]}
      />

      <InlineError message={error} />

      {view === 'access' && (
        <AccessPanel profileId={profileId} access={access} profile={profile} reload={load} flash={flash} />
      )}
      {view === 'budget' && (
        <BudgetPanel profileId={profileId} budget={budget} total={total} paid={paid} reload={load} flash={flash} />
      )}

      <Toast message={toast} />
    </>
  );
}

function AccessPanel({ profileId, access, profile, reload, flash }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [secret, setSecret] = useState(null);
  const [username, setUsername] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      const res = await fn();
      flash(msg);
      await reload();
      return res;
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not work.');
      return null;
    } finally { setBusy(null); }
  };

  const create = () => run('create', async () => {
    const { data } = await api.createAccess(profileId, { username: username.trim() || undefined });
    // The password comes back exactly once.
    if (data?.password || data?.access_code) setSecret(data.password || data.access_code);
    setUsername('');
  }, 'Access issued.');

  const regenerate = () => run('regen', async () => {
    const { data } = await api.regenerateAccess(profileId);
    if (data?.password || data?.access_code) setSecret(data.password || data.access_code);
  }, 'New code issued — the old one no longer works.');

  const portalUrl = `${window.location.origin}/couple/access/${profile.slug || ''}`;

  return (
    <>
      <InlineError message={err} />

      {secret && (
        <Panel title="Copy this now">
          <p style={{ fontSize: 13.5, color: 'var(--mj-muted)', margin: '0 0 12px', lineHeight: 1.65 }}>
            This is the only time the code is shown. Send it to the couple along
            with the portal link — if it is lost you will have to regenerate,
            which invalidates this one.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <code style={{ background: 'var(--mj-section)', padding: '12px 16px', borderRadius: 'var(--mj-radius-control)', fontSize: 16, letterSpacing: '.08em', color: 'var(--mj-ink-deep)' }}>
              {secret}
            </code>
            <button
              type="button"
              className="wmod-btn wmod-btn--ghost"
              onClick={() => { navigator.clipboard?.writeText(secret); flash('Code copied.'); }}
            >
              Copy code
            </button>
            <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => setSecret(null)}>Done</button>
          </div>
        </Panel>
      )}

      <Panel
        title="Couple access"
        sub="A scoped login that shows the couple their own wedding only — their RSVPs, wishes and gallery. They never see your dashboard or any other booking."
      >
        {access ? (
          <>
            <Row label="Username" value={access.username || access.client_username || '—'} />
            <Row label="Status" value={access.revoked ? 'Revoked' : access.active === false ? 'Inactive' : 'Active'} />
            <Row label="Issued" value={shortDate(access.created_at)} />
            <Row label="Last sign-in" value={access.last_login_at ? shortDate(access.last_login_at) : 'Never'} last />

            <div style={{ background: 'var(--mj-section)', border: '1px solid var(--mj-border)', borderRadius: 'var(--mj-radius-control)', padding: '12px 14px', margin: '16px 0', fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 12.5, wordBreak: 'break-all' }}>
              {portalUrl}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="wmod-btn wmod-btn--ghost"
                onClick={() => { navigator.clipboard?.writeText(portalUrl); flash('Portal link copied.'); }}
              >
                Copy portal link
              </button>
              <button type="button" className="wmod-btn wmod-btn--ghost" onClick={regenerate} disabled={busy === 'regen'}>
                {busy === 'regen' ? 'Working…' : 'Regenerate code'}
              </button>
              {confirmRevoke ? (
                <>
                  <button type="button" className="wmod-btn wmod-btn--danger" disabled={busy === 'revoke'}
                    onClick={() => run('revoke', () => api.revokeAccess(profileId), 'Access revoked.')}>
                    {busy === 'revoke' ? 'Revoking…' : 'Confirm revoke'}
                  </button>
                  <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => setConfirmRevoke(false)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="wmod-btn wmod-btn--danger" style={{ marginLeft: 'auto' }} onClick={() => setConfirmRevoke(true)}>
                  Revoke access
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <Empty
              title="No access issued yet"
              body="Issue a login and the couple can follow their own RSVPs and gallery without messaging you for every update."
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div className="wmod-field" style={{ maxWidth: 260 }}>
                <label className="wmod-label" htmlFor="ca-user">Username (optional)</label>
                <input id="ca-user" data-mj-field className="wmod-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Auto-generated if blank" />
              </div>
              <button type="button" className="wmod-btn wmod-btn--primary" onClick={create} disabled={busy === 'create'}>
                {busy === 'create' ? 'Issuing…' : 'Issue access'}
              </button>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}

function BudgetPanel({ profileId, budget, total, paid, reload, flash }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [agreed, setAgreed] = useState(String(total || ''));
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const payments = budget?.payments || [];

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not save.');
    } finally { setBusy(null); }
  };

  return (
    <>
      <InlineError message={err} />

      <Panel title="Agreed fee" sub="What the couple has committed to for this booking. Only you see this — it is not on the invitation.">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="wmod-field" style={{ maxWidth: 220 }}>
            <label className="wmod-label" htmlFor="bg-total">Total (INR)</label>
            <input id="bg-total" data-mj-field className="wmod-input" type="number" min="0" value={agreed} onChange={(e) => setAgreed(e.target.value)} />
          </div>
          <button
            type="button"
            className="wmod-btn wmod-btn--primary"
            disabled={busy === 'total'}
            onClick={() => run('total', () => api.saveBudget(profileId, { total: Number(agreed) || 0 }), 'Fee saved.')}
          >
            {busy === 'total' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Panel>

      <Panel
        title="Payments"
        sub={total > 0 ? `${rupees.format(paid)} of ${rupees.format(total)} received.` : 'Record each instalment as it arrives.'}
        pad={false}
      >
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--mj-border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="wmod-field" style={{ maxWidth: 180 }}>
            <label className="wmod-label" htmlFor="bg-amt">Amount</label>
            <input id="bg-amt" data-mj-field className="wmod-input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="wmod-field" style={{ flex: '1 1 200px' }}>
            <label className="wmod-label" htmlFor="bg-note">Note</label>
            <input id="bg-note" data-mj-field className="wmod-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Advance, second instalment…" />
          </div>
          <button
            type="button"
            className="wmod-btn wmod-btn--primary"
            disabled={busy === 'pay' || !(Number(amount) > 0)}
            onClick={() => run('pay', async () => {
              await api.addPayment(profileId, { amount: Number(amount), note: note.trim() || null });
              setAmount(''); setNote('');
            }, 'Payment recorded.')}
          >
            {busy === 'pay' ? 'Adding…' : 'Record payment'}
          </button>
        </div>

        {payments.length === 0 ? (
          <Empty title="Nothing recorded" body="Add each instalment so you can see at a glance what is still outstanding." />
        ) : (
          <div className="wmod-tablewrap">
            <table className="wmod-table">
              <thead><tr><th>Date</th><th>Amount</th><th>Note</th><th /></tr></thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(p.created_at || p.date)}</td>
                    <td>{rupees.format(p.amount || 0)}</td>
                    <td className="wmod-td-muted">{p.note || '—'}</td>
                    <td className="wmod-td-actions">
                      <button
                        type="button"
                        className="wmod-btn wmod-btn--danger wmod-btn--sm"
                        disabled={busy === p.id}
                        onClick={() => run(p.id, () => api.deletePayment(profileId, p.id), 'Payment removed.')}
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

function Row({ label, value, last }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '10px 0', borderBottom: last ? 'none' : '1px solid var(--mj-border)', fontSize: 13.5 }}>
      <span className="wmod-td-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
