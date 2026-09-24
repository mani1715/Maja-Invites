import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, shortDate,
} from '@/components/StudioModule';
import * as api from '@/api/studioOps';

// Team management. Roles are enforced server-side; this screen only ever asks.
// Ownership transfer is irreversible from the UI, so it is gated behind typing
// the new owner's email a second time rather than a single click.

const ROLES = [
  { id: 'member', label: 'Member', hint: 'Can work on weddings they are assigned to.' },
  { id: 'manager', label: 'Manager', hint: 'Can create and edit any wedding in the studio.' },
  { id: 'owner', label: 'Owner', hint: 'Full control, including billing.' },
];

export default function StudioStaff() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [transferTo, setTransferTo] = useState('');
  const [transferConfirm, setTransferConfirm] = useState('');

  const { data, error, loading, reload } = useAsync(
    () => api.staff().then((r) => r.data),
  );

  const members = data?.staff || data?.members || (Array.isArray(data) ? data : []);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That did not go through.');
    } finally { setBusy(null); }
  };

  const canTransfer = transferTo.trim() && transferTo.trim() === transferConfirm.trim();

  return (
    <StudioModule
      active="Staff"
      title="Team"
      sub="Everyone who can work in this studio. Invited people get an email with a link that expires."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      <StatRow items={[
        { label: 'Team size', value: loading ? '—' : numberFmt.format(members.length) },
        { label: 'Owners', value: loading ? '—' : numberFmt.format(members.filter((m) => m.role === 'owner').length) },
        { label: 'Pending invites', value: loading ? '—' : numberFmt.format(members.filter((m) => m.status === 'invited' || m.status === 'pending').length) },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="Members" pad={false}>
            {members.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty title="It is just you" body="Invite a second shooter, an editor, or an assistant below. You can change or remove access at any time." />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Person</th><th>Role</th><th>Status</th><th>Added</th><th /></tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const id = m.id || m.staff_id;
                      const isOwner = m.role === 'owner';
                      return (
                        <tr key={id}>
                          <td>
                            {m.name || m.email}
                            {m.name && m.email && <><br /><span className="wmod-td-muted">{m.email}</span></>}
                          </td>
                          <td>
                            <select
                              data-mj-field
                              className="wmod-input"
                              style={{ minHeight: 38, width: 'auto', fontSize: 12.5 }}
                              value={m.role || 'member'}
                              disabled={isOwner || busy === id}
                              onChange={(e) => run(id, () => api.updateStaff(id, { role: e.target.value }), 'Role updated.')}
                              aria-label={`Role for ${m.name || m.email}`}
                            >
                              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                            </select>
                          </td>
                          <td>
                            <span className={`wmod-pill wmod-pill--${m.status === 'active' ? 'yes' : 'maybe'}`}>
                              {m.status || 'active'}
                            </span>
                          </td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{shortDate(m.created_at)}</td>
                          <td className="wmod-td-actions">
                            {!isOwner && (
                              <button
                                type="button"
                                className="wmod-btn wmod-btn--danger wmod-btn--sm"
                                disabled={busy === `rm-${id}`}
                                onClick={() => run(`rm-${id}`, () => api.removeStaff(id), 'Access removed.')}
                              >
                                Remove
                              </button>
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

          <Panel title="Invite someone" sub="They will get an email with a join link.">
            <div className="wmod-grid">
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="inv-email">Email</label>
                <input id="inv-email" data-mj-field className="wmod-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@studio.com" />
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="inv-role">Role</label>
                <select id="inv-role" data-mj-field className="wmod-input" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.filter((r) => r.id !== 'owner').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <p className="wmod-hint">{ROLES.find((r) => r.id === role)?.hint}</p>
              </div>
            </div>
            <button
              type="button"
              className="wmod-btn wmod-btn--primary"
              style={{ marginTop: 14 }}
              disabled={busy === 'invite' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)}
              onClick={() => run('invite', async () => {
                await api.inviteStaff({ email: email.trim(), role });
                setEmail('');
              }, 'Invitation sent.')}
            >
              {busy === 'invite' ? 'Sending…' : 'Send invitation'}
            </button>
          </Panel>

          <Panel title="Transfer ownership" sub="This hands the studio, its billing and every wedding to someone else. You cannot undo it yourself.">
            <div className="wmod-grid">
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="tr-1">New owner&rsquo;s email</label>
                <input id="tr-1" data-mj-field className="wmod-input" type="email" value={transferTo} onChange={(e) => setTransferTo(e.target.value)} autoComplete="off" />
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="tr-2">Type it again to confirm</label>
                <input id="tr-2" data-mj-field className="wmod-input" type="email" value={transferConfirm} onChange={(e) => setTransferConfirm(e.target.value)} autoComplete="off" />
                {transferTo && transferConfirm && !canTransfer && <p className="wmod-err">The two addresses do not match.</p>}
              </div>
            </div>
            <button
              type="button"
              className="wmod-btn wmod-btn--danger"
              style={{ marginTop: 14 }}
              disabled={busy === 'transfer' || !canTransfer}
              onClick={() => run('transfer', async () => {
                await api.transferOwnership({ email: transferTo.trim() });
                setTransferTo(''); setTransferConfirm('');
              }, 'Ownership transferred.')}
            >
              {busy === 'transfer' ? 'Transferring…' : 'Transfer ownership'}
            </button>
          </Panel>
        </>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
