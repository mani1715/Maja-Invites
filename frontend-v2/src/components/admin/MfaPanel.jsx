import { useEffect, useState } from 'react';
import { Panel, InlineError, useAsync, Loading, ErrorPanel } from '@/components/AdminModule';
import * as api from '@/api/adminOps';

// MFA enroll / verify / disable. admin_security.py ~175 — TOTP (RFC 6238),
// pure Python, no QR image (no new npm dependency): the enrollment step
// returns a base32 secret + an otpauth:// URI, both rendered as copyable
// text for manual entry / URI-import into an authenticator app.
//
// Never logged: the secret, the otpauth URI, and the one-time backup codes
// only ever live in this component's state, shown to the signed-in admin
// and nowhere else.

export default function MfaPanel() {
  const { data, error, loading, reload } = useAsync(() => api.mfaStatus().then((r) => r.data));

  if (loading) return <Loading rows={1} />;
  if (error) return <ErrorPanel message={error} onRetry={reload} />;

  return data.enabled
    ? <EnabledView status={data} onChanged={reload} />
    : <EnrollView onEnrolled={reload} />;
}

function EnabledView({ status, onChanged }) {
  const [showDisable, setShowDisable] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const disable = async (e) => {
    e.preventDefault();
    if (!window.confirm('Turn off two-factor authentication? Your account will only need a password to sign in after this.')) return;
    setBusy(true);
    setErr(null);
    try {
      await api.mfaDisable(code);
      setCode('');
      setShowDisable(false);
      onChanged();
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not disable — check the code.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Two-factor authentication" sub={`On. ${status.backup_codes_remaining} backup code${status.backup_codes_remaining === 1 ? '' : 's'} remaining.`}>
      {!showDisable ? (
        <button type="button" className="wmod-btn wmod-btn--danger" onClick={() => setShowDisable(true)}>Turn off</button>
      ) : (
        <form onSubmit={disable} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <InlineError message={err} />
          <div className="wmod-field" style={{ flex: '0 0 160px' }}>
            <label className="wmod-label" htmlFor="mfa-disable-code">Authenticator code or backup code</label>
            <input id="mfa-disable-code" className="wmod-input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
          </div>
          <button type="submit" className="wmod-btn wmod-btn--danger" disabled={busy || !code.trim()}>{busy ? 'Turning off…' : 'Confirm turn off'}</button>
          <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => { setShowDisable(false); setErr(null); }}>Cancel</button>
        </form>
      )}
    </Panel>
  );
}

function EnrollView({ onEnrolled }) {
  const [pending, setPending] = useState(null); // { secret, otpauth_uri }
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null); // shown once
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // Backup codes are only ever in memory — clear them the moment this
  // component unmounts (e.g. the admin navigates away without acknowledging).
  useEffect(() => () => setBackupCodes(null), []);

  const start = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.mfaEnrollStart();
      setPending(data);
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Could not start enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.mfaEnrollVerify(code);
      setBackupCodes(data.backup_codes);
      setPending(null);
      setCode('');
    } catch (e2) {
      setErr(e2?.response?.data?.detail || 'Incorrect code.');
    } finally {
      setBusy(false);
    }
  };

  if (backupCodes) {
    return (
      <Panel title="Two-factor authentication" sub="On. Save these backup codes now — they will not be shown again.">
        <ul style={{ fontFamily: 'monospace', fontSize: 14, lineHeight: 1.9, columns: 2, margin: '0 0 16px', paddingLeft: 18 }}>
          {backupCodes.map((c) => <li key={c}>{c}</li>)}
        </ul>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
          I&rsquo;ve saved these codes somewhere safe
        </label>
        <button
          type="button"
          className="wmod-btn wmod-btn--primary"
          disabled={!saved}
          onClick={() => { setBackupCodes(null); onEnrolled(); }}
        >
          Done
        </button>
      </Panel>
    );
  }

  if (!pending) {
    return (
      <Panel title="Two-factor authentication" sub="Off. Adds a second step to sign-in using an authenticator app.">
        <InlineError message={err} />
        <button type="button" className="wmod-btn wmod-btn--primary" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Turn on'}
        </button>
      </Panel>
    );
  }

  return (
    <Panel title="Set up your authenticator app" sub="Add this key to an authenticator app (Google Authenticator, 1Password, Authy…), then enter the 6-digit code it shows.">
      <div style={{ marginBottom: 14 }}>
        <p className="wmod-label" style={{ marginBottom: 4 }}>Manual entry key</p>
        <code style={{ fontSize: 15, letterSpacing: '.05em', userSelect: 'all', wordBreak: 'break-all' }}>{pending.secret}</code>
      </div>
      <div style={{ marginBottom: 16 }}>
        <p className="wmod-label" style={{ marginBottom: 4 }}>Setup URI (if your app supports import)</p>
        <code style={{ fontSize: 11.5, userSelect: 'all', wordBreak: 'break-all', color: 'var(--mj-muted)' }}>{pending.otpauth_uri}</code>
      </div>
      <form onSubmit={verify} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <InlineError message={err} />
        <div className="wmod-field" style={{ flex: '0 0 140px' }}>
          <label className="wmod-label" htmlFor="mfa-verify-code">6-digit code</label>
          <input id="mfa-verify-code" className="wmod-input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" inputMode="numeric" maxLength={6} />
        </div>
        <button type="submit" className="wmod-btn wmod-btn--primary" disabled={busy || code.trim().length < 6}>{busy ? 'Verifying…' : 'Verify & turn on'}</button>
        <button type="button" className="wmod-btn wmod-btn--ghost" onClick={() => setPending(null)}>Cancel</button>
      </form>
    </Panel>
  );
}
