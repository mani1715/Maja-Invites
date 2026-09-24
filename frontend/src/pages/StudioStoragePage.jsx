// BUG-FREE-NEW-FEATURE — Studio Backup Storage (photographer dashboard).
//
// Lets a photographer:
//   1. See available plans (10 GB / 1 month, 100 GB / 3 months, 1 TB / 6 months, ...)
//   2. Subscribe to a plan via Razorpay
//   3. View their current plan, usage bar, time remaining, grace status
//   4. Drag-drop / pick files to upload (multipart) to their personal bucket
//   5. Browse + download (via signed URL) + delete files
//
// Backend routes lived in /app/backend/studio_storage.py and are mounted at
// /api/admin/studio-storage/*. The super admin defines plans via the
// dedicated tab on SuperAdminPricingHub.
//
// IMPORTANT: NEVER hardcode REACT_APP_BACKEND_URL — always read from env.

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import {
  ArrowLeft, HardDrive, Upload, Loader2, Trash2, Download, FileText,
  Calendar, CheckCircle2, AlertTriangle, Sparkles, Camera,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const RZP_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js';

const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

const fmtBytes = (n) => {
  if (!n || n < 1) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch (_e) { return iso; }
};

const daysUntil = (iso) => {
  if (!iso) return 0;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86400000));
};

const loadRazorpay = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = RZP_SCRIPT;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

const StudioStoragePage = () => {
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();

  // Auth guard
  useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login', { replace: true });
  }, [authLoading, admin, navigate]);

  const [plans, setPlans] = useState([]);
  const [founding, setFounding] = useState(null);
  // 20 plans is too many to show at once - pick a term, compare 5 sizes.
  const [period, setPeriod] = useState(365);
  const [myPlan, setMyPlan] = useState(null);   // {subscription, plan, usage}
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploads, setUploads] = useState([]);   // [{id, name, progress, done, error}]
  // Phase 3 P0 — global feature toggle (read-only on this page; super admin
  // owns the master switch). When disabled, only show existing files + the
  // disabled banner; hide plan picker + upload zone.
  const [featureEnabled, setFeatureEnabled] = useState(true);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      // Status check first — when disabled, plans listing returns 403.
      let enabled = true;
      try {
        const st = await axios.get(`${API_URL}/api/admin/studio-storage/status`, { headers: authHeaders() });
        enabled = !!st.data?.enabled;
      } catch (_e) { /* keep optimistic enabled */ }
      setFeatureEnabled(enabled);

      const plansPromise = enabled
        ? axios.get(`${API_URL}/api/admin/studio-storage/plans`, { headers: authHeaders() }).catch(() => ({ data: { items: [] } }))
        : Promise.resolve({ data: { items: [] } });

      const [pl, mp, fl] = await Promise.all([
        plansPromise,
        axios.get(`${API_URL}/api/admin/studio-storage/my-plan`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/admin/studio-storage/files`, { headers: authHeaders() }).catch(() => ({ data: { items: [] } })),
      ]);
      setPlans(pl.data?.items || []);
      setFounding(pl.data?.founding || null);
      setMyPlan(mp.data || null);
      setFiles(fl.data?.items || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not load studio storage');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && admin) refreshAll();
  }, [authLoading, admin, refreshAll]);

  // ---- Subscribe / renew via Razorpay -----------------------
  const subscribe = async (plan) => {
    setError(''); setBusy(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load Razorpay');
      const r = await axios.post(
        `${API_URL}/api/admin/studio-storage/subscribe`,
        { plan_id: plan.id },
        { headers: authHeaders() },
      );
      const { order_id, amount, currency, key_id } = r.data || {};
      if (!order_id || !key_id) throw new Error('Could not create payment order');

      const opts = {
        key: key_id,
        amount,
        currency,
        order_id,
        name: 'Studio Backup Storage',
        description: plan.name,
        handler: async (resp) => {
          try {
            await axios.post(
              `${API_URL}/api/admin/studio-storage/verify-payment`,
              {
                razorpay_order_id: resp.razorpay_order_id,
                razorpay_payment_id: resp.razorpay_payment_id,
                razorpay_signature: resp.razorpay_signature,
                plan_id: plan.id,
              },
              { headers: authHeaders() },
            );
            await refreshAll();
          } catch (verr) {
            // The charge has already gone through at this point, so do not tell
            // them they were not charged.
            setError(verr?.response?.data?.detail
              || `Payment succeeded but the plan could not be activated. Save this payment id — ${resp?.razorpay_payment_id || 'see your Razorpay receipt'} — and contact us; we will activate it manually.`);
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError('Payment cancelled — you have not been charged.');
          },
        },
        theme: { color: '#D4AF37' },
      };
      const rzp = new window.Razorpay(opts);
      try {
        rzp.on('payment.failed', (r) => {
          setBusy(false);
          setError(r?.error?.description || 'The payment failed. You have not been charged — please try again.');
        });
      } catch (_e) { /* older checkout builds have no .on() */ }
      rzp.open();
      // Deliberately NOT clearing `busy` here: the modal is open and the flow is
      // still in flight. Its own handler / ondismiss / payment.failed callbacks
      // own that. Clearing it in a `finally` re-enabled the buy button underneath
      // the open checkout, which invited a second order for the same plan.
      return;
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Could not start payment');
      setBusy(false);
    }
  };

  // ---- Upload ------------------------------------------------
  const onDrop = useCallback(async (accepted) => {
    if (!accepted || accepted.length === 0) return;
    const status = myPlan?.subscription?.status;
    if (status !== 'active') {
      setError(`Cannot upload — subscription is ${status || 'inactive'}. Renew first.`);
      return;
    }
    for (const file of accepted) {
      const localId = `up_${Math.random().toString(36).slice(2, 8)}`;
      setUploads((u) => [...u, { id: localId, name: file.name, progress: 0, done: false }]);
      const fd = new FormData();
      fd.append('file', file);
      try {
        await axios.post(`${API_URL}/api/admin/studio-storage/upload`, fd, {
          headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (evt) => {
            const pct = evt.total ? Math.round((evt.loaded / evt.total) * 100) : 0;
            setUploads((u) => u.map((x) => x.id === localId ? { ...x, progress: pct } : x));
          },
        });
        setUploads((u) => u.map((x) => x.id === localId ? { ...x, progress: 100, done: true } : x));
      } catch (e) {
        const msg = e?.response?.data?.detail || 'Upload failed';
        setUploads((u) => u.map((x) => x.id === localId ? { ...x, error: msg } : x));
      }
    }
    refreshAll();
    setTimeout(() => setUploads([]), 4000);
  }, [myPlan, refreshAll]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  // ---- Delete ------------------------------------------------
  const deleteFile = async (fileId) => {
    if (!window.confirm('Delete this file? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/api/admin/studio-storage/files/${fileId}`, { headers: authHeaders() });
      refreshAll();
    } catch (e) {
      setError(e?.response?.data?.detail || 'Could not delete file');
    }
  };

  // ---- Render ------------------------------------------------
  if (loading || authLoading) {
    return (
      <div className="luxe luxe-grain min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gold" />
      </div>
    );
  }

  const sub = myPlan?.subscription || null;
  const plan = myPlan?.plan || null;
  const usage = myPlan?.usage || null;
  const status = sub?.status || 'none';
  const usedPct = usage?.percent || 0;

  return (
    <div className="luxe luxe-grain luxe-vignette min-h-screen px-4 md:px-12 py-10" data-testid="studio-storage-page">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate('/studio/dashboard')}
          className="lux-btn lux-btn-ghost mb-6 inline-flex items-center gap-2"
          data-testid="studio-back"
        >
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <span className="lux-eyebrow block mb-2">◆ Studio backup storage</span>
          <h1 className="font-display text-[2rem] md:text-[2.6rem] mb-2" style={{ color: 'var(--lux-text)' }}>
            Store my <span className="font-script italic text-gold">photos</span>
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--lux-text)' }}>
            Keep your studio photos &amp; videos safe — even after the cards and drives are long gone.
          </p>
        </motion.div>

        {error && (
          <div className="mb-6 px-4 py-3 rounded-md text-sm" style={{ background: 'rgba(190,40,40,0.18)', border: '1px solid rgba(190,40,40,0.45)', color: '#FFD7D7' }}>
            {error}
          </div>
        )}

        {!featureEnabled && (
          <div
            className="lux-glass p-5 mb-6 flex items-start gap-3"
            style={{ borderColor: 'rgba(255,165,0,0.45)' }}
            data-testid="studio-feature-disabled-banner"
          >
            <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: '#FFB463' }} />
            <div>
              <h3 className="font-display text-lg mb-1" style={{ color: 'var(--lux-text)' }}>Feature temporarily disabled</h3>
              <p className="text-xs" style={{ color: 'var(--lux-text)' }}>
                Studio storage is currently disabled by the administrator. Your existing
                files remain available below for download &amp; deletion, but new uploads
                and new subscriptions are paused. Please check back later.
              </p>
            </div>
          </div>
        )}

        {/* CURRENT PLAN */}
        {sub ? (
          <section className="lux-glass p-6 mb-8" data-testid="studio-current-plan">
            <div className="flex flex-wrap items-start gap-4 justify-between">
              <div>
                <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: 'var(--lux-text-muted)' }}>Current plan</div>
                <h2 className="font-display text-2xl mb-1" style={{ color: 'var(--lux-text)' }}>{plan?.name || 'Unknown plan'}</h2>
                <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                  {plan?.gb_limit} GB · {plan?.duration_days} days base + {plan?.grace_days || 0} day grace
                </div>
              </div>
              <div className="text-right">
                <StatusPill status={status} />
                <div className="text-[10px] mt-2" style={{ color: 'var(--lux-text-muted)' }}>
                  {status === 'active' && `Renews in ${daysUntil(sub.expires_at)} days`}
                  {status === 'grace' && `Auto-purge in ${daysUntil(sub.purge_at)} days`}
                  {status === 'expired' && 'Subscription has expired'}
                </div>
              </div>
            </div>

            {/* USAGE BAR */}
            <div className="mt-5">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--lux-text)' }}>
                <span>{fmtBytes(usage?.used_bytes || 0)} used</span>
                <span>{fmtBytes(usage?.cap_bytes || 0)} cap</span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--lux-panel)' }}>
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.min(100, usedPct)}%`,
                    background: usedPct > 90 ? 'linear-gradient(90deg,#E36464,#D4AF37)' : 'linear-gradient(90deg,#D4AF37,#FFE49A)',
                  }}
                  data-testid="studio-usage-bar"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-xs" style={{ color: 'var(--lux-text)' }}>
              <div>
                <Calendar className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
                Starts {fmtDate(sub.starts_at)}
              </div>
              <div>
                <Calendar className="w-3.5 h-3.5 inline-block mr-1 align-text-bottom" />
                Expires {fmtDate(sub.expires_at)}
              </div>
            </div>

            {featureEnabled && (status === 'grace' || status === 'active') && (
              <div className="mt-5">
                <button
                  onClick={() => subscribe(plan)}
                  disabled={busy}
                  className="lux-btn flex items-center gap-2 text-xs"
                  data-testid="studio-renew"
                >
                  <Sparkles className="w-4 h-4" />
                  {status === 'grace' ? 'Renew now to keep your files' : `Extend ${plan?.duration_days} more days`}
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="lux-glass p-6 mb-8 text-center" data-testid="studio-no-plan">
            <HardDrive className="w-10 h-10 text-gold mx-auto mb-3" />
            <h2 className="font-display text-xl mb-1" style={{ color: 'var(--lux-text)' }}>No plan yet</h2>
            <p className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>
              Pick a plan below to start backing up your studio photos and videos.
            </p>
          </section>
        )}

        {/* PLAN PICKER */}
        {featureEnabled && plans.length > 0 && (
          <section className="mb-10" data-testid="studio-plans-section">
            <h3 className="font-display text-xl mb-4" style={{ color: 'var(--lux-text)' }}>
              {sub ? 'Switch / extend plan' : 'Choose a plan'}
            </h3>
            {/* Founding-rate banner. Only shown while it is genuinely
                available - no fake scarcity once the slots are gone. */}
            {founding?.eligible && (
              <div className="lux-glass p-4 mb-5 flex flex-wrap items-center gap-3"
                style={{ border: '1px solid rgba(212,175,55,0.45)' }}
                data-testid="studio-founding-banner">
                <Sparkles className="w-4 h-4" style={{ color: '#E8C97A' }} />
                <div className="text-sm" style={{ color: 'var(--lux-text)' }}>
                  {founding.already_founder
                    ? 'You have the founding rate. It stays with you on every renewal.'
                    : `Founding pricing — ${founding.slots_left} of ${founding.slots_total} places left. Lock it in and it is yours on every renewal.`}
                </div>
              </div>
            )}

            {/* Billing term switcher */}
            <div className="flex flex-wrap gap-2 mb-5" data-testid="studio-plan-periods">
              {[[30, 'Monthly'], [90, '3 Months'], [180, '6 Months'], [365, 'Yearly']].map(([d, label]) => (
                <button key={d} onClick={() => setPeriod(d)}
                  className="px-4 py-2 min-h-[44px] rounded-xl text-xs uppercase tracking-[0.12em]"
                  style={period === d
                    ? { background: 'linear-gradient(135deg,#E8C97A,#D4AF37)', color: '#0E0A06' }
                    : { color: 'var(--lux-text-muted)', border: '1px solid var(--lux-border)' }}
                  data-testid={`studio-plan-period-${d}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {plans
                .filter((p) => p.duration_days === period)
                .sort((a, b) => a.gb_limit - b.gb_limit)
                .map((p) => {
                const pay = p.effective_price_inr ?? p.price_inr;
                const saving = p.price_inr - pay;
                return (
                <div
                  key={p.id}
                  className="lux-glass p-5 flex flex-col"
                  data-testid={`studio-plan-${p.id}`}
                >
                  <div className="text-[10px] tracking-[0.3em] uppercase mb-1" style={{ color: '#D4AF37' }}>{p.gb_limit >= 1024 ? `${(p.gb_limit / 1024).toFixed(0)} TB` : `${p.gb_limit} GB`}</div>
                  <div className="text-xs mb-3" style={{ color: 'var(--lux-text-muted)' }}>
                    {p.duration_days} days · {p.grace_days || 0} day grace window
                  </div>
                  {/* Struck-through regular price only when the studio really
                      is paying less - never as decoration. */}
                  {saving > 0 && (
                    <div className="text-sm line-through" style={{ color: 'var(--lux-text-faint)' }}>
                      ₹ {p.price_inr.toLocaleString('en-IN')}
                    </div>
                  )}
                  <div className="text-3xl font-display" style={{ color: '#D4AF37' }}>
                    ₹ {pay.toLocaleString('en-IN')}
                  </div>
                  {saving > 0 && (
                    <div className="text-[11px] mb-4" style={{ color: '#8AC47F' }}>
                      Founding rate — you save ₹{saving.toLocaleString('en-IN')}
                    </div>
                  )}
                  {saving <= 0 && <div className="mb-4" />}
                  <button
                    onClick={() => subscribe(p)}
                    disabled={busy}
                    className="lux-btn mt-auto flex items-center justify-center gap-2"
                    data-testid={`studio-plan-buy-${p.id}`}
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    {sub?.plan_id === p.id ? 'Renew' : 'Choose plan'}
                  </button>
                </div>
                );
              })}
            </div>
          </section>
        )}

        {/* UPLOAD ZONE */}
        {featureEnabled && sub && status === 'active' && (
          <section className="mb-10" data-testid="studio-upload-zone">
            <h3 className="font-display text-xl mb-3" style={{ color: 'var(--lux-text)' }}>Upload files</h3>
            <div
              {...getRootProps()}
              className="lux-glass p-8 text-center cursor-pointer transition-all"
              style={{
                border: isDragActive ? '1px dashed #D4AF37' : '1px dashed rgba(212,175,55,0.35)',
                background: isDragActive ? 'rgba(212,175,55,0.08)' : 'rgba(212,175,55,0.03)',
              }}
              data-testid="studio-dropzone"
            >
              <input {...getInputProps()} />
              <Upload className="w-8 h-8 text-gold mx-auto mb-3" />
              <p className="text-sm" style={{ color: 'var(--lux-text)' }}>
                {isDragActive ? 'Drop the files here…' : 'Drag &amp; drop files here, or click to choose'}
              </p>
              <p className="text-[10px] mt-2" style={{ color: 'var(--lux-text-muted)' }}>
                Photos · videos · ZIP archives · 500 MB max per file
              </p>
            </div>

            {uploads.length > 0 && (
              <div className="mt-4 space-y-2">
                {uploads.map((u) => (
                  <div key={u.id} className="lux-glass p-3 flex items-center gap-3 text-xs" style={{ color: 'var(--lux-text)' }}>
                    <FileText className="w-4 h-4 text-gold" />
                    <span className="flex-1 truncate">{u.name}</span>
                    {u.error ? <span style={{ color: '#FFB4B4' }}>{u.error}</span>
                      : u.done ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                      : <span>{u.progress}%</span>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* FILES LIST */}
        {sub && (
          <section data-testid="studio-files-section">
            <h3 className="font-display text-xl mb-3" style={{ color: 'var(--lux-text)' }}>
              Your backup ({files.length} {files.length === 1 ? 'file' : 'files'})
            </h3>
            {files.length === 0 ? (
              <div className="lux-glass p-6 text-center text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                Nothing uploaded yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {files.map((f) => (
                  <div key={f.id} className="lux-glass p-4 flex items-center gap-3" data-testid={`studio-file-${f.id}`}>
                    <FileText className="w-5 h-5 text-gold" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: 'var(--lux-text)' }}>{f.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--lux-text-muted)' }}>
                        {fmtBytes(f.size_bytes)} · {fmtDate(f.uploaded_at)}
                      </div>
                    </div>
                    {f.download_url && (
                      <a
                        href={f.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="lux-btn-ghost p-2"
                        title="Download"
                        data-testid={`studio-file-dl-${f.id}`}
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      onClick={() => deleteFile(f.id)}
                      className="lux-btn-ghost p-2"
                      title="Delete"
                      data-testid={`studio-file-del-${f.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

const StatusPill = ({ status }) => {
  let bg = 'rgba(212,175,55,0.15)';
  let color = '#D4AF37';
  let label = status;
  let Icon = CheckCircle2;
  if (status === 'active') { label = 'Active'; }
  else if (status === 'grace') { bg = 'rgba(255, 165, 0, 0.18)'; color = '#FFB463'; label = 'Grace window'; Icon = AlertTriangle; }
  else if (status === 'expired') { bg = 'rgba(190,40,40,0.18)'; color = '#FFB4B4'; label = 'Expired'; Icon = AlertTriangle; }
  else if (status === 'none') { label = 'No plan'; Icon = HardDrive; }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] tracking-[0.2em] uppercase"
      style={{ background: bg, color, border: `1px solid ${color}55` }}
    >
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
};

export default StudioStoragePage;
