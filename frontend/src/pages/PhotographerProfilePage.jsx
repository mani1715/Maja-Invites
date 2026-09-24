import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Circle, Save, Sparkles } from 'lucide-react';
import '@/styles/luxury.css';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const getAuth = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/** Photographer directory profile — set availability + listing + portfolio. */
export default function PhotographerProfilePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ directory_listed: true, bio: '', service_cities: '', portfolio_images: '' });
  const [availableNow, setAvailableNow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/api/admin/photographer/profile`, { headers: getAuth() })
      .then((r) => {
        const d = r.data || {};
        setForm({
          directory_listed: !!d.directory_listed,
          bio: d.bio || '',
          service_cities: (d.service_cities || []).join(', '),
          portfolio_images: (d.portfolio_images || []).join('\n'),
        });
        setAvailableNow(!!d.available_now);
      }).catch(() => {});
  }, []);

  const toggleAvailable = async () => {
    const next = !availableNow;
    setAvailableNow(next);
    try { await axios.post(`${API_URL}/api/admin/photographer/availability`, { available_now: next }, { headers: getAuth() }); } catch (_e) {}
  };

  const save = async () => {
    setBusy(true); setSaved(false);
    try {
      await axios.post(`${API_URL}/api/admin/photographer/profile`, {
        directory_listed: form.directory_listed,
        bio: form.bio,
        service_cities: form.service_cities.split(',').map((s) => s.trim()).filter(Boolean),
        portfolio_images: form.portfolio_images.split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      }, { headers: getAuth() });
      setSaved(true);
    } catch (_e) {} finally { setBusy(false); }
  };

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const fs = { width: '100%', padding: '0.75rem 1rem', background: 'transparent', borderRadius: '0.5rem', border: '1px solid var(--lux-border)', color: 'var(--lux-text)', outline: 'none' };

  return (
    <div className="luxe min-h-screen px-6 py-10" data-testid="photographer-profile-page">
      <div className="max-w-xl mx-auto">
        <button onClick={() => navigate('/studio/dashboard')} className="flex items-center gap-2 text-xs tracking-[0.2em] uppercase mb-6" style={{ color: 'var(--lux-text-muted)' }}>
          <ArrowLeft className="w-4 h-4" /> Dashboard
        </button>
        <h1 className="font-display text-3xl md:text-4xl mb-2" style={{ color: 'var(--lux-text)' }}>Studio <span className="font-script italic text-gold">profile</span></h1>
        <p className="text-sm mb-7" style={{ color: 'var(--lux-text-muted)' }}>How couples find you in the photographer directory.</p>

        {/* availability toggle */}
        <button onClick={toggleAvailable} data-testid="availability-toggle"
          className="w-full lux-glass p-5 flex items-center justify-between mb-6">
          <div className="text-left">
            <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>Available right now</div>
            <div className="text-xs" style={{ color: 'var(--lux-text-muted)' }}>Shows you at the top for the next 2 hours.</div>
          </div>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs"
            style={{ background: availableNow ? 'rgba(67,209,122,0.16)' : 'rgba(255,255,255,0.06)', color: availableNow ? '#7fe0a3' : 'var(--lux-text-muted)' }}>
            <Circle className="w-2.5 h-2.5" style={{ fill: availableNow ? '#43d17a' : 'transparent', color: availableNow ? '#43d17a' : 'currentColor' }} />
            {availableNow ? 'On' : 'Off'}
          </span>
        </button>

        <div className="lux-glass p-6 space-y-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--lux-text)' }}>
            <input type="checkbox" checked={form.directory_listed} onChange={(e) => setForm((s) => ({ ...s, directory_listed: e.target.checked }))} data-testid="listed-toggle" />
            List my studio in the public directory
          </label>
          <Field label="Short bio"><textarea rows={3} style={fs} value={form.bio} onChange={set('bio')} placeholder="Candid, cinematic South-Indian weddings…" data-testid="ph-bio" /></Field>
          <Field label="Cities you serve (comma-separated)"><input style={fs} value={form.service_cities} onChange={set('service_cities')} placeholder="Hyderabad, Vijayawada, Guntur" data-testid="ph-cities" /></Field>
          <Field label="Portfolio image URLs (one per line)"><textarea rows={3} style={fs} value={form.portfolio_images} onChange={set('portfolio_images')} placeholder="https://…/photo1.jpg" data-testid="ph-portfolio" /></Field>

          <button onClick={save} disabled={busy} className="lux-btn w-full justify-center" data-testid="ph-save">
            {busy ? <><Sparkles className="w-4 h-4 animate-pulse" /> Saving…</> : <><Save className="w-4 h-4" /> Save profile</>}
          </button>
          {saved && <p className="text-xs text-center" style={{ color: '#7fe0a3' }}>Saved.</p>}
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="block text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: 'var(--lux-text-muted)' }}>{label}</label>
    {children}
  </div>
);
