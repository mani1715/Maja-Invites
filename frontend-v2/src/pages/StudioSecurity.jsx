import { useState } from 'react';
import StudioModule, {
  Panel, StatRow, Empty, Toast, InlineError, useFlash,
  useAsync, Loading, ErrorPanel, numberFmt, relTime,
} from '@/components/StudioModule';
import * as api from '@/api/studioOps';

// Account security: password, email, phone, and the device/session list.
// Session management was one of the SaaS-standard gaps in the audit — the
// backend has a device_sessions table and a revoke endpoint, and nothing in
// the shipped app could reach either.

function scorePassword(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/\d/.test(pw)) s += 1;
  if (/[^A-Za-z0-9]/.test(pw)) s += 1;
  return s;
}
const STRENGTH = ['Too short', 'Weak', 'Getting there', 'Good', 'Strong'];
const STRENGTH_COLOR = ['#e5e7eb', '#ef4444', '#f59e0b', '#8b5cf6', '#10b981'];

// Two-factor. The enrol flow is: start -> server returns a TOTP secret and an
// otpauth:// URI -> user adds it to their authenticator -> verify with a code
// -> server answers with backup codes ONCE and never again. That last part is
// why the codes get their own persistent panel until dismissed: navigating
// away loses them permanently.
function MfaPanel({ mfa, busy, run }) {
  const [enroll, setEnroll] = useState(null);     // { secret, otpauth_uri }
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [err, setErr] = useState(null);

  if (!mfa) return null;

  const start = async () => {
    setErr(null);
    try {
      const { data } = await api.mfaEnrollStart();
      setEnroll(data);
    } catch (e) { setErr(e?.response?.data?.detail || 'Could not start enrolment.'); }
  };

  const verify = () => run('mfa-verify', async () => {
    const { data } = await api.mfaEnrollVerify(code.trim());
    setBackupCodes(data.backup_codes || []);
    setEnroll(null);
    setCode('');
  }, 'Two-factor is on.');

  const disable = () => {
    if (!window.confirm('Turn off two-factor authentication for this account?')) return;
    run('mfa-off', async () => {
      await api.mfaDisable(code.trim());
      setCode('');
    }, 'Two-factor is off.');
  };

  return (
    <Panel
      title="Two-factor authentication"
      sub="A code from your authenticator app, on top of your password. The single strongest thing you can turn on here."
      actions={(
        <span className={`wmod-pill wmod-pill--${mfa.enabled ? 'yes' : 'no'}`}>
          {mfa.enabled ? 'On' : 'Off'}
        </span>
      )}
    >
      <InlineError message={err} />

      {backupCodes && (
        <div style={{ padding: '14px 16px', marginBottom: 16, borderRadius: 'var(--mj-radius-card-inner)', background: 'var(--mj-section)', border: '1px solid var(--mj-border-accent)' }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, margin: '0 0 8px' }}>
            Save these backup codes now — they are shown once and cannot be retrieved later.
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: 14, lineHeight: 1.9, margin: '0 0 12px', overflowWrap: 'anywhere' }}>
            {backupCodes.join('   ')}
          </p>
          <button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={() => setBackupCodes(null)}>
            I have saved them
          </button>
        </div>
      )}

      {!mfa.enabled && !enroll && (
        <button type="button" className="wmod-btn wmod-btn--primary" onClick={start}>
          Turn on two-factor
        </button>
      )}

      {!mfa.enabled && enroll && (
        <>
          <p style={{ fontSize: 13.5, lineHeight: 1.65, margin: '0 0 12px' }}>
            Add this to your authenticator app, then enter the six-digit code it shows.
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: 15, letterSpacing: '.08em', margin: '0 0 14px', overflowWrap: 'anywhere' }}>
            {enroll.secret}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="wmod-field" style={{ flex: '0 0 180px' }}>
              <label className="wmod-label" htmlFor="mfa-code">Code from the app</label>
              <input
                id="mfa-code"
                className="wmod-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </div>
            <button type="button" className="wmod-btn wmod-btn--primary" disabled={busy === 'mfa-verify' || code.trim().length < 6} onClick={verify}>
              {busy === 'mfa-verify' ? 'Checking…' : 'Confirm'}
            </button>
            <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => { setEnroll(null); setCode(''); }}>
              Cancel
            </button>
          </div>
        </>
      )}

      {mfa.enabled && (
        <>
          <p style={{ fontSize: 13.5, color: 'var(--mj-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
            {mfa.backup_codes_remaining ?? 0} backup code
            {mfa.backup_codes_remaining === 1 ? '' : 's'} left. Turning two-factor off needs a
            current code or one of those backup codes.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="wmod-field" style={{ flex: '0 0 180px' }}>
              <label className="wmod-label" htmlFor="mfa-off-code">Code</label>
              <input
                id="mfa-off-code"
                className="wmod-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </div>
            <button type="button" className="wmod-btn wmod-btn--danger" disabled={busy === 'mfa-off' || !code.trim()} onClick={disable}>
              {busy === 'mfa-off' ? 'Turning off…' : 'Turn off two-factor'}
            </button>
          </div>
        </>
      )}
    </Panel>
  );
}

export default function StudioSecurity() {
  const [toast, flash] = useFlash();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // /account/summary returns ONLY { email, phone, name, has_password,
  // auth_provider } — it carries no device list, so the panel below used to
  // read a key that never existed and always claimed "no other devices".
  // The real session list is its own endpoint.
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([
      api.accountSummary().then((r) => r.data),
      api.authSessions().then((r) => r.data).catch(() => null),
      api.mfaStatus().then((r) => r.data).catch(() => null),
    ]).then(([summary, sessions, mfa]) => ({ summary, sessions, mfa })),
  );

  const a = data?.summary || {};
  const mfa = data?.mfa || null;
  // Revoked rows come back too — filter, don't assume the list is all-active.
  const devices = (data?.sessions?.sessions || []).filter((s) => !s.revoked);

  const run = async (key, fn, msg) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      flash(msg);
      await reload();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'That change was rejected.');
    } finally { setBusy(null); }
  };

  const strength = scorePassword(next);
  const pwOk = next.length >= 8 && next === again && cur.length > 0;

  return (
    <StudioModule
      active="Security"
      title="Security"
      sub="Your sign-in details and the devices currently holding a session. Revoking a device signs it out immediately."
      actions={<button type="button" className="wmod-btn wmod-btn--ghost wmod-btn--sm" onClick={reload}>Refresh</button>}
    >
      {/* Only fields the endpoints actually return. `mfa_enabled` and
          `password_changed_at` were read off /account/summary, which returns
          neither — so two-factor always read "Off" even when it was on, and
          the password date always read "Never". */}
      <StatRow items={[
        { label: 'Email', value: loading ? '—' : (a.email || '—') },
        {
          label: 'Two-factor',
          value: loading ? '—' : (mfa?.enabled ? 'On' : 'Off'),
          hint: mfa?.enabled ? undefined : 'Strongly recommended',
        },
        { label: 'Active devices', value: loading ? '—' : numberFmt.format(devices.length) },
        { label: 'Sign-in', value: loading ? '—' : (a.auth_provider === 'google' ? 'Google' : 'Password') },
      ]}
      />

      <InlineError message={err} />

      {loading && <Loading rows={2} />}
      {!loading && error && <ErrorPanel message={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <Panel title="Change password" sub="Changing your password signs out every other device.">
            <div className="wmod-grid">
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="pw-cur">Current password</label>
                <input id="pw-cur" data-mj-field className="wmod-input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="pw-new">New password</label>
                <input id="pw-new" data-mj-field className="wmod-input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                <div style={{ height: 5, borderRadius: 999, background: '#e5e7eb', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${(strength / 4) * 100}%`, height: '100%', background: STRENGTH_COLOR[strength], transition: 'width .2s' }} />
                </div>
                <p className="wmod-hint">{STRENGTH[strength]}</p>
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="pw-again">Repeat new password</label>
                <input id="pw-again" data-mj-field className="wmod-input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
                {again && next !== again && <p className="wmod-err">Those do not match.</p>}
              </div>
            </div>
            <button
              type="button"
              className="wmod-btn wmod-btn--primary"
              style={{ marginTop: 14 }}
              disabled={busy === 'pw' || !pwOk}
              onClick={() => run('pw', async () => {
                await api.changePassword({ current_password: cur, new_password: next });
                setCur(''); setNext(''); setAgain('');
              }, 'Password changed.')}
            >
              {busy === 'pw' ? 'Saving…' : 'Change password'}
            </button>
          </Panel>

          <Panel title="Change email" sub="You will need to confirm the new address before it takes effect.">
            <div className="wmod-grid">
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="em-new">New email</label>
                <input id="em-new" data-mj-field className="wmod-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="em-pw">Your password</label>
                <input id="em-pw" data-mj-field className="wmod-input" type="password" autoComplete="current-password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              className="wmod-btn wmod-btn--primary"
              style={{ marginTop: 14 }}
              disabled={busy === 'em' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail) || !emailPw}
              onClick={() => run('em', async () => {
                await api.changeEmail({ new_email: newEmail.trim(), password: emailPw });
                setNewEmail(''); setEmailPw('');
              }, 'Check your new inbox to confirm.')}
            >
              {busy === 'em' ? 'Sending…' : 'Change email'}
            </button>
          </Panel>

          <Panel title="Change phone" sub="Used for order notifications and account recovery.">
            <div className="wmod-grid">
              <div className="wmod-field">
                <label className="wmod-label" htmlFor="ph-new">Phone</label>
                <input id="ph-new" data-mj-field className="wmod-input" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+919876543210" inputMode="tel" />
                <p className="wmod-hint">International format.</p>
              </div>
            </div>
            <button
              type="button"
              className="wmod-btn wmod-btn--primary"
              style={{ marginTop: 14 }}
              disabled={busy === 'ph' || !/^\+[1-9]\d{1,14}$/.test(newPhone.trim())}
              onClick={() => run('ph', async () => {
                // The model field is `new_phone`; sending `phone` 422s.
                await api.changePhone({ new_phone: newPhone.trim() });
                setNewPhone('');
              }, 'Phone updated.')}
            >
              {busy === 'ph' ? 'Saving…' : 'Change phone'}
            </button>
          </Panel>

          <Panel title="Devices" sub="Anything you do not recognise should be revoked, then change your password." pad={false}>
            {devices.length === 0 ? (
              <div className="wmod-panel-body">
                <Empty title="No other devices" body="Only this session is active." />
              </div>
            ) : (
              <div className="wmod-tablewrap">
                <table className="wmod-table">
                  <thead>
                    <tr><th>Device</th><th>Where</th><th>Last seen</th><th /></tr>
                  </thead>
                  <tbody>
                    {devices.map((dv) => {
                      const id = dv.id || dv.device_id || dv.session_id;
                      return (
                        <tr key={id}>
                          <td>
                            {dv.user_agent ? String(dv.user_agent).slice(0, 60) : (dv.name || 'Unknown device')}
                            {dv.current && <span className="wmod-pill wmod-pill--yes" style={{ marginLeft: 8 }}>This device</span>}
                          </td>
                          <td className="wmod-td-muted">{dv.ip || dv.location || '—'}</td>
                          <td className="wmod-td-muted" style={{ whiteSpace: 'nowrap' }}>{relTime(dv.last_active || dv.created_at)}</td>
                          <td className="wmod-td-actions">
                            {!dv.current && (
                              <button
                                type="button"
                                className="wmod-btn wmod-btn--danger wmod-btn--sm"
                                disabled={busy === id}
                                onClick={() => run(id, () => api.revokeDevice({ device_id: id }), 'Device signed out.')}
                              >
                                {busy === id ? 'Revoking…' : 'Revoke'}
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
            {devices.length > 1 && (
              <div className="wmod-panel-body">
                <button
                  type="button"
                  className="wmod-btn wmod-btn--ghost"
                  disabled={busy === 'logoutall'}
                  onClick={() => {
                    if (!window.confirm('Sign out of every device, including this one?')) return;
                    run('logoutall', () => api.logoutAllSessions(), 'Signed out everywhere.');
                  }}
                >
                  {busy === 'logoutall' ? 'Signing out…' : 'Sign out everywhere'}
                </button>
              </div>
            )}
          </Panel>

          <MfaPanel mfa={mfa} busy={busy} run={run} />
        </>
      )}

      <Toast message={toast} />
    </StudioModule>
  );
}
