import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import client from '@/api/client';
import './ResetPassword.css';

const STRENGTH_COLOR = ['#e5e7eb', '#ef4444', '#f59e0b', '#8b5cf6', '#10b981'];
const STRENGTH_LABEL = [
  'Use 8+ characters with a number and a symbol.',
  'Weak password.',
  'Getting there.',
  'Good password.',
  'Strong password.',
];
function scorePassword(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

// One route (/auth/reset) covers both DC screens: no ?token= shows
// "MAJA Forgot Password.dc.html" (request a link); a token shows
// "MAJA Reset Password.dc.html" (set the new password). Backend contract:
// POST /api/auth/forgot-password {email} (always 200, no enumeration) and
// POST /api/auth/reset-password {token,password} (400 on invalid/expired).
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  useEffect(() => { document.title = 'Reset password — MAJA Invites'; }, []);

  return token ? <SetNewPassword token={token} /> : <RequestResetLink />;
}

function RequestResetLink() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  const send = async () => {
    setLoading(true);
    setError('');
    try {
      await client.post('/api/auth/forgot-password', { email: email.trim() });
      setSent(true);
      setCooldown(30);
    } catch (e) {
      // Backend intentionally always returns 200 here — a thrown error means
      // network/5xx, which is worth surfacing rather than silently "sending".
      setError(e?.response?.data?.detail || 'Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!valid) { setError('Enter a valid email address.'); return; }
    send();
  };

  const resend = () => { if (cooldown === 0) send(); };

  return (
    <div className="mjWash mj-reset-wash">
      <div className="px-ripple" aria-hidden="true" />
      <div className="mj-reset-shell">
        <Link to="/auth" className="mj-reset-back" data-mj-link>&larr; Back to sign in</Link>

        <div className="mjGlass mj-reset-card">
          {!sent ? (
            <form onSubmit={onSubmit}>
              <h1 className="mj-reset-h1">Reset your<br /><span>password</span></h1>
              <p className="mj-reset-sub">Enter the email on your account and we&rsquo;ll send a reset link. It expires in 30 minutes.</p>

              <label className="mj-reset-label" htmlFor="rp-email">Email</label>
              <input
                id="rp-email"
                data-mj-field
                type="email"
                className={`mj-reset-field${error ? ' is-invalid' : ''}`}
                placeholder="you@email.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                style={{ marginBottom: 8 }}
                required
              />
              <p className="mj-reset-note" style={{ color: 'var(--mj-error-text)' }}>{error}</p>

              <button type="submit" className="mj-reset-submit" disabled={loading}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          ) : (
            <div>
              <div className="mj-reset-icon">✓</div>
              <h1 className="mj-reset-h1">Check your inbox</h1>
              <p className="mj-reset-sub" style={{ marginBottom: 8 }}>We sent a reset link to</p>
              <p style={{ fontSize: 14.5, fontWeight: 600, margin: '0 0 26px', wordBreak: 'break-all' }}>{email}</p>
              <p className="mj-reset-sub">Nothing after a few minutes? Check spam, or make sure that address is the one on your account.</p>
              <button type="button" className="mj-reset-secondary" onClick={resend} disabled={cooldown > 0}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the email'}
              </button>
            </div>
          )}
        </div>

        <p className="mj-reset-footer">Still locked out? Write to <a href="mailto:support@majacreations.com">support@majacreations.com</a></p>
      </div>
    </div>
  );
}

function SetNewPassword({ token }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const score = scorePassword(pw);
  const matched = confirm.length > 0 && pw === confirm;
  const ready = score >= 2 && matched;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    setError('');
    try {
      await client.post('/api/auth/reset-password', { token, password: pw });
      setDone(true);
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not reset your password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mjWash mj-reset-wash">
      <div className="px-ripple" aria-hidden="true" />
      <div className="mj-reset-shell">
        <Link to="/auth" className="mj-reset-back" data-mj-link>&larr; Back to sign in</Link>

        <div className="mjGlass mj-reset-card">
          {!done ? (
            <form onSubmit={submit}>
              <h1 className="mj-reset-h1">Choose a new<br /><span>password</span></h1>
              <p className="mj-reset-sub">This link is single-use. Saving signs you out of every other device.</p>

              {error && <div className="mj-reset-error-box" role="alert">{error}</div>}

              <label className="mj-reset-label" htmlFor="rp-pw">New password</label>
              <input
                id="rp-pw"
                data-mj-field
                type="password"
                className="mj-reset-field"
                placeholder="At least 8 characters"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                style={{ marginBottom: 10 }}
                required
              />
              <div className="mj-reset-meter">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className="mj-reset-meter-bar" style={{ background: i < score ? STRENGTH_COLOR[score] : 'var(--mj-border)' }} />
                ))}
              </div>
              <p className="mj-reset-strength" style={{ color: score >= 3 ? '#047857' : score === 0 ? 'var(--mj-muted)' : '#b45309' }}>
                {STRENGTH_LABEL[score]}
              </p>

              <label className="mj-reset-label" htmlFor="rp-confirm">Confirm password</label>
              <input
                id="rp-confirm"
                data-mj-field
                type="password"
                className={`mj-reset-field${confirm.length === 0 ? '' : matched ? ' is-valid' : ' is-invalid'}`}
                placeholder="Type it again"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={{ marginBottom: 8 }}
                required
              />
              <p className="mj-reset-note" style={{ color: matched ? '#047857' : '#dc2626' }}>
                {confirm.length === 0 ? '' : matched ? 'Passwords match.' : 'Passwords do not match yet.'}
              </p>

              <button type="submit" className="mj-reset-submit" disabled={!ready || loading}>
                {loading ? 'Saving…' : 'Save new password'}
              </button>
              <p className="mj-reset-note" style={{ marginTop: 16 }}>Saving signs you out of every other device.</p>
            </form>
          ) : (
            <div>
              <div className="mj-reset-icon">✓</div>
              <h1 className="mj-reset-h1">Password updated</h1>
              <p className="mj-reset-sub">You&rsquo;re signed out everywhere else. Sign in again with your new password.</p>
              <Link to="/auth" className="mj-reset-submit">Go to sign in</Link>
            </div>
          )}
        </div>

        {!done && (
          <p className="mj-reset-footer">Link expired? <Link to="/auth/reset" data-mj-link>Request a new one</Link></p>
        )}
      </div>
    </div>
  );
}
