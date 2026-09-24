import { useState } from 'react';
import * as api from '@/api/adminOps';
import '@/components/weddingModule.css';

// Studio lifecycle: create an account, and act on an existing one's status.
// AdminDashboard.jsx used to be read-only (own code comment said so) — these
// two pieces are the "act on it" half.
//
// Effects, verified against server.py:
//   - create (POST /super-admin/admins): the super-admin sets the password
//     directly in the form. The endpoint never returns a generated
//     credential, so there is nothing to reveal-once here.
//   - status (PUT /super-admin/admins/{id}/status): blocks/allows LOGIN
//     only. A browser session the studio already has open keeps working
//     until that token expires (a few hours) — this is not a force-logout.
//     Their published invitation links are untouched: check_profile_active()
//     only looks at the profile's own is_active/expiry, never the owning
//     admin's status.

const STATUSES = ['active', 'suspended', 'inactive'];

const CONFIRM_COPY = {
  suspended: (name) =>
    `Suspend "${name}"? They won't be able to log in until you reactivate the account. ` +
    `A browser session they already have open keeps working until it expires (a few hours) — ` +
    `this does not force them out immediately. Their published invitation links stay live; guests are not affected.`,
  inactive: (name) =>
    `Mark "${name}" inactive? Same effect as suspending — they can't log in until reactivated. ` +
    `Already-open sessions keep working until they expire, and their live invitation links are unaffected.`,
  active: (name) => `Reactivate "${name}"? They'll be able to log in again immediately.`,
};

/** One row's status control — a select that confirms before it acts. */
export function StudioStatusSelect({ studio, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const change = async (e) => {
    const next = e.target.value;
    e.target.value = studio.status; // revert until confirmed + applied
    if (next === studio.status) return;
    const name = studio.name || studio.email;
    if (!window.confirm(CONFIRM_COPY[next](name))) return;
    setBusy(true);
    setErr(null);
    try {
      await api.setStudioStatus(studio.id, next);
      onChanged({ ...studio, status: next });
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not change that status.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <select
        className="wmod-input"
        style={{ minHeight: 32, padding: '2px 8px', fontSize: 12.5, width: 'auto' }}
        value={studio.status || 'active'}
        disabled={busy}
        onChange={change}
        aria-label={`Change status for ${studio.name || studio.email}`}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {err && <span style={{ fontSize: 11, color: 'var(--mj-error-text)' }}>{err}</span>}
    </div>
  );
}

/** Create-studio form. Calls onCreated(newAdmin) so the caller can prepend
 *  it to the list without a full refetch. */
export function CreateStudioPanel({ onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (form.password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (!window.confirm(`Create a studio account for "${form.name || form.email}"? They will be able to log in immediately with the password you set.`)) return;
    setBusy(true);
    try {
      const { data } = await api.createStudio(form);
      onCreated(data);
      setForm({ name: '', email: '', password: '' });
      setOk(`Created ${data.email}.`);
      setTimeout(() => setOk(''), 3000);
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not create that account.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admdash-card" style={{ padding: 22 }}>
      <h2 style={{ fontFamily: 'var(--mj-font-display)', fontWeight: 500, fontSize: 17, margin: '0 0 4px' }}>Create a studio</h2>
      <p style={{ fontSize: 13, color: 'var(--mj-muted)', margin: '0 0 16px' }}>They can log in with this password right away. Nothing here is shown to anyone else.</p>
      {err && <div className="wmod-inline-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      {ok && <p style={{ fontSize: 13, color: 'var(--mj-primary)', margin: '0 0 12px' }}>{ok}</p>}
      <form onSubmit={submit} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="wmod-field" style={{ flex: '1 1 180px' }}>
          <label className="wmod-label" htmlFor="cs-name">Studio name</label>
          <input id="cs-name" className="wmod-input" required value={form.name} onChange={set('name')} placeholder="Studio or photographer name" />
        </div>
        <div className="wmod-field" style={{ flex: '1 1 220px' }}>
          <label className="wmod-label" htmlFor="cs-email">Email</label>
          <input id="cs-email" className="wmod-input" type="email" required value={form.email} onChange={set('email')} placeholder="them@studio.com" />
        </div>
        <div className="wmod-field" style={{ flex: '1 1 180px' }}>
          <label className="wmod-label" htmlFor="cs-password">Password</label>
          <input id="cs-password" className="wmod-input" type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="8+ characters" />
        </div>
        <button type="submit" className="wmod-btn wmod-btn--primary" disabled={busy || !form.name || !form.email || !form.password}>
          {busy ? 'Creating…' : 'Create studio'}
        </button>
      </form>
    </div>
  );
}
