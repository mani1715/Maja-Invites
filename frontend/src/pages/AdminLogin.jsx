import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useClientAuth } from '@/context/ClientAuthContext';
import { Crown, ArrowLeft, Gift, Heart, Sparkles, Camera, UserRound, ShieldCheck, Clock3 } from 'lucide-react';
import { fadeUp, staggerParent } from '@/motion/presets';

const fade = fadeUp();

const formatCountdown = (secs) => {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
};

const AdminLogin = () => {
  const navigate = useNavigate();
  const { login, logout, admin, loading: authLoading } = useAuth();
  const { clientLogin, isClient } = useClientAuth();
  const [searchParamsEarly] = useSearchParams();
  // "photographer" (default) or "client" — the couple/family login.
  const [mode, setMode] = useState(searchParamsEarly.get('tab') === 'client' ? 'client' : 'photographer');
  const [clientUser, setClientUser] = useState('');
  const [clientPass, setClientPass] = useState('');

  // Already signed in? Skip the login form entirely and go straight to the
  // panel — clicking "Photographer" while a valid session exists must NOT
  // re-ask for credentials (owner request + session-persistence fix).
  // A live SUPER-ADMIN session must never be auto-forwarded from this page.
  // Both panels share one `admin_token` + one AuthContext, so the owner who
  // opened /super-admin and then clicked "Photographer login" on the home page
  // was bounced straight back to /super-admin/dashboard: the studio form never
  // rendered, which looks exactly like "the photographer login logs me into the
  // admin panel". Render the form instead and let them choose (see the notice
  // below). Signing in as a studio here overwrites the owner token by design.
  const ownerRole = (admin?.role || '').toLowerCase() === 'super_admin';
  const ownerSessionActive = !authLoading && !!admin && ownerRole;

  useEffect(() => {
    // Only auto-forward a signed-in photographer from the Photographer tab.
    // On the Client tab we must NOT bounce them — otherwise a browser already
    // signed in as a photographer (e.g. the owner testing, or a photographer who
    // is also a client) can never reach the client login form.
    if (authLoading || !admin || mode !== 'photographer') return;
    if ((admin.role || '').toLowerCase() === 'super_admin') return;
    navigate('/studio/dashboard', { replace: true });
  }, [authLoading, admin, navigate, mode]);
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');  // accepts email OR username
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralMessage, setReferralMessage] = useState('');

  // MFA (TOTP) step — the login endpoint 401s with {code:"MFA_REQUIRED"} for
  // accounts that have two-factor enabled; we then re-submit the same
  // credentials plus this code. {code:"MFA_INVALID"} means the code was wrong.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  // 429 lockout — the backend sends Retry-After (seconds) when an account is
  // temporarily locked after too many failed attempts. Countdown, not a
  // one-shot error, so the CTA re-enables itself the moment it's true again.
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  useEffect(() => {
    if (lockoutSeconds <= 0) return undefined;
    const t = setInterval(() => setLockoutSeconds((s) => (s > 1 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [lockoutSeconds]);

  useEffect(() => {
    document.title = 'Sign in — MAJA';
  }, []);

  useEffect(() => {
    const refCode = searchParams.get('ref');
    if (refCode) {
      setReferralCode(refCode.toUpperCase());
      setReferralMessage(`Using referral code: ${refCode.toUpperCase()}`);
      sessionStorage.setItem('referral_code', refCode.toUpperCase());
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setError('');
    setSuccess('');
    setLoading(true);
    const result = await login(email, password, mfaRequired ? totpCode.trim() : undefined);
    if (result.success) {
      if (referralCode) sessionStorage.setItem('referral_code', referralCode);
      // Route based on role
      const role = result.admin?.role || '';
      if (role === 'super_admin' || role === 'SUPER_ADMIN') {
        navigate('/super-admin/dashboard');
        return;
      }
      navigate('/studio/dashboard');
    } else if (result.code === 'MFA_REQUIRED') {
      setMfaRequired(true);
      setTotpCode('');
      setError('');
    } else if (result.status === 429) {
      const secs = parseInt(result.retryAfter, 10);
      setLockoutSeconds(Number.isFinite(secs) && secs > 0 ? secs : 60);
      setError(result.error || 'Too many attempts.');
    } else {
      // Covers MFA_INVALID and every other login failure with the same box —
      // result.error already carries the backend's message for each case.
      setError(result.error || 'Invalid credentials');
    }
    setLoading(false);
  };

  const backToCredentials = () => {
    setMfaRequired(false);
    setTotpCode('');
    setError('');
  };

  // If a client session already exists and the Client tab is open, skip the form.
  useEffect(() => {
    if (mode === 'client' && isClient) navigate('/studio/client', { replace: true });
  }, [mode, isClient, navigate]);

  const handleClientSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setLoading(true);
    const result = await clientLogin(clientUser.trim(), clientPass);
    if (result.success) {
      navigate('/studio/client');
    } else {
      setError(result.error || 'Invalid username or password.');
    }
    setLoading(false);
  };

  return (
    <div className="px-aurora min-h-screen flex items-center justify-center px-6 py-12 relative">
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 md:top-8 md:left-8 inline-flex items-center gap-2 text-xs font-semibold tracking-wide z-20 min-h-[44px] px-2"
        style={{ color: 'var(--px-muted)' }}
        data-testid="back-to-home"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Studio
      </button>

      <motion.div
        initial="hidden" animate="visible" variants={staggerParent(0.08)}
        className="w-full max-w-[440px] relative z-10"
      >
        <motion.div variants={fade} custom={0} className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
            style={{ background: 'var(--px-primary)' }}>
            <Heart className="w-6 h-6 text-white" strokeWidth={2.4} />
          </div>
          <span className="px-eyebrow block mb-3">{mode === 'client' ? 'Client Access' : 'Photographer Studio'}</span>
          <h1 className="px-section-title" style={{ fontSize: 'clamp(28px,4.5vw,36px)' }}>
            Welcome <span style={{ color: 'var(--px-primary)' }}>back.</span>
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--px-muted)' }}>
            {mode === 'client'
              ? 'Enter the login your photographer shared to view your event.'
              : 'Enter your credentials to access your studio.'}
          </p>
        </motion.div>

        <motion.div variants={fade} custom={1} className="px-glass p-8 md:p-10">
          {/* Photographer / Client switch */}
          <div className="flex gap-1 p-1 rounded-full mb-7" style={{ background: 'var(--px-section)', border: '1px solid var(--px-border)' }}>
            {[
              { id: 'photographer', label: 'Photographer', icon: Camera },
              { id: 'client', label: 'Client of Photographer', icon: UserRound },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => { setMode(opt.id); setError(''); setSuccess(''); }}
                className="flex-1 min-h-[44px] py-2 rounded-full text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
                style={mode === opt.id
                  ? { background: '#fff', color: 'var(--px-ink)', fontWeight: 600, boxShadow: 'var(--px-shadow)' }
                  : { color: 'var(--px-muted)', fontWeight: 500 }}
                data-testid={`login-tab-${opt.id}`}
                aria-pressed={mode === opt.id}
              >
                <opt.icon className="w-3.5 h-3.5" /> {opt.label}
              </button>
            ))}
          </div>

          {mode === 'client' ? (
            <form onSubmit={handleClientSubmit} className="space-y-5" data-testid="client-login-form">
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
                  Username
                </label>
                <input
                  type="text" value={clientUser} onChange={(e) => setClientUser(e.target.value)} required
                  placeholder="Shared by your photographer"
                  data-testid="client-login-username"
                  className="px-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
                  Password
                </label>
                <input
                  type="password" value={clientPass} onChange={(e) => setClientPass(e.target.value)} required
                  placeholder="••••••••"
                  data-testid="client-login-password"
                  className="px-input"
                />
              </div>

              {error && (
                <div className="px-4 py-3 rounded-lg text-sm" data-testid="client-login-error"
                  style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="px-btn w-full" data-testid="client-login-submit">
                {loading ? (<><Sparkles className="w-4 h-4 animate-pulse" /> Signing in</>) : (<>View my event <UserRound className="w-4 h-4" /></>)}
              </button>
              <p className="text-xs text-center" style={{ color: 'var(--px-muted)' }}>
                Don't have a login? Ask your photographer to create one for your event.
              </p>
            </form>
          ) : (
          <>
          {/* Owner session still live: say so plainly instead of silently
              redirecting to the owner console (which read as a login bug). */}
          {ownerSessionActive && (
            <div className="mb-6 rounded-xl p-4" data-testid="owner-session-notice"
              style={{ background: 'var(--px-violet-100)', border: '1px solid var(--px-border-tint)' }}>
              <div className="flex items-start gap-3">
                <Crown className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--px-primary)' }} />
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: 'var(--px-ink)' }}>
                    You are signed in as the platform owner{admin?.email ? ` (${admin.email})` : ''}.
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--px-muted)' }}>
                    Sign in below to open a photographer studio — this browser holds one panel session
                    at a time, so that replaces the owner session. Or go back to the owner console.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => navigate('/super-admin/dashboard')}
                      className="px-btn px-btn-ghost text-xs" data-testid="owner-session-console">
                      Owner console
                    </button>
                    <button type="button" onClick={() => { logout(); setError(''); setSuccess(''); }}
                      className="px-btn px-btn-ghost text-xs" data-testid="owner-session-signout">
                      Sign out of owner
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {referralMessage && (
            <div className="mb-6 flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'var(--px-violet-100)', border: '1px solid var(--px-border-tint)' }}>
              <Gift className="w-4 h-4 mt-0.5" style={{ color: 'var(--px-primary)' }} />
              <p className="text-xs" style={{ color: 'var(--px-muted)' }}>{referralMessage}</p>
            </div>
          )}

          {mfaRequired ? (
            <form onSubmit={handleSubmit} className="space-y-5" data-testid="admin-login-mfa-form">
              <div className="text-center mb-2">
                <ShieldCheck className="w-9 h-9 mx-auto mb-3" style={{ color: 'var(--px-primary)' }} />
                <h2 className="px-section-title" style={{ fontSize: 20 }}>Two-factor code</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--px-muted)' }}>
                  Enter the 6-digit code from your authenticator app.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
                  Authentication code
                </label>
                <input
                  type="text" inputMode="numeric" pattern="\d*" maxLength={8}
                  value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  required autoFocus placeholder="••••••"
                  data-testid="admin-login-totp"
                  className="px-input text-center font-mono tracking-[0.5em]"
                />
              </div>

              {lockoutSeconds > 0 && (
                <div className="px-4 py-3 rounded-lg text-sm flex items-center gap-2" data-testid="admin-login-lockout"
                  style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                  <Clock3 className="w-4 h-4 shrink-0" />
                  Too many attempts. Try again in {formatCountdown(lockoutSeconds)}.
                </div>
              )}

              {error && lockoutSeconds === 0 && (
                <div className="px-4 py-3 rounded-lg text-sm" data-testid="admin-login-error"
                  style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || lockoutSeconds > 0} className="px-btn w-full" data-testid="admin-login-submit">
                {loading ? (<><Sparkles className="w-4 h-4 animate-pulse" /> Verifying</>) : (<>Verify code <ShieldCheck className="w-4 h-4" /></>)}
              </button>

              <button type="button" onClick={backToCredentials}
                className="w-full text-center text-xs font-semibold min-h-[44px]"
                style={{ color: 'var(--px-primary)' }}
                data-testid="admin-login-mfa-back">
                ← Use a different account
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
                Email or Username
              </label>
              <input
                type="text"
                value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="studio@maharani.com or your username"
                data-testid="admin-login-email"
                className="px-input"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
                Password
              </label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                placeholder="••••••••"
                data-testid="admin-login-password"
                className="px-input"
              />
              <div className="text-right mt-2">
                <a href="/forgot-password" data-testid="admin-forgot-password"
                  className="text-xs font-semibold inline-flex items-center min-h-[44px]"
                  style={{ color: 'var(--px-primary)' }}>
                  Forgot password?
                </a>
              </div>
            </div>

            {!searchParams.get('ref') && (
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
                  Referral Code <span className="font-normal" style={{ color: 'var(--px-faint)' }}>(optional)</span>
                </label>
                <input
                  type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="Enter code"
                  maxLength={12}
                  data-testid="admin-login-referral"
                  className="px-input tracking-widest"
                />
              </div>
            )}

            {lockoutSeconds > 0 && (
              <div className="px-4 py-3 rounded-lg text-sm flex items-center gap-2" data-testid="admin-login-lockout"
                style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>
                <Clock3 className="w-4 h-4 shrink-0" />
                Too many attempts. Try again in {formatCountdown(lockoutSeconds)}.
              </div>
            )}

            {error && lockoutSeconds === 0 && (
              <div className="px-4 py-3 rounded-lg text-sm" data-testid="admin-login-error"
                style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}>
                {error}
              </div>
            )}

            {success && (
              <div className="px-4 py-3 rounded-lg text-sm" data-testid="admin-login-success"
                style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', color: 'var(--px-success)' }}>
                {success}
              </div>
            )}

            <button type="submit" disabled={loading || lockoutSeconds > 0} className="px-btn w-full" data-testid="admin-login-submit">
              {loading ? (
                <>
                  <Sparkles className="w-4 h-4 animate-pulse" />
                  Authenticating
                </>
              ) : (
                <>
                  Enter Studio <Crown className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
          )}

          {!mfaRequired && (
            <>
              <div className="my-6 h-px" style={{ background: 'var(--px-border)' }} />

              <div className="text-center space-y-3">
                <button
                  type="button"
                  onClick={() => navigate('/studio/signup')}
                  className="text-sm font-semibold min-h-[44px]"
                  style={{ color: 'var(--px-primary)' }}
                  data-testid="admin-login-signup-link"
                >
                  New photographer? Create studio account →
                </button>
              </div>
            </>
          )}
          </>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
