import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import './AuthSplit.css';
import './SignUp.css';
import useSeo from '@/lib/useSeo';

const PERKS = [
  { text: 'A portfolio site and a directory listing, built for you.' },
  { text: 'Bookings, contracts and client galleries in one panel.' },
  { text: 'Pixora — the community where studios trade work and advice.' },
  { text: 'Invitations you can sell to every couple you shoot.' },
];

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

// ponytail: no username field in the DC design — slugify the studio name and
// let the backend's uniqueness check bounce a collision, retried once with a
// random suffix. Upgrade to a live "check availability" field if collisions
// turn out to be common in practice.
function slugifyUsername(name) {
  const base = (name || '').toLowerCase().replace(/[^a-z0-9._]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 26);
  return (base.length >= 3 ? base : `studio_${base}`).slice(0, 30);
}

// Ported from "MAJA Sign Up.dc.html" (studio persona only — the couples tab
// was removed in the credits/accounts pivot). Phone/email OTP-gated per
// backend/user_auth.py + backend/server.py's /api/auth/send-otp flow.
export default function SignUp() {
  useSeo({ title: 'Set up your studio', description: 'Create a MAJA Invites studio account and start delivering invitations, galleries and AI face match to your couples.' });
  const navigate = useNavigate();
  const { login: adminLogin } = useAuth();

  const [step, setStep] = useState('form'); // form | otp | done
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [channel, setChannel] = useState('email');
  const [otp, setOtp] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const [form, setForm] = useState({ studioName: '', city: '', name: '', email: '', phone: '', password: '' });
  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));


  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const score = scorePassword(form.password);
  const meter = [0, 1, 2, 3].map((i) => ({ on: i < score }));

  const validate = () => {
    if (!form.studioName.trim()) return 'Please enter your studio name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return 'Enter a valid email address.';
    if (!/^\+[1-9]\d{6,14}$/.test(form.phone.trim())) return 'Enter your mobile in E.164 format, e.g. +919876543210.';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (!agreed) return 'Please accept the Terms and Privacy Policy to continue.';
    return null;
  };

  const sendCode = async (chan) => {
    const { data } = await client.post('/api/auth/send-otp', {
      phone: form.phone.trim(),
      email: form.email.trim(),
      channel: chan,
    });
    setChannel(data?.channel || chan);
    setDevOtp(data?.otp ? String(data.otp) : '');
    setResendIn(30);
  };

  const handleSendOtp = async (e) => {
    e?.preventDefault?.();
    const err = validate();
    if (err) { setError(err); return; }
    setError('');
    setInfo('');
    setLoading(true);
    try {
      try {
        await sendCode('phone');
        setInfo(`We sent a 6-digit code to ${form.phone.trim()}.`);
      } catch (_smsErr) {
        await sendCode('email');
        setInfo(`Couldn't reach your phone — we emailed a code to ${form.email.trim()} instead.`);
      }
      setStep('otp');
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Could not send a verification code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0) return;
    setError('');
    try { await sendCode(channel); } catch (e) { setError(e?.response?.data?.detail || 'Could not resend the code.'); }
  };

  const handleVerifyAndRegister = async (e) => {
    e?.preventDefault?.();
    if (!/^\d{4,8}$/.test(otp.trim())) { setError('Enter the code we sent you.'); return; }
    setLoading(true);
    setError('');
    try {
      await client.post('/api/auth/verify-otp', {
        phone: form.phone.trim(), email: form.email.trim(), channel, otp: otp.trim(),
      });
    } catch (e2) {
      setLoading(false);
      setError(e2?.response?.data?.detail || 'That code did not work. Request a fresh one.');
      return;
    }

    try {
      let username = slugifyUsername(form.studioName);
      try {
        await client.post('/api/auth/register', {
          name: form.studioName.trim(),
          username,
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
          password: form.password,
        });
      } catch (regErr) {
        const detail = regErr?.response?.data?.detail;
        if (typeof detail === 'string' && detail.toLowerCase().includes('username')) {
          username = `${username}_${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 30);
          await client.post('/api/auth/register', {
            name: form.studioName.trim(),
            username,
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim(),
            password: form.password,
          });
        } else {
          throw regErr;
        }
      }
      const res = await adminLogin(form.email.trim(), form.password);
      if (!res.success) throw new Error(res.error || 'Account created — please sign in.');
      setStep('done');
      setTimeout(() => navigate('/studio/dashboard'), 900);
    } catch (e3) {
      const detail = e3?.response?.data?.detail;
      setError((typeof detail === 'string' && detail) || e3?.message || 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mjWash mj-auth-grid mj-auth-grid--signup">
      <div className="mj-auth-panel">
        <div className="px-ripple" aria-hidden="true" />
        <Link to="/" className="mj-auth-brand" data-mj-link>MAJA Invites</Link>
        <div style={{ position: 'relative' }}>
          <p className="mj-auth-quote" style={{ fontSize: 'clamp(24px,3vw,32px)' }}>
            Your studio, your bookings, your community — in one place.
          </p>
          <div className="mj-auth-perks">
            {PERKS.map((p, i) => (
              <p key={p.text} className="mj-auth-perk" style={{ animationDelay: `${0.24 + i * 0.08}s` }}>{p.text}</p>
            ))}
          </div>
        </div>
        <p className="mj-auth-panel-foot">Free to start. No card required.</p>
      </div>

      <div className="mj-auth-form-col">
        <div className="mjGlass mj-auth-card mj-auth-card--wide">
          {step === 'form' && (
            <form onSubmit={handleSendOtp}>
              <h1 className="mj-auth-h1">Create your<br /><span>studio</span></h1>
              <p className="mj-auth-sub">Takes about a minute. You can add your portfolio later.</p>

              <div className="mj-auth-name-grid">
                <div>
                  <label className="mj-auth-label" htmlFor="su-studio">Studio name</label>
                  <input id="su-studio" data-mj-field className="mj-auth-field" placeholder="Ananta Films" value={form.studioName} onChange={(e) => setField('studioName', e.target.value)} required />
                </div>
                <div>
                  <label className="mj-auth-label" htmlFor="su-city">City</label>
                  <input id="su-city" data-mj-field className="mj-auth-field" placeholder="Bengaluru" value={form.city} onChange={(e) => setField('city', e.target.value)} />
                </div>
              </div>

              <div className="mj-auth-field-group" style={{ marginBottom: 18 }}>
                <label className="mj-auth-label" htmlFor="su-email">Work email</label>
                <input id="su-email" data-mj-field className="mj-auth-field" type="email" placeholder="studio@email.com" value={form.email} onChange={(e) => setField('email', e.target.value)} required />
              </div>

              <div className="mj-auth-field-group" style={{ marginBottom: 18 }}>
                <label className="mj-auth-label" htmlFor="su-phone">Mobile</label>
                <input id="su-phone" data-mj-field className="mj-auth-field" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={(e) => setField('phone', e.target.value)} required />
              </div>

              <div>
                <label className="mj-auth-label" htmlFor="su-password">Password</label>
                <input id="su-password" data-mj-field className="mj-auth-field" type="password" placeholder="At least 8 characters" value={form.password} onChange={(e) => setField('password', e.target.value)} required />
                <div className="mj-auth-meter">
                  {meter.map((m, i) => (
                    <span key={i} className="mj-auth-meter-bar" style={{ background: m.on ? STRENGTH_COLOR[score] : 'var(--mj-border)' }} />
                  ))}
                </div>
                <p className="mj-auth-strength" style={{ color: score >= 3 ? '#047857' : score === 0 ? 'var(--mj-muted)' : '#b45309' }}>
                  {STRENGTH_LABEL[score]}
                </p>
              </div>

              {error && <div className="mj-auth-error" role="alert">{error}</div>}

              <label className="mj-auth-agree">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
              </label>

              <button type="submit" className="mj-auth-submit" disabled={loading}>
                {loading ? 'Sending code…' : 'Create studio account'}
              </button>

              <p className="mj-auth-footer">
                Already have a studio? <Link to="/auth" data-mj-link>Sign in</Link>
              </p>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyAndRegister}>
              <div className="mj-auth-back-row" style={{ marginBottom: 20 }}>
                <button type="button" onClick={() => setStep('form')} style={{ color: 'var(--mj-muted)', background: 'none', border: 'none' }}>← Edit details</button>
              </div>
              <h1 className="mj-auth-h1">Verify your<br /><span>{channel === 'email' ? 'email' : 'phone'}</span></h1>
              <p className="mj-auth-sub">{info || `Code sent to ${channel === 'email' ? form.email : form.phone}`}</p>
              {devOtp && <p className="mj-auth-note" style={{ marginBottom: 16 }}>DEV mode code: <strong>{devOtp}</strong></p>}

              <div className="mj-auth-field-group">
                <label className="mj-auth-label" htmlFor="su-otp">6-digit code</label>
                <input
                  id="su-otp"
                  data-mj-field
                  className="mj-auth-field mj-auth-otp-input"
                  inputMode="numeric"
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  required
                />
              </div>

              {error && <div className="mj-auth-error" role="alert">{error}</div>}

              <button type="submit" className="mj-auth-submit" disabled={loading}>
                {loading ? 'Creating studio…' : 'Verify & create account'}
              </button>

              <button type="button" className="mj-auth-link-btn" onClick={resend} disabled={resendIn > 0 || loading}>
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend the code'}
              </button>
            </form>
          )}

          {step === 'done' && (
            <div>
              <div className="mj-auth-otp-icon">✓</div>
              <h1 className="mj-auth-h1">Studio ready</h1>
              <p className="mj-auth-sub">Redirecting you to your dashboard…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
