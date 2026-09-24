/**
 * ResetPasswordPage — set a new password.
 *   - With ?token=... in the URL → legacy-admin flow (POST /api/auth/reset-password).
 *   - Otherwise → Supabase recovery session (supabase.auth.updateUser).
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Lock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token'); // legacy-admin reset token, if present
  const isLegacy = Boolean(token);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [recoveryReady, setRecoveryReady] = useState(isLegacy);

  // For Supabase flow, wait until the recovery session is detected from the URL.
  useEffect(() => {
    if (isLegacy) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setRecoveryReady(true);
    });
    // Also check if a session already exists (URL already processed).
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setRecoveryReady(true);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, [isLegacy]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setBusy(true);
    try {
      if (isLegacy) {
        await axios.post(`${API_URL}/api/auth/reset-password`, { token, password });
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw new Error(error.message);
      }
      setDone(true);
      setTimeout(() => navigate('/studio/login'), 2500);
    } catch (e2) {
      setErr(e2?.response?.data?.detail || e2?.message || 'Could not reset password. The link may have expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-aurora" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="px-glass" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <CheckCircle2 size={40} style={{ color: 'var(--px-primary)', margin: '0 auto 12px' }} />
            <h1 className="px-section-title" style={{ fontSize: 24, margin: '0 0 8px' }}>Password updated</h1>
            <p style={{ fontSize: 14, color: 'var(--px-muted)' }}>Redirecting you to login…</p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h1 className="px-section-title" style={{ fontSize: 26, margin: '0 0 6px' }}>Set a new password</h1>
            <p style={{ fontSize: 14, color: 'var(--px-muted)', margin: '0 0 20px' }}>
              Choose a strong password (at least 8 characters).
            </p>

            {!recoveryReady && !isLegacy && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 'var(--px-r-btn)',
                background: '#FFFBEB', border: '1px solid #FDE68A',
                color: '#92400E', fontSize: 13, marginBottom: 16 }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                Open this page from the reset link in your email. Waiting for a valid reset session…
              </div>
            )}

            {[['New password', password, setPassword, 'reset-password'],
              ['Confirm password', confirm, setConfirm, 'reset-confirm']].map(([label, val, set, tid]) => (
              <div key={tid} style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
                  color: 'var(--px-ink)', marginBottom: 8 }}>{label}</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--px-faint)', pointerEvents: 'none' }} />
                  <input type="password" required value={val} onChange={(e) => set(e.target.value)}
                    data-testid={tid}
                    className="px-input"
                    style={{ paddingLeft: 38 }} />
                </div>
              </div>
            ))}

            {err && <p style={{ color: 'var(--px-error)', fontSize: 13, margin: '0 0 12px' }}>{err}</p>}

            <button type="submit" disabled={busy || (!recoveryReady && !isLegacy)} data-testid="reset-submit"
              className="px-btn w-full" style={{ opacity: (busy || (!recoveryReady && !isLegacy)) ? 0.7 : 1 }}>
              {busy ? 'Updating…' : 'Update password'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Link to="/studio/login" style={{ color: 'var(--px-muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Back to login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
