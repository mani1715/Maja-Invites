import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import './AuthSplit.css';
import useSeo from '@/lib/useSeo';

// Route guards (components/RouteGuards.jsx) bounce signed-out visitors here
// with state {from, persona}; only same-app absolute paths are honoured so a
// crafted link can't turn this into an open redirect.
const safePath = (p) => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : null);

// Ported from "MAJA Sign In.dc.html". The ONE sign-in for every staff role —
// photographers and super-admins are both `admin` records, so they use this
// same form and the account's role decides the destination (adminHome below);
// there is no separate admin login page. The couple persona tab was removed in
// the credits/accounts pivot (couples use the event-passcode portal instead).
// MFA step kept verbatim (real backend can 401 with detail.code MFA_REQUIRED /
// MFA_INVALID).
export default function SignIn() {
  useSeo({ title: 'Sign in', description: 'Sign in to your MAJA Invites studio dashboard.', noindex: true });
  const navigate = useNavigate();
  const location = useLocation();
  const { admin, loading: adminLoading, login: adminLogin } = useAuth();

  const from = safePath(location.state?.from);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const totpRef = useRef(null);

  // Already signed in — go straight to the right dashboard instead of
  // showing the form again. One sign-in page for every role: the account's
  // role decides the destination, not a separate login URL.
  const adminHome = (a) => (a?.role === 'super_admin' ? '/admin/dashboard' : '/studio/dashboard');
  useEffect(() => {
    if (!adminLoading && admin) navigate(from || adminHome(admin), { replace: true });
  }, [adminLoading, admin, navigate, from]);

  useEffect(() => {
    if (mfaStep) totpRef.current?.focus();
  }, [mfaStep]);

  useEffect(() => {
    if (retrySeconds <= 0) return undefined;
    const t = setTimeout(() => setRetrySeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [retrySeconds]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (loading || retrySeconds > 0) return;
    setError('');
    setLoading(true);
    try {
      const res = await adminLogin(identifier.trim(), password, mfaStep ? totp.trim() : undefined);
      if (res.success) {
        navigate(from || adminHome(res.admin));
        return;
      }
      if (res.status === 429) {
        setRetrySeconds(parseInt(res.retryAfter, 10) || 60);
        setError(res.error || 'Too many attempts.');
      } else if (res.code === 'MFA_REQUIRED') {
        setMfaStep(true);
        setError('');
      } else if (res.code === 'MFA_INVALID') {
        setMfaStep(true);
        setError('Invalid code. Try again.');
      } else {
        setError(res.error || 'Sign in failed.');
      }
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 429) {
        const retryAfter = err.response?.headers?.['retry-after'];
        setRetrySeconds(parseInt(retryAfter, 10) || 60);
        setError(typeof detail === 'string' ? detail : 'Too many attempts.');
      } else {
        setError((typeof detail === 'string' && detail) || 'Invalid email or password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const displayError = retrySeconds > 0
    ? `${error || 'Too many attempts.'} Try again in ${retrySeconds}s.`
    : error;

  return (
    <div className="mjWash mj-auth-grid">
      <div className="mj-auth-panel">
        <div className="px-ripple" aria-hidden="true" />
        <Link to="/" className="mj-auth-brand" data-mj-link>MAJA Invites</Link>
        <div style={{ position: 'relative' }}>
          <p className="mj-auth-quote">&ldquo;It didn&rsquo;t feel like a form. It felt like someone was actually listening.&rdquo;</p>
          <p className="mj-auth-quote-by">Ananya &amp; Rohan, married in Udaipur</p>
        </div>
        <div className="mj-auth-frame">wedding photograph</div>
      </div>

      <div className="mj-auth-form-col">
        <div className="mjGlass mj-auth-card">
          <h1 className="mj-auth-h1">
            Welcome<br />
            <span>sign in</span>
          </h1>
          <p className="mj-auth-sub">One sign-in for studios and admins — you&rsquo;ll land on the right dashboard for your account.</p>

          {displayError && <div className="mj-auth-error" role="alert">{displayError}</div>}

          <form onSubmit={onSubmit}>
            <div className="mj-auth-field-group">
              <label className="mj-auth-label" htmlFor="auth-identifier">Email or username</label>
              {/* NOT type="email". The whole stack takes either credential —
                  the field feeds `username_or_email`, AuthContext names its
                  parameter `emailOrUsername`, and the server resolves both —
                  but type="email" made the browser's own constraint validation
                  refuse to submit anything without an "@". A studio given a
                  username could type it, press Sign in, and have NOTHING
                  happen: no request, no error text, nothing in the console.
                  `inputMode="email"` still offers the @-key on mobile, since
                  email is the common case; it does not restrict the value. */}
              <input
                id="auth-identifier"
                data-mj-field
                className="mj-auth-field"
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@email.com or username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>

            <div className="mj-auth-field-group">
              <label className="mj-auth-label" htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                data-mj-field
                className="mj-auth-field"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {mfaStep && (
              <div className="mj-auth-field-group">
                <label className="mj-auth-label" htmlFor="auth-totp">6-digit code</label>
                <input
                  id="auth-totp"
                  ref={totpRef}
                  data-mj-field
                  className="mj-auth-field"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, ''))}
                  required
                />
                <p className="mj-auth-note">From your authenticator app, or a backup code.</p>
              </div>
            )}

            <div className="mj-auth-forgot-row">
              <Link to="/auth/reset" className="mj-auth-forgot-link" data-mj-link>Forgot password?</Link>
            </div>

            <button type="submit" className="mj-auth-submit" disabled={loading || retrySeconds > 0}>
              {loading ? 'Signing in…' : retrySeconds > 0 ? `Try again in ${retrySeconds}s` : 'Sign in'}
            </button>
          </form>

          <p className="mj-auth-footer">
            New studio? <Link to="/auth/signup" data-mj-link>Set up your studio</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
