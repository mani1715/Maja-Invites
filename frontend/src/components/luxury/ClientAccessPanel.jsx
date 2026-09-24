import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
  X, KeyRound, Copy, Check, RefreshCw, UserRound, Loader2, Wand2,
  ShieldCheck, Power, ExternalLink,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

/**
 * ClientAccessPanel — photographer-side panel to manage the ONE client login
 * for this invitation (the couple/family view). Uses the global (admin) axios
 * auth. The plaintext password is only ever shown once, right after it's
 * generated, for the photographer to copy and share.
 *
 * `inline` renders it as a plain section instead of a modal, for the Client page
 * where it IS the content rather than an overlay. Same logic either way — only
 * the chrome differs, so the two cannot drift.
 */
export default function ClientAccessPanel({ profileId, coupleName, onClose, inline = false }) {
  const [status, setStatus] = useState(null);     // { has_account, enabled, username }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [reveal, setReveal] = useState(null);      // { username, password } shown once
  const [mode, setMode] = useState('predefined');
  const [customUser, setCustomUser] = useState('');
  const [customPass, setCustomPass] = useState('');
  const [copied, setCopied] = useState('');

  const loginUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/studio/login?tab=client`;

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await axios.get(`${API_URL}/api/admin/profiles/${profileId}/client-access`);
      setStatus(data);
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not load client access.');
    } finally { setLoading(false); }
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const copy = async (key, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1600); } catch (_) {}
  };

  const create = async () => {
    setBusy(true); setErr('');
    try {
      const body = mode === 'custom'
        ? { mode: 'custom', username: customUser.trim().toLowerCase(), password: customPass }
        : { mode: 'predefined' };
      const { data } = await axios.post(`${API_URL}/api/admin/profiles/${profileId}/client-access`, body);
      setReveal({ username: data.username, password: data.password });
      setCustomUser(''); setCustomPass('');
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not create the client login.');
    } finally { setBusy(false); }
  };

  const regenerate = async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await axios.post(`${API_URL}/api/admin/profiles/${profileId}/client-access/regenerate`);
      setReveal({ username: data.username, password: data.password });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not regenerate the password.');
    } finally { setBusy(false); }
  };

  const toggleEnabled = async () => {
    setBusy(true); setErr('');
    try {
      await axios.patch(`${API_URL}/api/admin/profiles/${profileId}/client-access`, { enabled: !status?.enabled });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || 'Could not update.');
    } finally { setBusy(false); }
  };

  const shareText = reveal
    ? `Your ${coupleName || 'event'} dashboard\nLogin: ${loginUrl}\nUsername: ${reveal.username}\nPassword: ${reveal.password}`
    : '';

  // One body, two frames: a modal (opened from a card) or a plain section (the
  // Client page, where this is the main content). The JSX below is written once.
  const Frame = inline
    ? ({ children }) => (
        <div className="lux-glass p-7 relative" data-testid="client-access-panel">{children}</div>
      )
    : ({ children }) => (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8"
          style={{ background: 'rgba(8,5,3,0.82)', backdropFilter: 'blur(10px)' }}
          data-testid="client-access-panel"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="lux-glass w-full max-w-lg max-h-[92vh] overflow-y-auto p-7 relative"
          >
            {children}
          </motion.div>
        </motion.div>
      );

  return (
    <Frame>
        {!inline && (
          <button onClick={onClose} className="absolute top-5 right-5 w-9 h-9 rounded-full grid place-items-center"
            style={{ border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }} data-testid="client-access-close">
            <X className="w-4 h-4" />
          </button>
        )}

        <span className="lux-eyebrow block mb-2">◆ Client Access</span>
        <h2 className="font-display text-2xl md:text-3xl mb-1" style={{ color: 'var(--lux-text)' }}>
          Share a <span className="text-gold italic font-script">client login</span>
        </h2>
        <p className="text-sm mb-5" style={{ color: 'var(--lux-text-muted)' }}>
          Give {coupleName || 'the couple'} a private login to see their RSVP, wishes, link analytics and gallery — scoped to this invitation only.
        </p>

        {err && (
          <div className="px-4 py-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(139,0,0,0.18)', border: '1px solid rgba(255,120,90,0.4)', color: '#FFD7C9' }}>
            {err}
          </div>
        )}

        {loading ? (
          <div className="py-10 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-gold" /></div>
        ) : (
          <>
            {/* Freshly generated credentials — shown once */}
            {reveal && (
              <div className="lux-glass p-4 mb-5" style={{ border: '1px solid rgba(212,175,55,0.45)' }} data-testid="client-access-reveal">
                <div className="flex items-center gap-2 mb-3">
                  <ShieldCheck className="w-4 h-4 text-gold" />
                  <span className="text-sm font-display" style={{ color: 'var(--lux-text)' }}>Share these now — the password isn't shown again</span>
                </div>
                <CredRow label="Login URL" value={loginUrl} copied={copied === 'url'} onCopy={() => copy('url', loginUrl)} />
                <CredRow label="Username" value={reveal.username} copied={copied === 'user'} onCopy={() => copy('user', reveal.username)} />
                <CredRow label="Password" value={reveal.password} copied={copied === 'pass'} onCopy={() => copy('pass', reveal.password)} mono />
                <button onClick={() => copy('all', shareText)} className="lux-btn text-xs inline-flex items-center gap-1.5 mt-2" data-testid="client-access-copy-all">
                  {copied === 'all' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy all to share
                </button>
              </div>
            )}

            {status?.has_account ? (
              <div className="space-y-4">
                <div className="lux-glass p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>Username</div>
                    <div className="text-sm font-mono truncate" style={{ color: 'var(--lux-text)' }}>{status.username}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] tracking-[0.2em] uppercase inline-flex items-center gap-1.5"
                    style={status.enabled
                      ? { background: 'rgba(60,140,80,0.18)', color: '#bff0c8' }
                      : { background: 'rgba(255,248,220,0.06)', color: 'var(--lux-text-muted)' }}>
                    {status.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={regenerate} disabled={busy} className="lux-btn text-xs inline-flex items-center gap-1.5" data-testid="client-access-regenerate">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Reset password
                  </button>
                  <button onClick={toggleEnabled} disabled={busy} className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5" data-testid="client-access-toggle">
                    <Power className="w-3.5 h-3.5" /> {status.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <a href={loginUrl} target="_blank" rel="noopener noreferrer" className="lux-btn lux-btn-ghost text-xs inline-flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> Login page
                  </a>
                </div>
                <p className="text-xs" style={{ color: 'var(--lux-text-faint)' }}>
                  Resetting shows a new password once. The old one stops working immediately.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-1 p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--lux-border)' }}>
                  {[
                    { id: 'predefined', label: 'Auto-generate', icon: Wand2 },
                    { id: 'custom', label: 'Set my own', icon: KeyRound },
                  ].map((o) => (
                    <button key={o.id} type="button" onClick={() => setMode(o.id)}
                      className="flex-1 py-2 rounded-full text-xs inline-flex items-center justify-center gap-1.5 transition-colors"
                      style={mode === o.id ? { background: 'radial-gradient(circle at 30% 30%, #E8C766, #8C6A1A)', color: '#16110C', fontWeight: 600 } : { color: 'var(--lux-text-muted)' }}
                      data-testid={`client-access-mode-${o.id}`}>
                      <o.icon className="w-3.5 h-3.5" /> {o.label}
                    </button>
                  ))}
                </div>

                {mode === 'custom' && (
                  <div className="space-y-3">
                    <input value={customUser} onChange={(e) => setCustomUser(e.target.value)} placeholder="username (a–z, 0–9, . _ -)"
                      className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
                      style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="client-access-custom-user" />
                    <input value={customPass} onChange={(e) => setCustomPass(e.target.value)} placeholder="password (min 6 chars)" type="text"
                      className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm font-mono"
                      style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid="client-access-custom-pass" />
                  </div>
                )}
                {mode === 'predefined' && (
                  <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                    We'll generate a username from the event name plus a secure password — you can copy and share them next.
                  </p>
                )}

                <button onClick={create} disabled={busy} className="lux-btn w-full justify-center inline-flex items-center gap-2" data-testid="client-access-create">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRound className="w-4 h-4" />} Create client login
                </button>
              </div>
            )}
          </>
        )}
    </Frame>
  );
}

const CredRow = ({ label, value, copied, onCopy, mono }) => (
  <div className="flex items-center gap-2 mb-2">
    <div className="min-w-0 flex-1">
      <div className="text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>{label}</div>
      <div className={`text-sm truncate ${mono ? 'font-mono' : 'break-all'}`} style={{ color: 'var(--lux-text)' }}>{value}</div>
    </div>
    <button onClick={onCopy} className="w-8 h-8 rounded-full grid place-items-center flex-shrink-0" style={{ border: '1px solid var(--lux-border)' }} aria-label={`Copy ${label}`}>
      {copied ? <Check className="w-4 h-4 text-gold" /> : <Copy className="w-4 h-4" style={{ color: 'var(--lux-text-muted)' }} />}
    </button>
  </div>
);
