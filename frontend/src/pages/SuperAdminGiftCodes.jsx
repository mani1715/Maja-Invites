/**
 * SuperAdminGiftCodes — manage gift-code campaigns.
 *
 * Backed by:
 *   POST   /api/super-admin/gift-codes              (create)
 *   GET    /api/super-admin/gift-codes              (list)
 *   PATCH  /api/super-admin/gift-codes/{code}       (update / activate)
 *   DELETE /api/super-admin/gift-codes/{code}       (deactivate)
 *   GET    /api/super-admin/gift-codes/{code}/redemptions
 */
import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Gift, Copy, CheckCircle, X, Power } from 'lucide-react';
import BackButton from '@/components/BackButton';

const API = process.env.REACT_APP_BACKEND_URL || '';

export default function SuperAdminGiftCodes() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const token = (typeof window !== 'undefined' && window.localStorage)
    ? localStorage.getItem('admin_token') : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/super-admin/gift-codes`, { headers });
      const data = await r.json();
      setCodes(Array.isArray(data?.items) ? data.items : []);
    } catch (_) { /* swallow */ }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onCopy = (code) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(''), 1200);
  };

  const onToggleActive = async (c) => {
    setError('');
    try {
      if (c.is_active) {
        await fetch(`${API}/api/super-admin/gift-codes/${c.code}`, { method: 'DELETE', headers });
      } else {
        await fetch(`${API}/api/super-admin/gift-codes/${c.code}`, {
          method: 'PATCH', headers, body: JSON.stringify({ is_active: true }),
        });
      }
      refresh();
    } catch (_) {
      setError('Could not update code');
    }
  };

  const onCreate = async (form) => {
    setError('');
    setCreating(true);
    try {
      const body = {
        credits: Number(form.credits),
        description: form.description || '',
        per_account_limit: Number(form.per_account_limit || 1),
      };
      if (form.code) body.code = form.code.trim().toUpperCase();
      if (form.max_redemptions) body.max_redemptions = Number(form.max_redemptions);
      if (form.expires_at) body.expires_at = new Date(form.expires_at).toISOString();
      const r = await fetch(`${API}/api/super-admin/gift-codes`, {
        method: 'POST', headers, body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.detail || 'Could not create code');
      } else {
        setShowCreate(false);
        refresh();
      }
    } catch (_) {
      setError('Network error');
    }
    setCreating(false);
  };

  return (
    <div className="min-h-screen px-5 sm:px-10 py-10" style={{ background: '#0a0a0a', color: '#F5ECD7' }} data-testid="super-admin-gift-codes-page">
      <div className="max-w-5xl mx-auto">
        <BackButton to="/super-admin/credits" label="Back to credits hub" />

        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-8 mt-4">
          <div>
            <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: 'rgba(245,236,215,0.55)' }}>Super admin</div>
            <h1 className="font-display text-3xl sm:text-4xl" style={{ color: 'var(--lux-text)' }}>Gift codes</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(245,236,215,0.55)' }}>
              Generate redeemable codes that grant credits when claimed by any photographer or user.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            data-testid="create-gift-code-btn"
            className="px-5 py-2.5 rounded-lg text-[11px] tracking-[0.3em] uppercase font-medium flex items-center gap-2"
            style={{ background: '#D4AF37', color: '#1A0F08' }}
          >
            <Plus className="w-4 h-4" /> New code
          </button>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-lg text-sm" style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)', color: '#FCA5A5' }}>
            {error}
          </div>
        )}

        <div className="rounded-2xl overflow-hidden"
             style={{ background: 'rgba(245,236,215,0.04)', border: '1px solid rgba(245,236,215,0.12)' }}>
          {loading && (
            <div className="px-5 py-10 text-center text-sm" style={{ color: 'rgba(245,236,215,0.55)' }}>
              Loading…
            </div>
          )}
          {!loading && codes.length === 0 && (
            <div className="px-5 py-10 text-center text-sm" style={{ color: 'rgba(245,236,215,0.55)' }} data-testid="no-codes-yet">
              No gift codes yet. Create your first one to power an early-access campaign.
            </div>
          )}
          {codes.map((c) => {
            const cap = c.max_redemptions ? `${c.redeemed_count || 0}/${c.max_redemptions}` : `${c.redeemed_count || 0}/∞`;
            return (
              <motion.div
                key={c.code}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
                className="flex items-center gap-4 px-5 py-4 border-b last:border-b-0 flex-wrap"
                style={{ borderColor: 'rgba(245,236,215,0.08)' }}
                data-testid={`gift-code-row-${c.code}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Gift className="w-4 h-4" style={{ color: '#D4AF37' }} />
                  <span className="font-mono text-lg tracking-[0.2em]" style={{ color: 'var(--lux-text)' }}>{c.code}</span>
                  <button
                    onClick={() => onCopy(c.code)}
                    data-testid={`copy-code-${c.code}`}
                    className="text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded"
                    style={{ background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}
                    title="Copy"
                  >
                    {copied === c.code ? <CheckCircle className="w-3 h-3 inline" /> : <Copy className="w-3 h-3 inline" />}
                  </button>
                </div>
                <div className="text-sm" style={{ color: 'var(--lux-text)' }}>{c.credits} credits</div>
                <div className="text-[11px] tracking-[0.15em] uppercase" style={{ color: 'rgba(245,236,215,0.55)' }}>
                  Used {cap} · 1 per account
                </div>
                <div className="text-[11px] truncate max-w-[260px]" style={{ color: 'rgba(245,236,215,0.65)' }} title={c.description}>
                  {c.description || '—'}
                </div>
                <button
                  onClick={() => onToggleActive(c)}
                  data-testid={`toggle-code-${c.code}`}
                  className="text-[10px] tracking-[0.2em] uppercase px-3 py-1.5 rounded flex items-center gap-1"
                  style={c.is_active
                    ? { background: 'rgba(16,185,129,0.15)', color: '#34D399', border: '1px solid rgba(16,185,129,0.35)' }
                    : { background: 'rgba(245,236,215,0.05)', color: 'rgba(245,236,215,0.45)', border: '1px solid rgba(245,236,215,0.15)' }}
                >
                  <Power className="w-3 h-3" /> {c.is_active ? 'Active' : 'Off'}
                </button>
              </motion.div>
            );
          })}
        </div>

        {showCreate && (
          <CreateModal
            onClose={() => setShowCreate(false)}
            onCreate={onCreate}
            busy={creating}
          />
        )}
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreate, busy }) {
  const [form, setForm] = useState({
    code: '',
    credits: 100,
    description: '',
    max_redemptions: '',
    per_account_limit: 1,
    expires_at: '',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" data-testid="create-gift-code-modal">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-2xl p-6"
        style={{ background: '#0e0e0e', border: '1px solid rgba(212,175,55,0.35)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>New gift code</h3>
          <button onClick={onClose} data-testid="close-create-modal"><X className="w-5 h-5" style={{ color: '#F5ECD7' }} /></button>
        </div>

        <div className="space-y-3">
          <Field label="Code (optional — leave blank to auto-generate)">
            <input value={form.code} onChange={set('code')} maxLength={16}
                   placeholder="LOVE26"
                   data-testid="form-code"
                   className="w-full px-3 py-2.5 rounded-md outline-none tracking-[0.25em] uppercase font-mono"
                   style={inputStyle} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Credits">
              <input type="number" min={1} value={form.credits} onChange={set('credits')}
                     data-testid="form-credits"
                     className="w-full px-3 py-2.5 rounded-md outline-none" style={inputStyle} />
            </Field>
            <Field label="Max redemptions (blank = unlimited)">
              <input type="number" min={1} value={form.max_redemptions} onChange={set('max_redemptions')}
                     placeholder="50"
                     data-testid="form-max-redemptions"
                     className="w-full px-3 py-2.5 rounded-md outline-none" style={inputStyle} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Per-account limit">
              <input type="number" min={1} max={10} value={form.per_account_limit} onChange={set('per_account_limit')}
                     data-testid="form-per-account-limit"
                     className="w-full px-3 py-2.5 rounded-md outline-none" style={inputStyle} />
            </Field>
            <Field label="Expires at (optional)">
              <input type="datetime-local" value={form.expires_at} onChange={set('expires_at')}
                     data-testid="form-expires-at"
                     className="w-full px-3 py-2.5 rounded-md outline-none" style={inputStyle} />
            </Field>
          </div>
          <Field label="Description">
            <input value={form.description} onChange={set('description')}
                   placeholder="Conference 2026 giveaway"
                   data-testid="form-description"
                   className="w-full px-3 py-2.5 rounded-md outline-none" style={inputStyle} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded text-[11px] tracking-[0.3em] uppercase"
                  style={{ color: '#F5ECD7' }}>
            Cancel
          </button>
          <button onClick={() => onCreate(form)} disabled={busy || !form.credits}
                  data-testid="form-submit"
                  className="px-5 py-2 rounded text-[11px] tracking-[0.3em] uppercase font-medium disabled:opacity-50"
                  style={{ background: '#D4AF37', color: '#1A0F08' }}>
            {busy ? 'Creating…' : 'Create code'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const inputStyle = {
  background: 'rgba(245,236,215,0.06)',
  color: 'var(--lux-text)',
  border: '1px solid rgba(212,175,55,0.35)',
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="text-[10px] tracking-[0.3em] uppercase block mb-1.5" style={{ color: 'rgba(245,236,215,0.65)' }}>{label}</span>
    {children}
  </label>
);
