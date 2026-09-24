// UpgradesStore (Phase 9, revenue) — the paid upsells: storage add-ons, Featured
// Photographer, Verification tiers, Featured Listing. Uses /api/monetization/*.
// If payment keys aren't configured the purchase button shows
// "Payment integration pending configuration." (no charge, nothing breaks).
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { HardDrive, Star, BadgeCheck, Megaphone, Loader2, Check } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';
const authHeaders = () => {
  const t = localStorage.getItem('admin_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const SECTIONS = [
  { key: 'storage', label: 'Storage add-ons', icon: HardDrive, note: 'Extra space on top of your plan.' },
  { key: 'featured_photographer', label: 'Featured Photographer', icon: Star, note: 'Appear first on homepage, Discover & search.' },
  { key: 'verification', label: 'Verification', icon: BadgeCheck, note: 'Get the trusted verified badge.' },
  { key: 'featured_listing', label: 'Featured Listing', icon: Megaphone, note: 'Boost a marketplace listing.' },
];

export default function UpgradesStore() {
  const [cat, setCat] = useState(null);
  const [ent, setEnt] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');

  const loadMine = () => axios.get(`${API_URL}/api/monetization/my`, { headers: authHeaders() })
    .then(({ data }) => setEnt(data.entitlements)).catch(() => {});
  useEffect(() => {
    axios.get(`${API_URL}/api/monetization/catalog`, { headers: authHeaders() })
      .then(({ data }) => setCat(data)).catch(() => setCat(false));
    loadMine();
  }, []);

  const buy = async (sku) => {
    setBusy(sku); setMsg('');
    try {
      const { data } = await axios.post(`${API_URL}/api/monetization/purchase`, { sku }, { headers: authHeaders() });
      setMsg(data.message || 'Order created.');
      loadMine();
    } catch { setMsg('Could not start the purchase. Please try again.'); }
    finally { setBusy(''); }
  };

  if (!cat) return null;
  const configured = cat.payments_configured;

  return (
    <div className="space-y-5" data-testid="upgrades-store">
      {ent && (
        <div className="lux-glass p-4 flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--lux-text-muted)' }}>
          <span className="lux-eyebrow">Your upgrades</span>
          <span className="flex items-center gap-1"><HardDrive className="w-4 h-4" style={{ color: '#E8C97A' }} /> +{ent.storage_bonus_gb || 0} GB add-on</span>
          <span className="flex items-center gap-1"><Star className="w-4 h-4" style={{ color: ent.featured ? '#E8C97A' : 'var(--lux-border)' }} /> {ent.featured ? 'Featured active' : 'Not featured'}</span>
        </div>
      )}
      {!configured && (
        <div className="lux-glass p-3 text-xs" style={{ color: '#E8C97A', border: '1px solid rgba(212,175,55,0.35)' }}>
          Payment integration pending configuration — you can preview pricing; checkout activates once payments are set up.
        </div>
      )}
      {msg && <div className="lux-glass p-3 text-sm" style={{ color: 'var(--lux-text)' }} data-testid="upgrades-msg">{msg}</div>}

      {SECTIONS.map((sec) => {
        const items = (cat.catalog || {})[sec.key] || [];
        if (!items.length) return null;
        const I = sec.icon;
        return (
          <div key={sec.key}>
            <div className="flex items-center gap-1.5 mb-1"><I className="w-4 h-4" style={{ color: '#E8C97A' }} /><span className="lux-eyebrow">{sec.label}</span></div>
            <p className="text-xs mb-2" style={{ color: 'var(--lux-text-faint)' }}>{sec.note}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {items.map((it) => (
                <div key={it.sku} className="lux-glass p-4 flex flex-col" data-testid={`sku-${it.sku}`}>
                  <div className="font-display text-lg" style={{ color: 'var(--lux-text)' }}>{it.label}</div>
                  <div className="text-gold font-display text-xl my-1">{inr(it.price_inr)}</div>
                  <button onClick={() => buy(it.sku)} disabled={busy === it.sku}
                    className="lux-btn text-xs mt-auto disabled:opacity-50" data-testid={`buy-${it.sku}`}>
                    {busy === it.sku ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    {configured ? 'Purchase' : 'Preview'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
