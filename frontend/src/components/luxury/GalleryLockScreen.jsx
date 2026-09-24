import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, RotateCw } from 'lucide-react';
import { PxSpinner } from '../px';

/**
 * GalleryLockScreen — Pixora-chrome access-code prompt shown before a guest
 * enters the private wedding gallery (or the AI face-match flow).
 *
 * Props:
 *   onUnlock: async (code, remember) => Promise (throws on failure)
 *   defaultRemember?: boolean
 *   title?: string
 *   subtitle?: string
 *   testid?: string  (root data-testid)
 *   fetchFailed?: boolean   — the privacy check itself couldn't be confirmed
 *                             (backend blip); we fail closed, so surface a
 *                             retry instead of pretending we know the gate.
 *   onRetry?: () => void
 */
const GalleryLockScreen = ({
  onUnlock,
  defaultRemember = true,
  title = 'Private Wedding Gallery',
  subtitle = 'Enter the access code shared by the couple to continue.',
  testid = 'gallery-lock-screen',
  fetchFailed = false,
  onRetry,
}) => {
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(defaultRemember);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e?.preventDefault?.();
    setErr('');
    if (code.trim().length < 4) {
      setErr('Please enter the access code.');
      return;
    }
    setBusy(true);
    try {
      await onUnlock(code.trim(), remember);
    } catch (ex) {
      setErr(ex.message || 'Unlock failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="px-glass max-w-md w-full mx-auto"
      style={{ borderRadius: 'var(--px-r-card)', padding: '2.25rem 1.75rem' }}
      data-testid={testid}
    >
      <div
        className="w-16 h-16 mx-auto rounded-full grid place-items-center mb-6"
        style={{ background: 'var(--px-violet-100)', border: '1px solid var(--px-border-tint)' }}
      >
        <Lock className="w-7 h-7" style={{ color: 'var(--px-primary)' }} />
      </div>

      <h2 className="px-section-title text-center mb-2" style={{ fontSize: 'clamp(22px,6vw,28px)' }}>
        {title}
      </h2>
      <p className="px-section-sub text-center mb-7">{subtitle}</p>

      {fetchFailed && (
        <div
          className="flex items-start gap-2 text-xs px-3 py-2.5 rounded-md mb-5"
          style={{ background: 'var(--px-violet-100)', border: '1px solid var(--px-border-tint)', color: 'var(--px-primary)' }}
          data-testid="gallery-fetch-retry"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">
            We couldn&apos;t confirm this gallery&apos;s access settings. If you have a code, it will still work below — or
            {' '}
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1 underline font-semibold"
              style={{ color: 'var(--px-primary)' }}
              data-testid="gallery-fetch-retry-btn"
            >
              <RotateCw className="w-3 h-3" /> try again
            </button>.
          </span>
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="px-eyebrow block mb-2">Access Code</span>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. MANI2026"
              autoComplete="one-time-code"
              autoFocus
              spellCheck={false}
              className="px-input w-full text-center tracking-[0.3em] uppercase font-mono"
              data-testid="gallery-unlock-input"
              style={{ padding: '0.95rem 2.8rem' }}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 grid place-items-center rounded-md"
              style={{ color: 'var(--px-muted)' }}
              aria-label={show ? 'Hide code' : 'Show code'}
              data-testid="gallery-unlock-toggle-visibility"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </label>

        <label
          className="flex items-center gap-2 text-xs cursor-pointer"
          style={{ color: 'var(--px-muted)' }}
          data-testid="gallery-remember-device-label"
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-3.5 h-3.5"
            style={{ accentColor: 'var(--px-primary)' }}
            data-testid="gallery-remember-device-checkbox"
          />
          Remember this device
        </label>

        {err && (
          <div
            className="flex items-start gap-2 text-xs px-3 py-2 rounded-md"
            style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: 'var(--px-error)' }}
            data-testid="gallery-unlock-error"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{err}</span>
          </div>
        )}

        <button type="submit" disabled={busy} className="px-btn w-full justify-center" data-testid="gallery-unlock-submit">
          {busy ? <PxSpinner style={{ borderColor: 'rgba(255,255,255,.4)', borderTopColor: '#fff' }} /> : <><ShieldCheck className="w-4 h-4" /> Unlock Gallery</>}
        </button>
      </form>

      <div className="text-[10px] text-center mt-7 tracking-widest uppercase" style={{ color: 'var(--px-faint)' }}>
        Protected · 5 wrong attempts pause access for 5 minutes
      </div>
    </motion.div>
  );
};

export default GalleryLockScreen;
