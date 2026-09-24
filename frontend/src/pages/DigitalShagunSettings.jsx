import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { ArrowLeft, Gift, Save, Loader2, Heart, CreditCard, Eye, EyeOff, TrendingUp, Wallet, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const DigitalShagunSettings = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [blessings, setBlessings] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain', 'luxe-vignette');
    return () => document.body.classList.remove('luxe', 'luxe-grain', 'luxe-vignette');
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login');
    else load();
    /* eslint-disable-next-line */
  }, [admin, authLoading]);

  const load = async () => {
    try {
      const [s, p, d] = await Promise.all([
        axios.get(`${API_URL}/api/admin/profiles/${profileId}/shagun`),
        axios.get(`${API_URL}/api/admin/profiles/${profileId}`),
        axios.get(`${API_URL}/api/admin/profiles/${profileId}/shagun/dashboard`).catch(() => ({ data: null })),
      ]);
      setSettings(s.data);
      setDashboard(d.data);
      // Pull blessing counter via public endpoint using slug
      if (p.data?.slug) {
        try {
          const b = await axios.get(`${API_URL}/api/invite/${p.data.slug}/blessings`);
          setBlessings(b.data);
        } catch (_) {}
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/admin/profiles/${profileId}/shagun`, settings);
    } catch (e) { alert('Failed to save'); } finally { setSaving(false); }
  };

  if (loading || !settings) return <div className="grid place-items-center min-h-screen luxe"><div className="lux-mandala" /></div>;

  return (
    <div className="luxe min-h-screen" data-testid="digital-shagun-settings">
      <div className="px-6 md:px-12 py-10 max-w-[1100px] mx-auto">
        <button onClick={() => navigate(-1)} className="lux-btn lux-btn-ghost mb-6" data-testid="dss-back">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="mb-8">
          <span className="lux-eyebrow block mb-3">◆ Digital Shagun</span>
          <h1 className="font-display text-[2.2rem] md:text-[3.4rem] leading-tight" style={{ color: 'var(--lux-text)' }}>
            Elegant <span className="font-script italic text-gold">gifting</span>
          </h1>
          <p className="mt-3 text-sm max-w-2xl" style={{ color: 'var(--lux-text-muted)' }}>
            Configure UPI deep links — guests can offer shagun in one tap. No pushy popups, no fees.
          </p>
        </div>

        {blessings && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
            <Stat label="Blessings received" value={blessings.blessing_count || 0} />
            <Stat label="Total amount" value={`₹${(blessings.blessing_total_amount || 0).toLocaleString('en-IN')}`} />
            <Stat label="Wall-of-love wishes" value={blessings.wishes_count || 0} icon={Heart} />
          </div>
        )}

        <div className="lux-glass p-6 md:p-8" data-testid="dss-form">
          <ToggleField label="Enable digital shagun" checked={settings.enabled}
            onChange={(v) => setSettings({ ...settings, enabled: v })} testid="dss-toggle" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <Field label="UPI ID (required)" value={settings.upi_id || ''} onChange={(v) => setSettings({ ...settings, upi_id: v })}
              placeholder="yourname@okhdfcbank" testid="dss-upi" />
            <Field label="Payee name"           value={settings.payee_name || ''} onChange={(v) => setSettings({ ...settings, payee_name: v })}
              placeholder="Riya & Aarav" testid="dss-name" />
            <Field label="Google Pay handle"   value={settings.gpay_handle || ''} onChange={(v) => setSettings({ ...settings, gpay_handle: v })}
              placeholder="@okgpay" testid="dss-gpay" />
            <Field label="PhonePe handle"      value={settings.phonepe_handle || ''} onChange={(v) => setSettings({ ...settings, phonepe_handle: v })}
              placeholder="@ybl" testid="dss-phonepe" />
            <Field label="Paytm handle"        value={settings.paytm_handle || ''} onChange={(v) => setSettings({ ...settings, paytm_handle: v })}
              placeholder="@paytm" testid="dss-paytm" />
          </div>
          <div className="mt-4">
            <Field label="Blessing message" value={settings.blessing_message || ''} onChange={(v) => setSettings({ ...settings, blessing_message: v })}
              placeholder="Your blessings mean more than any gift." testid="dss-message" textarea />
          </div>
          <div className="mt-4">
            <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>Suggested amounts (₹)</span>
            <input type="text" value={(settings.suggested_amounts || []).join(', ')}
              onChange={(e) => setSettings({
                ...settings,
                suggested_amounts: e.target.value.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x) && x > 0),
              })}
              placeholder="501, 1100, 2100, 5100, 11000"
              className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
              style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
              data-testid="dss-amounts" />
          </div>
          <button onClick={save} disabled={saving} className="lux-btn mt-5" data-testid="dss-save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>

        {/* Prompt 12 — Razorpay Card / UPI / Wallet (5% platform fee) */}
        <div className="lux-glass p-6 md:p-8 mt-6" data-testid="dss-razorpay-card">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl grid place-items-center"
                style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.18), rgba(139,0,0,0.18))', border: '1px solid var(--lux-border-strong)' }}>
                <CreditCard className="w-5 h-5 text-gold" />
              </div>
              <div>
                <h2 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>
                  Razorpay <span className="font-script italic text-gold">checkout</span>
                </h2>
                <p className="text-[11px] tracking-[0.18em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
                  UPI · Cards · Wallets · Net banking
                </p>
              </div>
            </div>
            <span className="lux-pill">
              <Lock className="w-3 h-3" /> 5% platform fee
            </span>
          </div>

          <ToggleField label="Enable Razorpay checkout" checked={!!settings.razorpay_enabled}
            onChange={(v) => setSettings({ ...settings, razorpay_enabled: v })} testid="dss-rzp-toggle" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <Field
              label="Razorpay Key ID"
              value={settings.razorpay_key_id || ''}
              onChange={(v) => setSettings({ ...settings, razorpay_key_id: v })}
              placeholder="rzp_test_xxxxxxxxxxxxxx"
              testid="dss-rzp-key-id" />
            <div>
              <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>Razorpay Key Secret</span>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={settings.razorpay_key_secret || ''}
                  onChange={(e) => setSettings({ ...settings, razorpay_key_secret: e.target.value })}
                  placeholder="••••••••••••••••••••"
                  className="w-full px-3 pr-10 py-2.5 rounded-lg bg-transparent outline-none text-sm"
                  style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }}
                  data-testid="dss-rzp-key-secret" />
                <button type="button" onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded"
                  style={{ color: 'var(--lux-text-muted)' }}>
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 p-4 rounded-lg" style={{ background: 'rgba(212,175,55,0.05)', border: '1px solid var(--lux-border)' }}>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--lux-text)' }}>
              ↑ Enter <span className="text-gold">your own Razorpay keys</span> (from
              <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noreferrer"
                className="text-gold underline mx-1">dashboard.razorpay.com/app/keys</a>).
              You receive <span className="text-gold">95%</span> of every Shagun directly to your bank.
              Platform retains <span className="text-gold">5%</span> as service fee.
              Currency: <span className="text-gold">₹ INR</span> only. Start with <code className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(255,255,255,0.05)' }}>rzp_test_*</code> keys to test.
            </p>
          </div>

          <button onClick={save} disabled={saving} className="lux-btn mt-5" data-testid="dss-rzp-save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Razorpay Settings
          </button>
        </div>

        {/* Earnings Dashboard */}
        {dashboard && dashboard.total_count > 0 && (
          <div className="lux-glass p-6 md:p-8 mt-6" data-testid="dss-earnings">
            <div className="flex items-center gap-3 mb-5">
              <Wallet className="w-5 h-5 text-gold" />
              <h2 className="font-display text-2xl" style={{ color: 'var(--lux-text)' }}>
                Shagun <span className="font-script italic text-gold">earnings</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
              <Stat label="Total received" value={`₹${(dashboard.total_received || 0).toLocaleString('en-IN')}`} />
              <Stat label="Platform fee (5%)" value={`₹${Math.round(dashboard.platform_fees || 0).toLocaleString('en-IN')}`} icon={TrendingUp} />
              <Stat label="Your earnings" value={`₹${Math.round(dashboard.photographer_earnings || 0).toLocaleString('en-IN')}`} icon={Wallet} />
            </div>
            {dashboard.records?.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--lux-border)' }}>
                      {['Guest', 'Amount', 'Method', 'Platform fee', 'Your share', 'Status', 'Date'].map((h) => (
                        <th key={h} className="text-left px-3 py-3 text-[10px] tracking-[0.25em] uppercase"
                          style={{ color: 'var(--lux-gold)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.records.slice(0, 20).map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--lux-border)' }}>
                        <td className="px-3 py-3" style={{ color: 'var(--lux-text)' }}>{r.guest_name || 'Anonymous'}</td>
                        <td className="px-3 py-3 font-medium text-gold">₹{(r.amount || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3 text-xs uppercase tracking-wider" style={{ color: 'var(--lux-text-muted)' }}>{r.method || 'upi'}</td>
                        <td className="px-3 py-3" style={{ color: 'var(--lux-text)' }}>₹{Math.round(r.platform_fee || 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3 text-gold">₹{Math.round(r.photographer_amount ?? r.amount ?? 0).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-3">
                          <span className="text-[10px] tracking-[0.2em] uppercase px-2 py-1 rounded-full"
                            style={{ background: r.status === 'paid' ? 'rgba(111,207,151,0.15)' : 'rgba(255,255,255,0.05)',
                                     color: r.status === 'paid' ? '#86EFAC' : 'var(--lux-text-muted)' }}>
                            {r.status || 'recorded'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs" style={{ color: 'var(--lux-text-muted)' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value, icon: Icon = Gift }) => (
  <div className="lux-glass p-5 flex flex-col gap-2">
    <div className="flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase" style={{ color: 'var(--lux-text-muted)' }}>
      <Icon className="w-3.5 h-3.5 text-gold" /> {label}
    </div>
    <div className="font-display text-3xl text-gold leading-none">{value}</div>
  </div>
);

const Field = ({ label, value, onChange, placeholder, testid, textarea }) => (
  <label className="block">
    <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>
    {textarea ? (
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
        className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
        style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid={testid} />
    ) : (
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg bg-transparent outline-none text-sm"
        style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid={testid} />
    )}
  </label>
);

const ToggleField = ({ label, checked, onChange, testid }) => (
  <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer"
    style={{ border: '1px solid var(--lux-border)' }}>
    <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{label}</span>
    <button type="button" onClick={() => onChange(!checked)}
      className="w-11 h-6 rounded-full relative transition-colors"
      style={{ background: checked ? '#D4AF37' : 'rgba(255,255,255,0.15)' }} data-testid={testid}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
        style={{ background: 'var(--lux-text)', left: checked ? 'calc(100% - 22px)' : '2px' }} />
    </button>
  </label>
);

export default DigitalShagunSettings;
