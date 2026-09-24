import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, Crown, Sparkles, ShieldCheck, Phone, AtSign, User, Lock, Camera, MapPin } from 'lucide-react';
import { PHOTOGRAPHY_TYPES } from '@/data/photographyOptions';
import { fadeUp, staggerParent } from '@/motion/presets';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const fade = fadeUp(16, 0.06);

const Field = ({ label, icon: Icon, ...props }) => (
  <div>
    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
      {label}
    </label>
    <div className="relative">
      {Icon && (
        <Icon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--px-faint)' }} />
      )}
      <input
        {...props}
        className="px-input"
        style={Icon ? { paddingLeft: 38 } : undefined}
      />
    </div>
  </div>
);

const AdminSignup = () => {
  const navigate = useNavigate();
  const { setSessionFromSignup } = useAuth();
  const [step, setStep] = useState(1); // 1: details, 2: OTP, 3: success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devOtp, setDevOtp] = useState(''); // shown in dev mode
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
    // Instagram-style starter details — captured at signup so a new studio is
    // discoverable in the directory from day one instead of being invisible
    // until they happen to find the portfolio page.
    city: '',
    bio: '',
    styles: [],
  });
  const [otp, setOtp] = useState('');
  const [channel, setChannel] = useState('phone'); // 'phone' | 'email' — which channel the code was sent to
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    document.title = 'Create studio account — MAJA';
  }, []);

  const setField = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const validateStep1 = () => {
    if (!form.name.trim()) return 'Please enter your full name.';
    if (!/^[a-z0-9_.]{3,30}$/.test(form.username.trim().toLowerCase()))
      return 'Username must be 3–30 chars: lowercase letters, digits, dot, underscore.';
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(form.email.trim()))
      return 'Enter a valid email address.';
    if (!/^\+[1-9]\d{6,14}$/.test(form.phone.trim()))
      return 'Phone must be in E.164 format (e.g., +919876543210).';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (form.password !== form.confirm) return 'Passwords do not match.';
    if (!agreed) return 'Please accept the Terms of Service and Privacy Policy to continue.';
    return null;
  };

  const _sendCode = async (chan) => {
    const { data } = await axios.post(`${API_URL}/api/auth/send-otp`, {
      phone: form.phone.trim(),
      email: form.email.trim(),
      channel: chan,
    });
    setChannel(data?.channel || chan);
    setDevOtp(data?.otp || '');
    return data;
  };

  const handleSendOtp = async (e, forcedChannel) => {
    e?.preventDefault?.();
    const err = validateStep1();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setInfo('');
    setLoading(true);
    const chan = forcedChannel || 'phone';
    try {
      await _sendCode(chan);
      setInfo(chan === 'email'
        ? `We emailed a 6-digit verification code to ${form.email.trim()}.`
        : `We sent a 6-digit verification code to ${form.phone.trim()}.`);
      setStep(2);
    } catch (e2) {
      // SMS failed → automatically fall back to email so signup never dead-ends.
      if (chan === 'phone') {
        try {
          await _sendCode('email');
          setInfo(`Couldn't reach your phone — we emailed a 6-digit code to ${form.email.trim()} instead.`);
          setStep(2);
        } catch (e3) {
          setError('Could not send a code by SMS or email. Please check your details and try again.');
        }
      } else {
        setError(e2?.response?.data?.detail || 'Could not send the code. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e) => {
    e?.preventDefault?.();
    if (!/^\d{4,8}$/.test(otp.trim())) {
      setError('Enter the 6-digit verification code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_URL}/api/auth/verify-otp`, {
        phone: form.phone.trim(), email: form.email.trim(), channel, otp: otp.trim(),
      });
    } catch (e2) {
      setLoading(false);
      setError(e2?.response?.data?.detail || 'Verification failed. Try a fresh OTP.');
      return;
    }
    try {
      const { data } = await axios.post(`${API_URL}/api/auth/register`, {
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        password: form.password,
      });
      setSessionFromSignup({ access_token: data.access_token, admin: data.admin });
      // Seed their portfolio with what they just told us. Best-effort: a failure
      // here must never cost them the account they just created — they can fill
      // the same fields in the portfolio editor.
      try {
        if (form.city.trim() || form.bio.trim() || form.styles.length) {
          await axios.put(`${API_URL}/api/portfolio/profile`, {
            studio_name: form.name.trim(),
            tagline: form.bio.trim(),
            styles: form.styles,
            location: form.city.trim() ? { city: form.city.trim() } : {},
          }, { headers: { Authorization: `Bearer ${data.access_token}` } });
        }
      } catch (_seed) { /* non-fatal — the portfolio editor has the same fields */ }
      setStep(3);
      setTimeout(() => navigate('/studio/dashboard'), 1100);
    } catch (e3) {
      setError(e3?.response?.data?.detail || 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    try {
      setError('');
      setLoading(true);
      await _sendCode(channel);
      setInfo(channel === 'email'
        ? `Fresh code emailed to ${form.email.trim()}.`
        : `Fresh code sent to ${form.phone.trim()}.`);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not resend the code.');
    } finally {
      setLoading(false);
    }
  };

  // Explicit "use email instead" — lets the user switch channels on demand.
  const switchToEmail = () => handleSendOtp(null, 'email');

  return (
    <div className="px-aurora min-h-screen flex items-center justify-center px-6 py-12 relative">
      <button
        onClick={() => navigate('/studio/login')}
        className="absolute top-6 left-6 md:top-8 md:left-8 inline-flex items-center gap-2 text-xs font-semibold z-20 min-h-[44px] px-2"
        style={{ color: 'var(--px-muted)' }}
        data-testid="signup-back-login"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Login
      </button>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerParent(0.07)}
        className="w-full max-w-[520px] relative z-10"
      >
        <motion.div variants={fade} custom={0} className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-5"
            style={{ background: 'var(--px-primary)' }}
          >
            <Camera className="w-6 h-6 text-white" strokeWidth={2.4} />
          </div>
          <span className="px-eyebrow block mb-3">Photographer Studio</span>
          <h1 className="px-section-title" style={{ fontSize: 'clamp(28px,4.5vw,36px)' }}>
            Open your <span style={{ color: 'var(--px-primary)' }}>studio.</span>
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--px-muted)' }}>
            Verify your phone, claim your handle and start crafting invitations in minutes.
          </p>
        </motion.div>

        {/* Stepper */}
        <motion.div variants={fade} custom={1} className="flex items-center justify-center gap-3 mb-8" data-testid="signup-stepper">
          {[1, 2, 3].map((n) => {
            const active = step >= n;
            return (
              <div key={n} className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full grid place-items-center text-xs font-semibold transition-all"
                  style={{
                    background: active ? 'var(--px-primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--px-muted)',
                    border: '1px solid ' + (active ? 'var(--px-primary)' : 'var(--px-border)'),
                  }}
                >
                  {n}
                </div>
                {n < 3 && (
                  <div className="w-10 h-px" style={{ background: 'var(--px-border)' }} />
                )}
              </div>
            );
          })}
        </motion.div>

        <motion.div variants={fade} custom={2} className="px-glass p-8 md:p-10">
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-5" data-testid="signup-form-details">
              <Field
                label="Full Name"
                icon={User}
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Raju Photography"
                data-testid="signup-name"
                required
              />
              <Field
                label="Username"
                icon={AtSign}
                type="text"
                value={form.username}
                onChange={(e) => setField('username', e.target.value.toLowerCase())}
                placeholder="raju_studio"
                data-testid="signup-username"
                required
              />
              <Field
                label="Email"
                icon={AtSign}
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="hello@yourstudio.com"
                data-testid="signup-email"
                required
              />
              <Field
                label="Phone (E.164)"
                icon={Phone}
                type="tel"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
                placeholder="+919876543210"
                data-testid="signup-phone"
                required
              />
              <Field
                label="Password"
                icon={Lock}
                type="password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                placeholder="At least 8 characters"
                data-testid="signup-password"
                required
              />
              <Field
                label="Confirm Password"
                icon={Lock}
                type="password"
                value={form.confirm}
                onChange={(e) => setField('confirm', e.target.value)}
                placeholder="Repeat password"
                data-testid="signup-confirm"
                required
              />

              {/* Starter profile — optional, but a studio that fills these is
                  findable in the couple-facing directory the moment they join. */}
              <div className="rounded-xl p-4" style={{ background: 'var(--px-section)', border: '1px solid var(--px-border)' }}>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--px-primary)' }}>
                  Your profile (optional)
                </div>
                <p className="text-xs mb-3" style={{ color: 'var(--px-faint)' }}>
                  Couples search by city and style. Fill these now and you show up in
                  their results straight away — you can change everything later.
                </p>
                <Field
                  label="City you shoot in"
                  icon={MapPin}
                  value={form.city}
                  onChange={(e) => setField('city', e.target.value)}
                  placeholder="Hyderabad"
                  data-testid="signup-city"
                />
                <div className="mt-3">
                  <Field
                    label="One line about you"
                    icon={Sparkles}
                    value={form.bio}
                    onChange={(e) => setField('bio', e.target.value)}
                    placeholder="Candid wedding stories across South India"
                    data-testid="signup-bio"
                  />
                </div>
                <div className="mt-3">
                  <div className="text-xs mb-2" style={{ color: 'var(--px-muted)' }}>What do you shoot?</div>
                  <div className="flex flex-wrap gap-1.5">
                    {PHOTOGRAPHY_TYPES.slice(0, 8).map((t) => {
                      const on = form.styles.includes(t);
                      return (
                        <button key={t} type="button"
                          onClick={() => setField('styles', on ? form.styles.filter((x) => x !== t) : [...form.styles, t])}
                          className="rounded-full px-2.5 min-h-[30px] text-xs font-semibold"
                          style={{
                            background: on ? 'var(--px-primary)' : '#fff',
                            color: on ? '#fff' : 'var(--px-muted)',
                            border: '1px solid ' + (on ? 'var(--px-primary)' : 'var(--px-border)'),
                          }}
                          data-testid={`signup-style-${t.replace(/\s+/g, '-').toLowerCase()}`}>
                          {t.replace(' Photography', '')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {error && (
                <div
                  className="px-4 py-3 rounded-lg text-sm"
                  data-testid="signup-error"
                  style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}
                >
                  {error}
                </div>
              )}

              <label className="flex items-start gap-2 text-xs cursor-pointer min-h-[44px]" style={{ color: 'var(--px-muted)' }} data-testid="signup-agree">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" style={{ accentColor: 'var(--px-primary)', width: 18, height: 18 }} />
                <span>
                  I agree to the{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--px-primary)' }}>Terms of Service</a>{' '}and{' '}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--px-primary)' }}>Privacy Policy</a>.
                </span>
              </label>

              <button type="submit" disabled={loading || !agreed} className="px-btn w-full" data-testid="signup-send-otp">
                {loading ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-pulse" /> Sending verification…
                  </>
                ) : (
                  <>
                    Verify phone & continue <ShieldCheck className="w-4 h-4" />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={switchToEmail}
                disabled={loading}
                className="w-full text-center text-xs font-semibold mt-3 min-h-[44px]"
                style={{ color: 'var(--px-muted)' }}
                data-testid="signup-verify-by-email"
              >
                Can't get an SMS? Verify by email instead
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleVerifyAndRegister} className="space-y-5" data-testid="signup-form-otp">
              <div className="text-center mb-4">
                <ShieldCheck className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--px-primary)' }} />
                <h2 className="px-section-title" style={{ fontSize: 24 }}>Verify your phone</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--px-muted)' }}>
                  {info || `Code sent to ${form.phone}`}
                </p>
                {devOtp && (
                  <p className="text-xs mt-2 font-mono" style={{ color: 'var(--px-primary)' }} data-testid="signup-dev-otp">
                    DEV mode OTP: <span style={{ fontWeight: 700 }}>{devOtp}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--px-ink)' }}>
                  6-digit OTP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••••"
                  data-testid="signup-otp-input"
                  className="px-input text-center font-mono tracking-[0.6em]"
                  style={{ fontSize: 20 }}
                />
              </div>

              {error && (
                <div
                  className="px-4 py-3 rounded-lg text-sm"
                  data-testid="signup-otp-error"
                  style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}
                >
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} className="px-btn w-full" data-testid="signup-verify-submit">
                {loading ? (
                  <>
                    <Sparkles className="w-4 h-4 animate-pulse" /> Creating studio…
                  </>
                ) : (
                  <>
                    Verify & create account <Crown className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="font-semibold min-h-[44px]"
                  style={{ color: 'var(--px-muted)' }}
                  data-testid="signup-back-to-details"
                >
                  ← Edit details
                </button>
                <button
                  type="button"
                  onClick={resendOtp}
                  disabled={loading}
                  className="font-semibold min-h-[44px]"
                  style={{ color: 'var(--px-primary)' }}
                  data-testid="signup-resend-otp"
                >
                  Resend OTP
                </button>
              </div>
            </form>
          )}

          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
              className="text-center py-8"
              data-testid="signup-success"
            >
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
                style={{ background: 'var(--px-primary)' }}
              >
                <Crown className="w-8 h-8 text-white" />
              </div>
              <h2 className="px-section-title" style={{ fontSize: 28 }}>
                Studio ready, <span style={{ color: 'var(--px-primary)' }}>welcome!</span>
              </h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--px-muted)' }}>
                Redirecting you to the dashboard…
              </p>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default AdminSignup;
