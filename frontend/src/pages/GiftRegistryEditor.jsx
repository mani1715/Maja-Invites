import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import {
  Gift, ArrowLeft, Save, Plus, Trash2, GripVertical, Loader2, Check, AlertCircle,
  Sparkles, Wallet, Building2, Link2, ToggleLeft, ToggleRight, Heart,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

const emptyRegistry = {
  enabled: false,
  show_disabled_note: true,
  headline: 'With love, not gifts',
  message: 'Your presence at our wedding is the most precious gift we could ask for. If you still wish to bless us, here are a few thoughtful ideas.',
  accept_upi: false,
  upi_id: '',
  upi_name: '',
  accept_bank: false,
  bank_account_name: '',
  bank_account_number: '',
  bank_ifsc: '',
  bank_name: '',
  accept_external_registry: false,
  external_registry_url: '',
  external_registry_label: 'View our wishlist',
  suggestions: [],
};

const GiftRegistryEditor = () => {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const { admin, loading: authLoading } = useAuth();
  const [reg, setReg] = useState(emptyRegistry);
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    document.body.classList.add('luxe', 'luxe-grain');
    return () => document.body.classList.remove('luxe', 'luxe-grain');
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!admin) navigate('/studio/login', { replace: true });
  }, [admin, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || !admin) return;
    const token = localStorage.getItem('admin_token');
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get(`${API_URL}/api/admin/profiles/${profileId}/gifts`, { headers }),
      axios.get(`${API_URL}/api/gifts/presets`),
    ])
      .then(([gRes, pRes]) => {
        setReg({ ...emptyRegistry, ...(gRes.data || {}) });
        setPresets(pRes.data?.presets || []);
      })
      .catch((e) => setMsg({ type: 'err', text: e.response?.data?.detail || 'Failed to load' }))
      .finally(() => setLoading(false));
  }, [profileId, admin, authLoading]);

  const set = (patch) => setReg((prev) => ({ ...prev, ...patch }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const token = localStorage.getItem('admin_token');
      const r = await axios.put(
        `${API_URL}/api/admin/profiles/${profileId}/gifts`,
        reg,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReg({ ...emptyRegistry, ...r.data });
      setMsg({ type: 'ok', text: 'Saved successfully' });
      setTimeout(() => setMsg(null), 2400);
    } catch (e) {
      setMsg({ type: 'err', text: e.response?.data?.detail || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const addSuggestion = (preset = null) => {
    const base = preset || {
      title: '', description: '', category: 'custom', icon: '🎁',
      price_hint: '', link: '', image_url: '',
    };
    const next = [...(reg.suggestions || []), {
      id: `tmp-${Date.now()}`,
      order: (reg.suggestions || []).length,
      ...base,
    }];
    set({ suggestions: next });
  };

  const updateSuggestion = (idx, patch) => {
    const next = [...(reg.suggestions || [])];
    next[idx] = { ...next[idx], ...patch };
    set({ suggestions: next });
  };

  const removeSuggestion = (idx) => {
    const next = (reg.suggestions || []).filter((_, i) => i !== idx);
    set({ suggestions: next });
  };

  const move = (idx, dir) => {
    const next = [...(reg.suggestions || [])];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    next.forEach((s, i) => { s.order = i; });
    set({ suggestions: next });
  };

  if (loading) {
    return (
      <div className="luxe min-h-screen grid place-items-center">
        <Loader2 className="w-7 h-7 animate-spin text-gold" />
      </div>
    );
  }

  const enabled = reg.enabled;

  return (
    <div className="luxe min-h-screen pb-20">
      <header className="px-6 md:px-12 py-6 flex items-center justify-between border-b" style={{ borderColor: 'var(--lux-border)' }}>
        <button onClick={() => navigate('/studio/dashboard')} className="inline-flex items-center gap-2 text-sm tracking-[0.15em] uppercase opacity-80 hover:opacity-100" data-testid="back-dashboard">
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <div className="flex items-center gap-3">
          <Gift className="w-5 h-5 text-gold" />
          <h1 className="font-display text-lg md:text-2xl" style={{ color: 'var(--lux-text)' }}>Gift Registry</h1>
        </div>
        <button onClick={save} disabled={saving} className="lux-btn inline-flex items-center gap-2 disabled:opacity-50" data-testid="gift-save">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-6 md:px-12 py-10 space-y-8">
        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="px-4 py-3 rounded-lg text-sm inline-flex items-center gap-2"
              style={{
                background: msg.type === 'ok' ? 'rgba(0,170,80,0.12)' : 'rgba(139,0,0,0.15)',
                border: `1px solid ${msg.type === 'ok' ? 'rgba(67,224,127,0.3)' : 'rgba(255,90,90,0.3)'}`,
                color: msg.type === 'ok' ? '#86EFAC' : '#FFD7C9',
              }}
              data-testid="gift-msg"
            >
              {msg.type === 'ok' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Master toggle */}
        <Section title="Gifts visibility" subtitle="Choose whether guests see a gift section on your invitation.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ToggleCard
              testid="toggle-gifts-on"
              active={enabled}
              onClick={() => set({ enabled: true })}
              icon={Heart}
              title="Gifts allowed"
              desc="Show a gentle gift section with suggestions, UPI & bank details (optional)."
            />
            <ToggleCard
              testid="toggle-gifts-off"
              active={!enabled}
              onClick={() => set({ enabled: false })}
              icon={Gift}
              title="No gifts, please"
              desc="Politely tell guests gifts aren't needed — just their presence."
            />
          </div>

          {!enabled && (
            <label className="flex items-center gap-2 mt-4 text-sm" style={{ color: 'var(--lux-text)' }}>
              <input type="checkbox" checked={!!reg.show_disabled_note} onChange={(e) => set({ show_disabled_note: e.target.checked })} data-testid="gift-disabled-note" />
              Still show a polite "no gifts" note on the invitation
            </label>
          )}
        </Section>

        {enabled && (
          <>
            <Section title="Headline & message" subtitle="Set the tone for your gift section.">
              <Field label="Headline" value={reg.headline} onChange={(x) => set({ headline: x })} testid="gift-headline" placeholder="With love, not gifts" />
              <Field label="Message to guests" value={reg.message} onChange={(x) => set({ message: x })} testid="gift-message" textarea rows={3} placeholder="A short note about gifts..." />
              <CharCount value={reg.message} max={500} />
            </Section>

            <Section title="Payment options (optional)" subtitle="Add UPI / bank / external registry only if you're comfortable.">
              {/* UPI */}
              <ToggleRow testid="toggle-upi" active={reg.accept_upi} onChange={(v) => set({ accept_upi: v })} icon={Wallet} label="Accept UPI shagun" />
              {reg.accept_upi && (
                <div className="pl-6 pt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="UPI ID" value={reg.upi_id} onChange={(x) => set({ upi_id: x })} testid="gift-upi-id" placeholder="yourname@okhdfcbank" />
                  <Field label="Name on UPI" value={reg.upi_name} onChange={(x) => set({ upi_name: x })} testid="gift-upi-name" placeholder="Aarav Sharma" />
                </div>
              )}

              {/* Bank */}
              <ToggleRow testid="toggle-bank" active={reg.accept_bank} onChange={(v) => set({ accept_bank: v })} icon={Building2} label="Show bank details" />
              {reg.accept_bank && (
                <div className="pl-6 pt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Account name" value={reg.bank_account_name} onChange={(x) => set({ bank_account_name: x })} testid="gift-bank-name" placeholder="Aarav Sharma" />
                  <Field label="Account number" value={reg.bank_account_number} onChange={(x) => set({ bank_account_number: x })} testid="gift-bank-account" placeholder="123456789012" />
                  <Field label="IFSC" value={reg.bank_ifsc} onChange={(x) => set({ bank_ifsc: x.toUpperCase() })} testid="gift-bank-ifsc" placeholder="HDFC0001234" />
                  <Field label="Bank name" value={reg.bank_name} onChange={(x) => set({ bank_name: x })} testid="gift-bank-bank" placeholder="HDFC Bank" />
                </div>
              )}

              {/* External registry */}
              <ToggleRow testid="toggle-ext" active={reg.accept_external_registry} onChange={(v) => set({ accept_external_registry: v })} icon={Link2} label="External registry / wishlist" />
              {reg.accept_external_registry && (
                <div className="pl-6 pt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="URL" value={reg.external_registry_url} onChange={(x) => set({ external_registry_url: x })} testid="gift-ext-url" placeholder="https://amazon.in/wishlist/..." />
                  <Field label="Button label" value={reg.external_registry_label} onChange={(x) => set({ external_registry_label: x })} testid="gift-ext-label" placeholder="View our wishlist" />
                </div>
              )}
            </Section>

            <Section
              title="Gift suggestions"
              subtitle="Curated ideas guests can browse. Add your own or pick from our presets."
              right={
                <button onClick={() => addSuggestion()} className="lux-btn-ghost inline-flex items-center gap-1.5 text-xs" data-testid="add-custom-suggestion">
                  <Plus className="w-3.5 h-3.5" /> Add custom
                </button>
              }
            >
              <div className="flex flex-wrap gap-2 mb-4">
                {presets.map((p) => (
                  <button key={p.id} onClick={() => addSuggestion(p)} type="button"
                    className="px-3 py-1.5 rounded-full text-xs tracking-[0.1em] uppercase inline-flex items-center gap-1.5 transition-all hover:bg-[rgba(212,175,55,0.12)]"
                    style={{ border: '1px solid var(--lux-border)', color: 'var(--lux-text)' }}
                    data-testid={`add-preset-${p.id}`}>
                    <span>{p.icon}</span> {p.title}
                  </button>
                ))}
              </div>

              {(reg.suggestions || []).length === 0 ? (
                <EmptySuggestions onAdd={() => addSuggestion()} />
              ) : (
                <div className="space-y-3">
                  {reg.suggestions.map((s, idx) => (
                    <div key={s.id || idx} className="lux-glass p-4 space-y-3" data-testid={`suggestion-${idx}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col items-center pt-1">
                          <button onClick={() => move(idx, -1)} disabled={idx === 0} className="opacity-50 hover:opacity-100 disabled:opacity-20" data-testid={`move-up-${idx}`}>▲</button>
                          <GripVertical className="w-3 h-3 my-1 opacity-30" />
                          <button onClick={() => move(idx, 1)} disabled={idx === reg.suggestions.length - 1} className="opacity-50 hover:opacity-100 disabled:opacity-20" data-testid={`move-down-${idx}`}>▼</button>
                        </div>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-[80px_1fr_120px] gap-2">
                          <Field label="Icon" value={s.icon} onChange={(x) => updateSuggestion(idx, { icon: x })} testid={`s-icon-${idx}`} placeholder="🎁" />
                          <Field label="Title" value={s.title} onChange={(x) => updateSuggestion(idx, { title: x })} testid={`s-title-${idx}`} placeholder="Home essentials" />
                          <Field label="Price hint" value={s.price_hint || ''} onChange={(x) => updateSuggestion(idx, { price_hint: x })} testid={`s-price-${idx}`} placeholder="₹500 – ₹5,000" />
                        </div>
                        <button onClick={() => removeSuggestion(idx)} className="opacity-60 hover:opacity-100 text-red-300 p-1" data-testid={`remove-${idx}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <Field label="Description" value={s.description || ''} onChange={(x) => updateSuggestion(idx, { description: x })} testid={`s-desc-${idx}`} placeholder="What this is..." textarea rows={2} />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Field label="Link (optional)" value={s.link || ''} onChange={(x) => updateSuggestion(idx, { link: x })} testid={`s-link-${idx}`} placeholder="https://..." />
                        <Field label="Image URL (optional)" value={s.image_url || ''} onChange={(x) => updateSuggestion(idx, { image_url: x })} testid={`s-image-${idx}`} placeholder="https://..." />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        <div className="pt-4 flex justify-end">
          <button onClick={save} disabled={saving} className="lux-btn inline-flex items-center gap-2 disabled:opacity-50" data-testid="gift-save-bottom">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save changes
          </button>
        </div>
      </main>
    </div>
  );
};

// ---- subcomponents ----

const Section = ({ title, subtitle, right, children }) => (
  <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
    className="lux-glass p-6 md:p-7 space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="font-display text-xl md:text-2xl" style={{ color: 'var(--lux-text)' }}>{title}</h2>
        {subtitle && <p className="text-xs md:text-sm mt-1" style={{ color: 'var(--lux-text-muted)' }}>{subtitle}</p>}
      </div>
      {right}
    </div>
    {children}
  </motion.section>
);

const Field = ({ label, value, onChange, placeholder, testid, textarea, rows = 2 }) => (
  <label className="block">
    {label && <span className="text-[10px] tracking-[0.3em] uppercase block mb-1" style={{ color: 'var(--lux-text-muted)' }}>{label}</span>}
    {textarea ? (
      <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="w-full px-3 py-2 rounded-lg bg-transparent outline-none text-sm focus:border-gold transition-colors"
        style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid={testid} />
    ) : (
      <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-transparent outline-none text-sm focus:border-gold transition-colors"
        style={{ color: 'var(--lux-text)', border: '1px solid var(--lux-border)' }} data-testid={testid} />
    )}
  </label>
);

const ToggleCard = ({ active, onClick, icon: Icon, title, desc, testid }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    className="text-left p-5 rounded-xl transition-all"
    style={{
      background: active ? 'rgba(212,175,55,0.1)' : 'transparent',
      border: `1px solid ${active ? '#D4AF37' : 'var(--lux-border)'}`,
    }}>
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4" style={{ color: active ? '#D4AF37' : 'var(--lux-text-muted)' }} />
      <div className="font-medium text-sm" style={{ color: 'var(--lux-text)' }}>{title}</div>
      {active && <Check className="w-3.5 h-3.5 ml-auto text-gold" />}
    </div>
    <p className="text-xs leading-relaxed" style={{ color: 'var(--lux-text-muted)' }}>{desc}</p>
  </button>
);

const ToggleRow = ({ active, onChange, icon: Icon, label, testid }) => (
  <button type="button" onClick={() => onChange(!active)} data-testid={testid}
    className="w-full flex items-center justify-between p-3 rounded-lg transition-all hover:bg-[rgba(212,175,55,0.06)]"
    style={{ border: '1px solid var(--lux-border)' }}>
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-gold" />
      <span className="text-sm" style={{ color: 'var(--lux-text)' }}>{label}</span>
    </div>
    {active ? <ToggleRight className="w-6 h-6 text-gold" /> : <ToggleLeft className="w-6 h-6 opacity-50" />}
  </button>
);

const CharCount = ({ value, max }) => (
  <div className="text-[10px] mt-1 text-right" style={{ color: (value || '').length > max ? '#FFD7C9' : 'var(--lux-text-faint)' }}>
    {(value || '').length} / {max}
  </div>
);

const EmptySuggestions = ({ onAdd }) => (
  <div className="text-center py-8 rounded-xl" style={{ border: '1px dashed var(--lux-border)' }}>
    <Sparkles className="w-6 h-6 mx-auto text-gold mb-2 opacity-70" />
    <p className="text-sm" style={{ color: 'var(--lux-text)' }}>No suggestions yet.</p>
    <p className="text-xs mb-4" style={{ color: 'var(--lux-text-muted)' }}>Pick from the presets above or add a custom one.</p>
    <button onClick={onAdd} className="lux-btn-ghost inline-flex items-center gap-1.5 text-xs" data-testid="empty-add">
      <Plus className="w-3.5 h-3.5" /> Add suggestion
    </button>
  </div>
);

export default GiftRegistryEditor;
