/**
 * ForgotPasswordPage — request a password reset.
 * Fires BOTH paths so either identity system delivers a link:
 *   - Supabase users: supabase.auth.resetPasswordForEmail
 *   - Legacy admins:  POST /api/auth/forgot-password
 * Always shows a generic success message (no account enumeration).
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    // Both calls are best-effort; we never reveal whether the account exists.
    await Promise.allSettled([
      supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo }),
      axios.post(`${API_URL}/api/auth/forgot-password`, { email: email.trim() }),
    ]);
    setBusy(false);
    setSent(true);
  };

  return (
    <div className="px-aurora" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="px-glass" style={{ width: '100%', maxWidth: 420, padding: 32 }}>
        <Link to="/studio/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44,
          color: 'var(--px-muted)', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 20 }}>
          <ArrowLeft size={15} /> Back to login
        </Link>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <CheckCircle2 size={40} style={{ color: 'var(--px-primary)', margin: '0 auto 12px' }} />
            <h1 className="px-section-title" style={{ fontSize: 24, margin: '0 0 8px' }}>Check your email</h1>
            <p style={{ fontSize: 14, color: 'var(--px-muted)', lineHeight: 1.6 }}>
              If an account exists for <b style={{ color: 'var(--px-ink)' }}>{email}</b>, we've sent a reset link. It expires in 30 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h1 className="px-section-title" style={{ fontSize: 26, margin: '0 0 6px' }}>Reset password</h1>
            <p style={{ fontSize: 14, color: 'var(--px-muted)', margin: '0 0 20px' }}>
              Enter your email and we'll send you a reset link.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600,
              color: 'var(--px-ink)', marginBottom: 8 }}>Email</label>
            <div style={{ position: 'relative', margin: '0 0 20px' }}>
              <Mail size={16} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--px-faint)', pointerEvents: 'none' }} />
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                data-testid="forgot-email"
                className="px-input"
                style={{ paddingLeft: 38 }} placeholder="you@example.com" />
            </div>
            <button type="submit" disabled={busy} data-testid="forgot-submit"
              className="px-btn w-full" style={{ opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
